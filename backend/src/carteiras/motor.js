"use strict";

const crypto = require("node:crypto");
const { somarDiasUteis, diasUteisEntre } = require("./calendario");
const { CONTAS, ESPECIFICACOES, valorDoPonto } = require("./especificacoes");
const { LADO_DA_ENTRADA, validarIntencao } = require("./intencao");
const { sinal, niveis, planejarEntradaAutomatica, conferirPlanoDoOperador, truncar } = require("./risco");
const { PADRAO_POR_ATIVO } = require("./parametros");

// O MOTOR ÚNICO das três trilhas (ADR 0127). Puro: recebe o estado, as intenções e o mercado; não lê nem grava nada.
//
//   decidir(D)   intenções + mercado até D−1 + parâmetros + travas -> ordens para o ajuste de D, e os bloqueios
//   liquidar(D)  ordens de D + a barra de D (ajuste, máxima, mínima, médio) -> execuções, lançamentos, novo estado
//
// A decisão nunca vê o preço de D: o mercado dela é o de D−1 (o ATR, o contrato e o valor do ponto). A liquidação
// avalia primeiro o stop e os alvos das posições que já existiam (pela mínima e máxima do dia; stop e alvo no mesmo dia:
// conta o stop; o dia inteiro além do stop: saída ao preço médio), depois executa as ordens no ajuste (mais a slippage)
// ou no preço informado pelo operador (conferido contra a faixa do dia), e marca o resto no ajuste.

const arred2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const arred6 = (v) => Math.round(v * 1e6) / 1e6;

function saida(pos, motivo, origem = null) {
  return { tipo: "SAIDA", motivo, ativo: pos.ativo, lado: pos.lado, posicaoId: pos.id, contrato: pos.contrato, quantidade: pos.quantidadeAberta, origem };
}

// A conferência de uma entrada nova contra as travas, as vagas e o mercado. -> null (pode) ou o motivo do bloqueio.
function motivoDeBloqueioDaEntrada({ data, ativo, mercado, parametros, travas, vagas, jaTemPosicao, feriados }) {
  if (jaTemPosicao) return "JA_TEM_POSICAO";
  if (travas?.bloqueiaNovasEntradas) return "TRAVA";
  if (vagas <= 0) return "MAX_POSICOES";
  const m = mercado[ativo];
  if (!m?.contrato) return "SEM_CONTRATO";
  if (diasUteisEntre(data, m.contrato.limite, feriados) < parametros.ativos[ativo].diasUteisMinimosAteOLimite) return "VENCIMENTO_PROXIMO";
  if (m.atr == null || !(m.atr > 0)) return "SEM_ATR";
  if (!(m.valorDoPonto > 0)) return "SEM_CAMBIO";
  return null;
}

// `estado`: { patrimonio (de D−1), posicoes: [posição aberta] }. `mercado`: { ATIVO: { contrato: { ticker, limite },
// atr, valorDoPonto } | null } até D−1. `travas`: o resultado de travas.js::avaliarTravas. -> { ordens, bloqueios }.
function decidir({ data, estado, intencoes, mercado, parametros, travas = null, feriados = [] }) {
  const ordens = [];
  const bloqueios = [];
  const bloquear = (intencao, motivo, detalhe = null) => bloqueios.push({ ativo: intencao.ativo, acao: intencao.acao, trilha: intencao.trilha, motivo, detalhe });
  const posicoes = estado.posicoes || [];
  const porAtivo = new Map(posicoes.map((pos) => [pos.ativo, pos]));
  const saindo = new Set();

  // 1. O vencimento vem antes de tudo: a posição sai N dias úteis antes do limite do contrato (15 nos ativos da
  // Cartilha, 2 no dólar), sem rolar (D13). Um ativo que saiu da carteira com posição aberta usa o padrão dele.
  for (const pos of posicoes) {
    const regra = parametros.ativos[pos.ativo] || PADRAO_POR_ATIVO[pos.ativo];
    const encerrarEm = somarDiasUteis(pos.contrato.limite, -regra.diasUteisEncerrarAntesDoLimite, feriados);
    if (data >= encerrarEm) {
      ordens.push(saida(pos, "VENCIMENTO"));
      saindo.add(pos.id);
    }
  }

  // 2. Manter, reduzir e zerar. Nunca bloqueados por trava: reduzem o risco.
  const validas = [];
  for (const intencao of intencoes) {
    if (!parametros.ativos[intencao.ativo]) {
      bloquear(intencao, "ATIVO_FORA_DA_CARTEIRA");
      continue;
    }
    const pos = porAtivo.get(intencao.ativo);
    const erros = validarIntencao(intencao, { comPosicao: Boolean(pos) });
    if (erros.length) {
      bloquear(intencao, "INTENCAO_INVALIDA", erros.join(" "));
      continue;
    }
    validas.push(intencao);
    if (!pos || saindo.has(pos.id)) continue;
    if (intencao.acao === "ZERAR") {
      ordens.push(saida(pos, "INTENCAO", intencao.origem));
      saindo.add(pos.id);
    } else if (intencao.acao === "REDUZIR") {
      if (pos.reduzida) bloquear(intencao, "JA_REDUZIDA");
      else {
        const quantidade = truncar((pos.quantidadeAberta * parametros.carteira.fracaoReduzirPct) / 100);
        ordens.push({ tipo: "REDUCAO", motivo: "INTENCAO", ativo: pos.ativo, lado: pos.lado, posicaoId: pos.id, contrato: pos.contrato, quantidade, origem: intencao.origem });
      }
    }
  }

  // 3. Entradas, pela prioridade, enquanto houver vaga (as saídas de hoje liberam vaga no mesmo ajuste).
  let vagas = parametros.carteira.maxPosicoes - posicoes.filter((pos) => !saindo.has(pos.id)).length;
  const entradas = validas.filter((i) => LADO_DA_ENTRADA[i.acao] && !porAtivo.has(i.ativo)).sort((a, b) => a.prioridade - b.prioridade);
  for (const intencao of entradas) {
    const motivo = motivoDeBloqueioDaEntrada({
      data,
      ativo: intencao.ativo,
      mercado,
      parametros,
      travas,
      vagas,
      jaTemPosicao: porAtivo.has(intencao.ativo),
      feriados
    });
    if (motivo) {
      bloquear(intencao, motivo, motivo === "TRAVA" ? travas.travas.map((t) => t.codigo).join(", ") : null);
      continue;
    }
    const m = mercado[intencao.ativo];
    const paramAtivo = parametros.ativos[intencao.ativo];
    const plano = planejarEntradaAutomatica({
      atr: m.atr,
      paramAtivo,
      patrimonio: estado.patrimonio,
      valorDoPonto: m.valorDoPonto,
      fatorOvernight: parametros.carteira.fatorOvernight
    });
    if (!plano.rrOk) {
      bloquear(intencao, "RR_MINIMO", `alvo 2 em ${paramAtivo.alvo2R}R; mínimo ${paramAtivo.rrMinimo}`);
      continue;
    }
    if (!(plano.quantidade > 0)) {
      bloquear(intencao, "QUANTIDADE_ZERO");
      continue;
    }
    vagas -= 1;
    ordens.push({
      tipo: "ENTRADA",
      motivo: "INTENCAO",
      ativo: intencao.ativo,
      lado: LADO_DA_ENTRADA[intencao.acao],
      contrato: m.contrato,
      quantidade: plano.quantidade,
      distancia: plano.distancia,
      risco1RPrevisto: plano.risco1R,
      contratosInteiros: plano.contratosInteiros,
      origem: intencao.origem,
      prioridade: intencao.prioridade
    });
  }
  return { ordens, bloqueios };
}

// A barra do dia com máxima e mínima (sem elas, o ajuste nas duas).
function faixaDa(barra) {
  return { maxima: barra.maxima ?? barra.ajuste, minima: barra.minima ?? barra.ajuste };
}

// `estado`: { patrimonio (de D−1), posicoes }. `ordens`: as decididas para D (com `precoInformado`, as do operador).
// `barras`: { TICKER: { ajuste, maxima?, minima?, medio? } } de D. `cambio`: a PTAX de D (café e soja na B3).
// `taxaCaixaDia`: o rendimento do caixa no dia (a Selic diária, em fração). -> { pendente } (falta o câmbio) ou
// { estado, resolucoes, lancamentos, eventos, encerradas }.
function liquidar({ data, estado, ordens = [], barras = {}, parametros, cambio = null, taxaCaixaDia = 0, gerarId = () => crypto.randomUUID() }) {
  const conta = parametros.conta;
  const ativosDoDia = new Set([...(estado.posicoes || []).map((p) => p.ativo), ...ordens.map((o) => o.ativo)]);
  for (const ativo of ativosDoDia) {
    if (valorDoPonto(ativo, conta, cambio) == null) return { pendente: "SEM_CAMBIO" };
  }
  const vp = (ativo) => valorDoPonto(ativo, conta, cambio);
  const slip = (ativo) => (parametros.ativos[ativo]?.slippageTicks ?? 0) * ESPECIFICACOES[ativo].tick;
  const custoUnitario = (ativo) => parametros.ativos[ativo]?.custoPorContrato ?? 0;

  const posicoes = (estado.posicoes || []).map((p) => ({ ...p }));
  const lancamentos = [];
  const eventos = [];
  const encerradas = [];
  const resolucoes = [];
  const ajusteDoDia = new Map(); // id da posição -> resultado da marcação no dia, na moeda da conta

  const lancar = (pos, tipo, valor, descricao) => {
    const v = arred2(valor);
    if (v === 0) return;
    // O câmbio só nos ativos cotados em outra moeda (o café e a soja na B3).
    const convertido = pos && ESPECIFICACOES[pos.ativo].moedaPreco !== CONTAS[conta].moeda;
    lancamentos.push({ data, tipo, ativo: pos?.ativo ?? null, posicaoId: pos?.id ?? null, valor: v, cambio: convertido ? cambio : null, descricao });
    if (pos) pos.resultadoMoeda = arred2((pos.resultadoMoeda || 0) + v);
  };

  // Uma execução de `quantidade` a `preco` numa posição aberta: realiza a marcação desde o último ajuste, soma o
  // resultado em R e cobra o custo.
  function executar(pos, preco, quantidade, evento) {
    const s = sinal(pos.lado);
    ajusteDoDia.set(pos.id, (ajusteDoDia.get(pos.id) || 0) + (preco - pos.ultimoAjuste) * s * quantidade * vp(pos.ativo));
    if (pos.distancia) pos.resultadoR = (pos.resultadoR || 0) + ((preco - pos.entrada) * s * quantidade) / (pos.distancia * pos.quantidadeInicial);
    pos.quantidadeAberta = arred6(pos.quantidadeAberta - quantidade);
    lancar(pos, "CUSTO", -custoUnitario(pos.ativo) * quantidade, `${evento} ${pos.ativo}: ${quantidade} a ${preco}`);
    eventos.push({ data, posicaoId: pos.id, tipo: evento, preco, quantidade });
    if (pos.quantidadeAberta <= 1e-9) {
      pos.quantidadeAberta = 0;
      pos.motivoSaida = evento;
    }
  }

  // 1. Stop e alvos das posições que já existiam, pela faixa do dia. Stop primeiro (ordem pessimista).
  for (const pos of posicoes) {
    const barra = barras[pos.contrato.ticker];
    // Sem stop (a referência comprar e segurar): nem stop nem alvo.
    if (!barra || pos.stop == null) continue;
    const s = sinal(pos.lado);
    const { maxima, minima } = faixaDa(barra);
    const contra = s > 0 ? minima : maxima;
    const aFavor = s > 0 ? maxima : minima;
    if ((contra - pos.stop) * s <= 0) {
      const gap = ((s > 0 ? maxima : minima) - pos.stop) * s < 0;
      const preco = gap ? (barra.medio ?? barra.ajuste) : pos.stop - s * slip(pos.ativo);
      executar(pos, preco, pos.quantidadeAberta, "STOP");
      continue;
    }
    if (!pos.alvo1Atingido && (aFavor - pos.alvo1) * s >= 0) {
      const parcial = Math.min(pos.quantidadeAberta, truncar((pos.quantidadeInicial * parametros.carteira.saidaAlvo1Pct) / 100));
      executar(pos, pos.alvo1, parcial, "ALVO1");
      pos.alvo1Atingido = true;
      pos.stop = s > 0 ? Math.max(pos.stop, pos.entrada) : Math.min(pos.stop, pos.entrada);
    }
    if (pos.quantidadeAberta > 0 && (aFavor - pos.alvo2) * s >= 0) executar(pos, pos.alvo2, pos.quantidadeAberta, "ALVO2");
  }

  // 2. As ordens de D.
  for (const ordem of ordens) {
    const barra = barras[ordem.contrato.ticker];
    const resolver = (situacao, motivo = null, extra = {}) => resolucoes.push({ ordem, situacao, motivo, ...extra });
    if (!barra) {
      resolver("EXPIRADA", "SEM_PREGAO");
      continue;
    }
    const s = sinal(ordem.lado);
    const { maxima, minima } = faixaDa(barra);
    const informado = ordem.precoInformado ?? null;
    if (informado != null && (informado < minima - 1e-9 || informado > maxima + 1e-9)) {
      resolver("REJEITADA", "FORA_DA_FAIXA", { faixa: { minima, maxima } });
      continue;
    }

    if (ordem.tipo === "ENTRADA") {
      if (posicoes.some((p) => p.ativo === ordem.ativo && p.quantidadeAberta > 0)) {
        resolver("REJEITADA", "JA_TEM_POSICAO");
        continue;
      }
      const preco = informado ?? barra.ajuste + s * slip(ordem.ativo);
      const semStop = ordem.semStop === true;
      const distancia = semStop ? null : ordem.stopInformado != null ? (preco - ordem.stopInformado) * s : ordem.distancia;
      if (!semStop && !(distancia > 0)) {
        resolver("REJEITADA", "STOP_DO_LADO_ERRADO");
        continue;
      }
      const pos = {
        id: gerarId(),
        ativo: ordem.ativo,
        lado: ordem.lado,
        contrato: ordem.contrato,
        dataEntrada: data,
        entrada: preco,
        distancia,
        ...(semStop ? { stop: null, alvo1: null, alvo2: null } : niveis(ordem.lado, preco, distancia, parametros.ativos[ordem.ativo])),
        quantidadeInicial: ordem.quantidade,
        quantidadeAberta: ordem.quantidade,
        risco1R: semStop ? null : arred2(ordem.quantidade * distancia * vp(ordem.ativo)),
        alvo1Atingido: false,
        reduzida: false,
        ultimoAjuste: preco,
        resultadoR: semStop ? null : 0,
        resultadoMoeda: 0
      };
      pos.stopInicial = pos.stop;
      posicoes.push(pos);
      lancar(pos, "CUSTO", -custoUnitario(pos.ativo) * pos.quantidadeInicial, `ENTRADA ${pos.ativo}: ${pos.quantidadeInicial} a ${preco}`);
      eventos.push({ data, posicaoId: pos.id, tipo: "ENTRADA", preco, quantidade: pos.quantidadeInicial });
      resolver("EXECUTADA", null, { preco, posicaoId: pos.id });
      continue;
    }

    const pos = posicoes.find((p) => p.id === ordem.posicaoId);
    if (!pos || pos.quantidadeAberta <= 0) {
      resolver("EXPIRADA", "POSICAO_ENCERRADA");
      continue;
    }
    const preco = informado ?? barra.ajuste - sinal(pos.lado) * slip(pos.ativo);
    const quantidade = ordem.tipo === "SAIDA" ? pos.quantidadeAberta : Math.min(ordem.quantidade, pos.quantidadeAberta);
    executar(pos, preco, quantidade, ordem.tipo === "SAIDA" ? ordem.motivo : "REDUCAO");
    if (ordem.tipo === "REDUCAO") pos.reduzida = true;
    resolver("EXECUTADA", null, { preco, quantidade, posicaoId: pos.id });
  }

  // 3. A marcação no ajuste do que segue aberto; um lançamento por posição e dia.
  for (const pos of posicoes) {
    const barra = barras[pos.contrato.ticker];
    if (barra && pos.quantidadeAberta > 0) {
      const s = sinal(pos.lado);
      ajusteDoDia.set(pos.id, (ajusteDoDia.get(pos.id) || 0) + (barra.ajuste - pos.ultimoAjuste) * s * pos.quantidadeAberta * vp(pos.ativo));
      pos.ultimoAjuste = barra.ajuste;
    }
    if (ajusteDoDia.has(pos.id)) lancar(pos, "AJUSTE_DIARIO", ajusteDoDia.get(pos.id), `Ajuste ${pos.ativo} ${pos.contrato.ticker}`);
  }

  // 4. O rendimento do caixa: a Selic do dia sobre o patrimônio inteiro (ADR 0127, §5).
  lancar(null, "RENDIMENTO_CAIXA", estado.patrimonio * taxaCaixaDia, "Selic sobre o patrimônio");

  const abertas = [];
  for (const pos of posicoes) {
    if (pos.quantidadeAberta > 0) abertas.push(pos);
    else encerradas.push({ ...pos, dataSaida: data, resultadoR: pos.resultadoR == null ? null : Math.round(pos.resultadoR * 1e4) / 1e4 });
  }
  const patrimonio = arred2(estado.patrimonio + lancamentos.reduce((soma, l) => soma + l.valor, 0));
  return { estado: { patrimonio, posicoes: abertas }, resolucoes, lancamentos, eventos, encerradas };
}

// O operador: o plano dele conferido (risco.js) e as vagas e travas do dia. -> { aprovado, verificacoes, plano }.
function conferirEntradaDoOperador({ data, ativo, lado, entrada, stop, estado, mercado, parametros, travas = null, feriados = [] }) {
  const m = mercado[ativo];
  const conferencia = conferirPlanoDoOperador({
    lado,
    entrada,
    stop,
    atr: m?.atr ?? null,
    paramAtivo: parametros.ativos[ativo],
    patrimonio: estado.patrimonio,
    valorDoPonto: m?.valorDoPonto ?? 0,
    fatorOvernight: parametros.carteira.fatorOvernight
  });
  const posicoes = estado.posicoes || [];
  const motivo = motivoDeBloqueioDaEntrada({
    data,
    ativo,
    mercado,
    parametros,
    travas,
    vagas: parametros.carteira.maxPosicoes - posicoes.length,
    jaTemPosicao: posicoes.some((p) => p.ativo === ativo),
    feriados
  });
  const verificacoes = [...conferencia.verificacoes, { codigo: "VAGAS_E_TRAVAS", ok: !motivo, detalhe: motivo || "Vaga livre, sem trava." }];
  return { aprovado: verificacoes.every((v) => v.ok), verificacoes, plano: conferencia.plano };
}

module.exports = { decidir, liquidar, conferirEntradaDoOperador };
