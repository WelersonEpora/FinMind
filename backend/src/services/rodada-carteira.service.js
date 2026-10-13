"use strict";

const carteiraRepository = require("../repositories/carteira.repository");
const rodadaRepository = require("../repositories/carteira-rodada.repository");
const analiseDiariaRepository = require("../repositories/analise-diaria.repository");
const mercadoCarteiraService = require("./mercado-carteira.service");
const { resolverVigenteComVersao, pendencias } = require("../carteiras/parametros");
const { decidir, liquidar } = require("../carteiras/motor");
const { avaliarTravas } = require("../carteiras/travas");
const { intencoesDeterministicas } = require("../carteiras/regras-deterministicas");
const { intencoesPersistencia, entradasComprarESegurar } = require("../carteiras/referencias");
const { ehDiaUtil, somarDias } = require("../carteiras/calendario");
const logger = require("../shared/logger");

// A ROTINA DIÁRIA das carteiras virtuais (ADR 0127, §3): um job separado da coleta (scripts/run-carteiras.js, no cron
// às 06h30 de Brasília, depois das leituras do dia), que itera pelas carteiras ativas com a falha isolada por carteira
// (ADR 0007, §7). Para cada uma, nesta ordem:
//
//   0. os dias úteis sem rodada desde a última (a rotina não rodou) viram rodadas SEM_DECISAO, para serem liquidados;
//   1. LIQUIDAR as rodadas pendentes de dias anteriores, em ordem, no ajuste do dia de cada uma; para na primeira cujo
//      dado ainda não chegou (a seguinte depende do estado dela);
//   2. DECIDIR a rodada de hoje (dia útil), com dados até o ajuste de ontem: congela as leituras, gera as intenções de
//      cada trilha, passa pelo motor e grava as ordens para o ajuste de hoje. Com uma liquidação pendente, a rodada de
//      hoje fica SEM_DECISAO (o estado de ontem não é conhecido) e é liquidada assim mesmo.
//
// Uma rodada decidida nunca é refeita: rodar de novo no mesmo dia não faz nada. Trilhas desta etapa: a Determinística e
// as referências (caixa, comprar e segurar, Persistência). A IA entra na etapa 4 e o operador, pelo diário (etapa 6);
// até lá, as duas só rendem o caixa.

function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

const plano = (registro) => (typeof registro?.get === "function" ? registro.get({ plain: true }) : registro);

// O estado de uma trilha antes de `data`: o último patrimônio (ou o capital inicial) e as posições abertas.
async function estadoDaTrilha(rRepo, trilha, data, capitalInicial) {
  const serie = await rRepo.seriePatrimonio(trilha.id, { ate: data, limite: 60 });
  const patrimonio = serie.length ? serie[serie.length - 1].patrimonio : capitalInicial;
  const posicoes = await rRepo.posicoesAbertas(trilha.id);
  return { estado: { patrimonio, posicoes }, serie };
}

// A cópia congelada da leitura de tendência de cada ativo na data (a `analise_diaria` pode ser substituída depois).
async function congelarLeituras(ativos, data, deps) {
  const repo = deps.analiseDiariaRepository || analiseDiariaRepository;
  const leituras = [];
  const porAtivo = {};
  for (const ativo of ativos) {
    const registro = plano(await repo.buscarAnaliseDoDia(ativo, data));
    porAtivo[ativo] = registro ? registro.leituras : null;
    leituras.push(
      registro
        ? {
            ativo,
            situacao: "OK",
            analise_diaria_id: registro.id,
            data_analise: registro.data_analise,
            hash_entrada: registro.hash_entrada,
            versao_prompt: registro.versao_prompt,
            modelo: registro.modelo,
            leituras: registro.leituras,
            preco: registro.entrada?.precoReferencia ?? null
          }
        : { ativo, situacao: "AUSENTE" }
    );
  }
  return { leituras, porAtivo };
}

// As intenções de uma trilha automática no dia (nenhuma para o caixa, o operador e, até a etapa 4, a IA).
function intencoesDaTrilha(tipo, { ativos, leiturasPorAtivo, mercado, t1PorAtivo, posicoesPorAtivo }) {
  if (tipo === "DETERMINISTICA") return intencoesDeterministicas({ ativos, leiturasPorAtivo, posicoes: posicoesPorAtivo });
  if (tipo === "PERSISTENCIA") {
    const variacoes = Object.fromEntries(ativos.map((a) => [a, mercado[a]?.variacao30dPct ?? null]));
    return intencoesPersistencia({ ativos, variacoes, t1PorAtivo, posicoes: posicoesPorAtivo });
  }
  return [];
}

const TRILHAS_QUE_DECIDEM = Object.freeze(["DETERMINISTICA", "PERSISTENCIA", "COMPRAR_E_SEGURAR"]);

async function decidirRodada({ carteira, trilhas, versoes, data, agora }, rRepo, deps) {
  const vigente = resolverVigenteComVersao(versoes, data);
  if (!vigente) throw new Error(`Nenhuma versão de parâmetros vigente em ${data}.`);
  const { parametros } = vigente;
  const ativos = Object.keys(parametros.ativos);
  const { leituras, porAtivo: leiturasPorAtivo } = await congelarLeituras(ativos, data, deps);
  const mercadoService = deps.mercadoCarteiraService || mercadoCarteiraService;
  const { mercado, semMercado, t1PorAtivo } = await mercadoService.lerMercadoParaDecisao({ data, conta: carteira.conta, ativos, parametros, agora }, deps);

  const intencoes = [];
  const ordens = [];
  for (const trilha of trilhas.filter((t) => TRILHAS_QUE_DECIDEM.includes(t.tipo))) {
    const { estado, serie } = await estadoDaTrilha(rRepo, trilha, data, Number(carteira.capital_inicial));
    const posicoesPorAtivo = Object.fromEntries(estado.posicoes.map((p) => [p.ativo, p]));
    const travas = trilha.tipo === "COMPRAR_E_SEGURAR" ? null : avaliarTravas({ data, serie, encerradas: await rRepo.encerradas(trilha.id), retomadas: [], parametros });
    const daTrilha = intencoesDaTrilha(trilha.tipo, { ativos, leiturasPorAtivo, mercado, t1PorAtivo, posicoesPorAtivo });
    const decisao = decidir({ data, estado, intencoes: daTrilha, mercado, parametros, travas });
    const ordensDaTrilha = [...decisao.ordens];
    if (trilha.tipo === "COMPRAR_E_SEGURAR") ordensDaTrilha.push(...entradasComprarESegurar({ ativos, estado, mercado }));

    for (const i of daTrilha) {
      const bloqueio = decisao.bloqueios.find((b) => b.ativo === i.ativo);
      const virouOrdem = decisao.ordens.some((o) => o.ativo === i.ativo && o.motivo === "INTENCAO");
      intencoes.push({
        trilha_id: trilha.id,
        ativo: i.ativo,
        acao: i.acao,
        prioridade: i.prioridade,
        origem: i.origem,
        referencia: i.referencia,
        resultado: bloqueio ? "BLOQUEADA" : virouOrdem ? "ORDEM" : "SEM_ORDEM",
        motivo_bloqueio: bloqueio?.motivo ?? null,
        detalhe_bloqueio: bloqueio?.detalhe ?? null
      });
    }
    for (const o of ordensDaTrilha) {
      ordens.push({
        ...o,
        trilhaId: trilha.id,
        detalhes: { origem: o.origem ?? null, prioridade: o.prioridade ?? null, risco1RPrevisto: o.risco1RPrevisto ?? null, contratosInteiros: o.contratosInteiros ?? null, travas: travas?.travas ?? [] }
      });
    }
  }

  return rRepo.criarRodada({
    carteiraId: carteira.id,
    data,
    decisao: "DECIDIDA",
    parametrosVersao: vigente.versao,
    detalhes: { semMercado, pendencias: pendencias(parametros), leiturasAusentes: leituras.filter((l) => l.situacao === "AUSENTE").map((l) => l.ativo) },
    leituras,
    intencoes,
    ordens
  });
}

async function liquidarRodada({ carteira, trilhas, versoes, rodada, hoje, agora }, rRepo, deps) {
  const { parametros } = resolverVigenteComVersao(versoes, rodada.data) || resolverVigenteComVersao(versoes, "9999-12-31");
  const ordensDoDia = await rRepo.ordensCriadas(rodada.id);
  const porTrilha = [];
  const tickers = {};
  const anotar = (ativo, contrato) => {
    tickers[ativo] = tickers[ativo] || [];
    if (!tickers[ativo].includes(contrato.ticker)) tickers[ativo].push(contrato.ticker);
  };
  for (const trilha of trilhas) {
    const { estado } = await estadoDaTrilha(rRepo, trilha, rodada.data, Number(carteira.capital_inicial));
    const ordens = ordensDoDia.filter((o) => o.trilhaId === trilha.id);
    for (const p of estado.posicoes) anotar(p.ativo, p.contrato);
    for (const o of ordens) anotar(o.ativo, o.contrato);
    porTrilha.push({ trilha, estado, ordens });
  }

  const mercadoService = deps.mercadoCarteiraService || mercadoCarteiraService;
  const mercado = await mercadoService.lerMercadoParaLiquidacao({ data: rodada.data, tickers, agora, hoje }, deps);
  if (mercado.pendente) return { pendente: mercado.pendente };

  const resultados = [];
  for (const { trilha, estado, ordens } of porTrilha) {
    const resultado = liquidar({ data: rodada.data, estado, ordens, barras: mercado.barras, parametros, cambio: mercado.cambio, taxaCaixaDia: mercado.taxaCaixaDia });
    if (resultado.pendente) return { pendente: resultado.pendente };
    resultados.push({ trilhaId: trilha.id, idsAntes: estado.posicoes.map((p) => p.id), resultado });
  }
  await rRepo.gravarLiquidacao({ rodadaId: rodada.id, data: rodada.data, trilhas: resultados });
  return { liquidada: true };
}

async function processarCarteira({ workspace_id: workspaceId, id }, { hoje, agora }, deps = {}) {
  const cRepo = (deps.carteiraRepository || carteiraRepository).forWorkspace(workspaceId);
  const rRepo = (deps.rodadaRepository || rodadaRepository).forWorkspace(workspaceId);
  const carteira = plano(await cRepo.buscar(id));
  const resumo = { carteiraId: id, nome: carteira?.nome, liquidadas: [], semDecisao: [], pendente: null, decidida: null };
  if (!carteira) return { ...resumo, erro: "Carteira não encontrada." };
  if (hoje < carteira.data_inicio) return { ...resumo, aguardandoInicio: carteira.data_inicio };
  const versoes = (await cRepo.listarVersoes(id)).map(plano);
  const trilhas = (await cRepo.listarTrilhas(id)).map(plano);
  const contexto = { carteira, trilhas, versoes, hoje, agora };

  // 0. Dias úteis sem rodada.
  const ultima = await rRepo.ultimaRodada(id);
  for (let d = ultima ? somarDias(ultima.data, 1) : carteira.data_inicio; d < hoje; d = somarDias(d, 1)) {
    if (!ehDiaUtil(d)) continue;
    await rRepo.criarRodada({ carteiraId: id, data: d, decisao: "SEM_DECISAO", detalhes: { motivo: "ROTINA_NAO_RODOU" } });
    resumo.semDecisao.push(d);
  }

  // 1. Liquidar, em ordem.
  for (const rodada of await rRepo.listarPendentes(id)) {
    if (rodada.data >= hoje) break;
    const r = await liquidarRodada({ ...contexto, rodada }, rRepo, deps);
    if (r.pendente) {
      resumo.pendente = { data: rodada.data, motivo: r.pendente };
      break;
    }
    resumo.liquidadas.push(rodada.data);
  }

  // 2. Decidir hoje.
  if (ehDiaUtil(hoje) && !(await rRepo.buscarRodada(id, hoje))) {
    if (resumo.pendente) {
      await rRepo.criarRodada({ carteiraId: id, data: hoje, decisao: "SEM_DECISAO", detalhes: { motivo: "LIQUIDACAO_PENDENTE", pendente: resumo.pendente } });
      resumo.semDecisao.push(hoje);
    } else {
      try {
        await decidirRodada({ ...contexto, data: hoje }, rRepo, deps);
        resumo.decidida = hoje;
      } catch (erro) {
        // A decisão falhou (nada foi gravado: é uma transação). O dia fica SEM_DECISAO, para ser liquidado.
        await rRepo.criarRodada({ carteiraId: id, data: hoje, decisao: "SEM_DECISAO", detalhes: { motivo: "ERRO_NA_DECISAO", erro: erro.message } });
        resumo.semDecisao.push(hoje);
        resumo.erro = erro.message;
      }
    }
  }
  return resumo;
}

async function executarRotina({ agora = new Date() } = {}, deps = {}) {
  const hoje = deps.hoje || hojeEmSaoPaulo(agora);
  const pares = await (deps.carteiraRepository || carteiraRepository).listarAtivasParaRotina();
  const resumos = [];
  for (const par of pares) {
    try {
      resumos.push(await processarCarteira(par, { hoje, agora }, deps));
    } catch (erro) {
      (deps.logger || logger).error({ err: erro, carteiraId: par.id }, "Rotina das carteiras: falha numa carteira");
      resumos.push({ carteiraId: par.id, erro: erro.message });
    }
  }
  return { hoje, resumos };
}

module.exports = { executarRotina, processarCarteira, decidirRodada, liquidarRodada, hojeEmSaoPaulo };
