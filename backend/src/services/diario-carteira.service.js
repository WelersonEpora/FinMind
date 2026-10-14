"use strict";

const carteiraRepository = require("../repositories/carteira.repository");
const carteiraRodadaRepository = require("../repositories/carteira-rodada.repository");
const mercadoCarteiraService = require("./mercado-carteira.service");
const { resolverVigenteComVersao } = require("../carteiras/parametros");
const { conferirEntradaDoOperador } = require("../carteiras/motor");
const { avaliarTravas } = require("../carteiras/travas");
const { truncar } = require("../carteiras/risco");
const { somarDiasUteis } = require("../carteiras/calendario");
const { CHECKLIST, montarChecklist, validarMovimentoDeStop, aplicarMovimentosDeStop, faseDaOperacao } = require("../carteiras/diario");
const { NotFoundError, ValidationError, ConflictError } = require("../shared/errors");
const { hojeEmSaoPaulo } = require("./carteira.service");

// O DIÁRIO DO OPERADOR (ADR 0127, §7; etapa 6). O operador registra à mão, ao longo do dia, as operações dele na rodada
// ainda não liquidada (normalmente a de hoje): a entrada com o preço e o stop (o sistema confere o piso de ATR, o R:R, o
// tamanho, as vagas e as travas, e calcula a quantidade e os alvos da Tabela 2), a saída (reduzir ou zerar, com o preço)
// e o stop movido a favor. Tudo vira ordem ou evento da trilha OPERADOR; a liquidação executa no preço informado,
// conferido contra a mínima e a máxima do dia, e aplica o stop e os alvos como nas outras trilhas.
//
// A conferência usa o MESMO mercado das trilhas automáticas no dia: a leitura até o ajuste de D−1, no instante em que a
// rodada foi decidida. Cada escrita roda com a rodada travada (a liquidação trava a mesma linha). O registro tardio (dias
// já liquidados) fica para depois (decisão do usuário, 2026-10-14).

const plano = (registro) => (typeof registro?.get === "function" ? registro.get({ plain: true }) : registro);
const LADOS = ["COMPRADO", "VENDIDO"];

async function contexto(workspaceId, carteiraId, deps) {
  const repo = (deps.carteiraRepository || carteiraRepository).forWorkspace(workspaceId);
  const carteira = plano(await repo.buscar(carteiraId));
  if (!carteira) throw new NotFoundError("Carteira não encontrada.");
  const [trilhas, versoes] = await Promise.all([repo.listarTrilhas(carteiraId), repo.listarVersoes(carteiraId)]);
  const operador = trilhas.map(plano).find((t) => t.tipo === "OPERADOR");
  if (!operador) throw new NotFoundError("A carteira não tem a trilha do operador.");
  const rRepo = (deps.carteiraRodadaRepository || carteiraRodadaRepository).forWorkspace(workspaceId);
  return { carteira, operador, versoes: versoes.map(plano), rRepo };
}

// O dia em que o operador pode registrar: o da rodada mais recente, se ainda não foi liquidada e é de hoje ou do dia útil
// anterior (antes das 06h30, a de ontem ainda está aberta). -> { aberto, data, rodada, motivo }.
async function diaDeRegistro(carteira, rRepo, hoje) {
  const ultima = await rRepo.ultimaRodada(carteira.id);
  if (!ultima) return { aberto: false, motivo: hoje < carteira.data_inicio ? "AGUARDANDO_INICIO" : "SEM_RODADA" };
  if (ultima.liquidacao !== "PENDENTE") return { aberto: false, data: ultima.data, motivo: "RODADA_LIQUIDADA" };
  const pendentes = await rRepo.listarPendentes(carteira.id);
  if (pendentes.some((r) => r.data < ultima.data)) return { aberto: false, data: ultima.data, motivo: "LIQUIDACAO_ANTERIOR_PENDENTE" };
  if (ultima.data < somarDiasUteis(hoje, -1)) return { aberto: false, data: ultima.data, motivo: "ROTINA_ATRASADA" };
  return { aberto: true, data: ultima.data, rodada: ultima };
}

// Tudo o que a conferência de uma entrada precisa no dia: parâmetros, mercado, estado da trilha e travas.
async function cenarioDoDia({ carteira, operador, versoes, rRepo }, dia, deps, { transaction } = {}) {
  const vigente = resolverVigenteComVersao(versoes, dia.data);
  if (!vigente) throw new ConflictError(`Nenhuma versão de parâmetros vigente em ${dia.data}.`);
  const { parametros } = vigente;
  const mercadoService = deps.mercadoCarteiraService || mercadoCarteiraService;
  const { mercado } = await mercadoService.lerMercadoParaDecisao(
    { data: dia.data, conta: carteira.conta, ativos: Object.keys(parametros.ativos), parametros, agora: new Date(dia.rodada.decidida_em) },
    deps
  );
  const serie = await rRepo.seriePatrimonio(operador.id, { ate: dia.data, limite: 60 }, { transaction });
  const patrimonio = serie.length ? serie[serie.length - 1].patrimonio : Number(carteira.capital_inicial);
  const posicoes = await rRepo.posicoesAbertas(operador.id, { transaction });
  const criadas = await rRepo.ordensCriadasDaTrilha(operador.id, dia.rodada.id, { transaction });
  const travas = avaliarTravas({ data: dia.data, serie, encerradas: await rRepo.encerradas(operador.id, { transaction }), retomadas: [], parametros });
  return { parametros, mercado, patrimonio, posicoes, criadas, travas };
}

// A conferência de uma entrada. As entradas já planejadas no dia ocupam vaga e o ativo (`ignorarOrdemId`: a que está
// sendo editada); uma saída planejada não libera vaga no mesmo dia.
function conferir(cenario, dia, { ativo, lado, entrada, stop }, { ignorarOrdemId = null } = {}) {
  const erros = [];
  if (!cenario.parametros.ativos[ativo]) erros.push(`"ativo" deve ser um da carteira: ${Object.keys(cenario.parametros.ativos).join(", ")}.`);
  if (!LADOS.includes(lado)) erros.push(`"lado" deve ser ${LADOS.join(" ou ")}.`);
  if (!(Number.isFinite(entrada) && entrada > 0)) erros.push('"entrada" deve ser um número maior que 0.');
  if (!(Number.isFinite(stop) && stop > 0)) erros.push('"stop" deve ser um número maior que 0.');
  if (erros.length) throw new ValidationError("Entrada inválida.", { erros });

  const planejadas = cenario.criadas.filter((o) => o.tipo === "ENTRADA" && o.id !== ignorarOrdemId).map((o) => ({ ativo: o.ativo }));
  const estado = { patrimonio: cenario.patrimonio, posicoes: [...cenario.posicoes, ...planejadas] };
  const r = conferirEntradaDoOperador({ data: dia.data, ativo, lado, entrada, stop, estado, mercado: cenario.mercado, parametros: cenario.parametros, travas: cenario.travas });
  const m = cenario.mercado[ativo];
  return {
    aprovado: r.aprovado,
    verificacoes: r.verificacoes,
    plano: r.plano
      ? { quantidade: r.plano.quantidade, distancia: r.plano.distancia, stop, alvo1: r.plano.alvo1, alvo2: r.plano.alvo2, risco1R: r.plano.risco1R, riscoMaximo: r.plano.riscoMaximo, contratosInteiros: r.plano.contratosInteiros }
      : null,
    contrato: m?.contrato ?? null
  };
}

const numero = (v) => (v === "" || v == null ? NaN : Number(String(v).replace(",", ".")));
const dadosDaEntrada = (corpo) => ({ ativo: corpo.ativo, lado: corpo.lado, entrada: numero(corpo.entrada), stop: numero(corpo.stop) });

async function diaAbertoOuErro(carteira, rRepo, deps) {
  const dia = await diaDeRegistro(carteira, rRepo, deps.hoje || hojeEmSaoPaulo(deps.agora));
  if (!dia.aberto) throw new ConflictError("Nenhum dia aberto para registro agora.", { motivo: dia.motivo, data: dia.data ?? null });
  return dia;
}

// Dentro da transação: a rodada travada ainda é a do dia e segue pendente.
function conferirRodadaTravada(rodada, dia) {
  if (!rodada || rodada.id !== dia.rodada.id || rodada.liquidacao !== "PENDENTE") throw new ConflictError("O dia acabou de ser liquidado: recarregue o diário.");
}

// POST .../diario/conferencia: a conferência sem gravar nada (a prévia do formulário).
async function conferirEntrada(workspaceId, carteiraId, corpo = {}, deps = {}) {
  const ctx = await contexto(workspaceId, carteiraId, deps);
  const dia = await diaAbertoOuErro(ctx.carteira, ctx.rRepo, deps);
  const cenario = await cenarioDoDia(ctx, dia, deps);
  return { conferencia: { data: dia.data, ...conferir(cenario, dia, dadosDaEntrada(corpo), { ignorarOrdemId: corpo.ordemId ?? null }) } };
}

// A entrada gravada como ordem da rodada do dia, com o checklist e a conferência; `substituir`: a planejada que ela
// substitui (a edição).
async function registrarEntradaNaTransacao(ctx, dia, userId, corpo, deps, { substituir = null } = {}) {
  return ctx.rRepo.comRodadaTravada(dia.rodada.id, async ({ rodada, transaction }) => {
    conferirRodadaTravada(rodada, dia);
    let anterior = null;
    if (substituir) {
      anterior = await ctx.rRepo.buscarOrdem(substituir, ctx.operador.id, { transaction });
      if (!anterior || anterior.tipo !== "ENTRADA" || anterior.situacao !== "CRIADA" || anterior.rodadaId !== dia.rodada.id) {
        throw new ConflictError("Só uma entrada planejada para o dia aberto pode ser editada.");
      }
    }
    const cenario = await cenarioDoDia(ctx, dia, deps, { transaction });
    const dados = dadosDaEntrada(corpo);
    const r = conferir(cenario, dia, dados, { ignorarOrdemId: anterior?.id ?? null });
    if (!r.aprovado) throw new ValidationError("A entrada não passou na conferência.", { verificacoes: r.verificacoes });
    const checklist = montarChecklist(corpo.checklist ?? {}, r.verificacoes);
    if (checklist.erros.length) throw new ValidationError("Checklist inválido.", { erros: checklist.erros });

    const agora = (deps.agora || new Date()).toISOString();
    if (anterior) {
      await ctx.rRepo.atualizarOrdemCriada(
        anterior.id,
        { situacao: "CANCELADA", motivo_situacao: "EDITADA", detalhes: { ...(anterior.detalhes || {}), canceladaPor: userId, canceladaEm: agora } },
        { transaction }
      );
    }
    const ordem = await ctx.rRepo.criarOrdem(
      {
        rodadaId: dia.rodada.id,
        trilhaId: ctx.operador.id,
        dataExecucao: dia.data,
        ativo: dados.ativo,
        tipo: "ENTRADA",
        motivo: "OPERADOR",
        lado: dados.lado,
        contrato: r.contrato,
        quantidade: r.plano.quantidade,
        distancia: r.plano.distancia,
        precoInformado: dados.entrada,
        stopInformado: dados.stop,
        detalhes: {
          origem: "OPERADOR",
          checklist: checklist.itens,
          aderente: checklist.aderente,
          verificacoes: r.verificacoes,
          plano: { alvo1: r.plano.alvo1, alvo2: r.plano.alvo2, risco1RPrevisto: r.plano.risco1R, contratosInteiros: r.plano.contratosInteiros },
          registradoPor: userId,
          registradoEm: agora,
          substitui: anterior?.id ?? null
        }
      },
      { transaction }
    );
    return { ordem };
  });
}

// POST .../diario/entradas
async function registrarEntrada(workspaceId, carteiraId, userId, corpo = {}, deps = {}) {
  const ctx = await contexto(workspaceId, carteiraId, deps);
  const dia = await diaAbertoOuErro(ctx.carteira, ctx.rRepo, deps);
  return registrarEntradaNaTransacao(ctx, dia, userId, corpo, deps);
}

// PUT .../diario/ordens/:ordemId: a entrada planejada editada. A antiga fica CANCELADA (motivo EDITADA) e uma nova entra
// no lugar: a ordem que a liquidação lê nunca muda por baixo dela.
async function editarEntrada(workspaceId, carteiraId, ordemId, userId, corpo = {}, deps = {}) {
  const ctx = await contexto(workspaceId, carteiraId, deps);
  const dia = await diaAbertoOuErro(ctx.carteira, ctx.rRepo, deps);
  return registrarEntradaNaTransacao(ctx, dia, userId, corpo, deps, { substituir: ordemId });
}

// POST .../diario/ordens/:ordemId/cancelamento: uma ordem do operador que ainda aguarda a liquidação (entrada ou saída).
async function cancelarOrdem(workspaceId, carteiraId, ordemId, userId, deps = {}) {
  const ctx = await contexto(workspaceId, carteiraId, deps);
  const dia = await diaAbertoOuErro(ctx.carteira, ctx.rRepo, deps);
  return ctx.rRepo.comRodadaTravada(dia.rodada.id, async ({ rodada, transaction }) => {
    conferirRodadaTravada(rodada, dia);
    const ordem = await ctx.rRepo.buscarOrdem(ordemId, ctx.operador.id, { transaction });
    if (!ordem) throw new NotFoundError("Ordem não encontrada no diário.");
    if (ordem.situacao !== "CRIADA" || ordem.rodadaId !== dia.rodada.id || ordem.motivo !== "OPERADOR") {
      throw new ConflictError("Só uma ordem do operador que ainda aguarda a liquidação pode ser cancelada.");
    }
    const agora = (deps.agora || new Date()).toISOString();
    await ctx.rRepo.atualizarOrdemCriada(
      ordem.id,
      { situacao: "CANCELADA", motivo_situacao: "CANCELADA_PELO_OPERADOR", detalhes: { ...(ordem.detalhes || {}), canceladaPor: userId, canceladaEm: agora } },
      { transaction }
    );
    return { ordem: { ...ordem, situacao: "CANCELADA" } };
  });
}

async function posicaoAbertaDoOperador(ctx, posicaoId, transaction) {
  const pos = await ctx.rRepo.buscarPosicao(posicaoId, ctx.operador.id, { transaction });
  if (!pos) throw new NotFoundError("Posição não encontrada no diário.");
  if (pos.situacao !== "ABERTA") throw new ConflictError("A posição já foi encerrada.");
  return pos;
}

// POST .../diario/posicoes/:posicaoId/saidas: { acao: ZERAR | REDUZIR, preco }. Reduzir: a fração da carteira
// (`fracaoReduzirPct`), uma vez por operação. Uma saída por posição e dia (a do vencimento conta).
async function registrarSaida(workspaceId, carteiraId, posicaoId, userId, corpo = {}, deps = {}) {
  const acao = corpo.acao;
  const preco = numero(corpo.preco);
  const erros = [];
  if (!["ZERAR", "REDUZIR"].includes(acao)) erros.push('"acao" deve ser ZERAR ou REDUZIR.');
  if (!(Number.isFinite(preco) && preco > 0)) erros.push('"preco" deve ser um número maior que 0.');
  if (erros.length) throw new ValidationError("Saída inválida.", { erros });

  const ctx = await contexto(workspaceId, carteiraId, deps);
  const dia = await diaAbertoOuErro(ctx.carteira, ctx.rRepo, deps);
  return ctx.rRepo.comRodadaTravada(dia.rodada.id, async ({ rodada, transaction }) => {
    conferirRodadaTravada(rodada, dia);
    const pos = await posicaoAbertaDoOperador(ctx, posicaoId, transaction);
    const criadas = await ctx.rRepo.ordensCriadasDaTrilha(ctx.operador.id, dia.rodada.id, { transaction });
    if (criadas.some((o) => o.posicaoId === pos.id)) throw new ConflictError("Já há uma saída desta posição para hoje: cancele-a antes de registrar outra.");
    if (acao === "REDUZIR" && pos.reduzida) throw new ConflictError("Esta operação já foi reduzida uma vez.");
    const { parametros } = resolverVigenteComVersao(ctx.versoes, dia.data);
    const quantidade = acao === "ZERAR" ? pos.quantidadeAberta : truncar((pos.quantidadeAberta * parametros.carteira.fracaoReduzirPct) / 100);
    if (!(quantidade > 0)) throw new ConflictError("Quantidade zero para reduzir.");
    const ordem = await ctx.rRepo.criarOrdem(
      {
        rodadaId: dia.rodada.id,
        trilhaId: ctx.operador.id,
        dataExecucao: dia.data,
        ativo: pos.ativo,
        tipo: acao === "ZERAR" ? "SAIDA" : "REDUCAO",
        motivo: "OPERADOR",
        lado: pos.lado,
        contrato: pos.contrato,
        quantidade,
        posicaoId: pos.id,
        precoInformado: preco,
        detalhes: { origem: "OPERADOR", registradoPor: userId, registradoEm: (deps.agora || new Date()).toISOString() }
      },
      { transaction }
    );
    return { ordem };
  });
}

// POST .../diario/posicoes/:posicaoId/stop: { stop }. Só a favor; vale a partir do pregão seguinte ao dia aberto (no
// mesmo dia, o stop seria escolhido já vendo o preço do dia).
async function moverStop(workspaceId, carteiraId, posicaoId, userId, corpo = {}, deps = {}) {
  const novo = numero(corpo.stop);
  const ctx = await contexto(workspaceId, carteiraId, deps);
  const dia = await diaAbertoOuErro(ctx.carteira, ctx.rRepo, deps);
  return ctx.rRepo.comRodadaTravada(dia.rodada.id, async ({ rodada, transaction }) => {
    conferirRodadaTravada(rodada, dia);
    const pos = await posicaoAbertaDoOperador(ctx, posicaoId, transaction);
    const movimentos = await ctx.rRepo.movimentosDeStop([pos.id], { transaction });
    const [comMovimentos] = aplicarMovimentosDeStop([pos], movimentos, "9999-12-31");
    const erros = validarMovimentoDeStop({ lado: pos.lado, stopVigente: comMovimentos.stop, novo, ultimoAjuste: pos.ultimoAjuste });
    if (erros.length) throw new ValidationError("Stop inválido.", { erros });
    const vigenteDesde = somarDiasUteis(dia.data, 1);
    const evento = await ctx.rRepo.registrarEvento(
      { posicaoId: pos.id, data: dia.data, tipo: "STOP_MOVIDO", preco: novo, detalhes: { de: comMovimentos.stop, vigenteDesde, registradoPor: userId } },
      { transaction }
    );
    return { evento };
  });
}

// GET .../diario: o dia aberto (com o mercado de cada ativo para o formulário), o checklist e as operações do operador,
// cada uma com a fase do ciclo, a posição, os eventos e as saídas planejadas.
async function obterDiario(workspaceId, carteiraId, deps = {}) {
  const ctx = await contexto(workspaceId, carteiraId, deps);
  const dia = await diaDeRegistro(ctx.carteira, ctx.rRepo, deps.hoje || hojeEmSaoPaulo(deps.agora));
  let doDia = { aberto: dia.aberto, data: dia.data ?? null, motivo: dia.motivo ?? null };
  if (dia.aberto) {
    const cenario = await cenarioDoDia(ctx, dia, deps);
    const planejadas = cenario.criadas.filter((o) => o.tipo === "ENTRADA").length;
    doDia = {
      ...doDia,
      patrimonio: cenario.patrimonio,
      vagas: Math.max(0, cenario.parametros.carteira.maxPosicoes - cenario.posicoes.length - planejadas),
      travas: cenario.travas.travas,
      bloqueiaNovasEntradas: cenario.travas.bloqueiaNovasEntradas,
      mercado: Object.fromEntries(
        Object.entries(cenario.mercado).map(([ativo, m]) => [
          ativo,
          m ? { contrato: m.contrato, atr: m.atr, piso: m.atr == null ? null : m.atr * cenario.parametros.ativos[ativo].pisoAtr, ajuste: m.ajuste, dataAjuste: m.dataAjuste } : null
        ])
      )
    };
  }

  const [ordens, posicoes] = await Promise.all([ctx.rRepo.ordensDaTrilha(ctx.operador.id), ctx.rRepo.listarPosicoes([ctx.operador.id])]);
  const eventos = await ctx.rRepo.eventosDasPosicoes(posicoes.map((p) => p.id));
  const porId = new Map(posicoes.map((p) => [p.id, p]));
  const operacoes = ordens
    .filter((o) => o.tipo === "ENTRADA" && o.motivoSituacao !== "EDITADA")
    .map((entrada) => {
      const posicao = entrada.posicaoId ? porId.get(entrada.posicaoId) || null : null;
      const dela = posicao ? eventos.filter((e) => e.posicaoId === posicao.id) : [];
      const movimentos = dela.filter((e) => e.tipo === "STOP_MOVIDO").map((e) => ({ posicaoId: e.posicaoId, stop: e.preco, vigenteDesde: e.detalhes?.vigenteDesde, registradoEm: e.registradoEm }));
      const ultimoMovimento = [...movimentos].sort((a, b) => (a.registradoEm < b.registradoEm ? -1 : 1)).pop() || null;
      return {
        id: entrada.id,
        fase: faseDaOperacao({ ordem: entrada, posicao, eventos: dela }),
        entrada,
        posicao,
        eventos: dela,
        saidas: posicao ? ordens.filter((o) => o.posicaoId === posicao.id && o.tipo !== "ENTRADA") : [],
        stopProgramado: ultimoMovimento && posicao?.situacao === "ABERTA" && ultimoMovimento.vigenteDesde > (dia.data ?? "") ? ultimoMovimento : null
      };
    });
  return { diario: { dia: doDia, checklist: CHECKLIST, operacoes } };
}

module.exports = { obterDiario, conferirEntrada, registrarEntrada, editarEntrada, cancelarOrdem, registrarSaida, moverStop, diaDeRegistro };
