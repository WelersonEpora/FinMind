"use strict";

const observationRepository = require("../repositories/observation.repository");
const geopoliticaService = require("./geopolitica.service");
const analiseDiariaService = require("./analise-diaria.service");
const realizadoAnaliseService = require("./realizado-analise.service");
const { buscarNoCatalogo } = require("./observaveis.service");
const { decodificarFuturoB3 } = require("../shared/utils/b3-contrato");
const { somarDias } = require("../shared/utils/date-utils");
const { ValidationError } = require("../shared/errors");

// Centro de Decisão (ADR 0048): a tela inicial. Para um ATIVO e uma DATA, devolve o preço como era conhecido no fim
// daquele dia (point-in-time, ADR 0008), a leitura de eventos de mercado daquela data (ADRs 0047 e 0049) e a leitura
// de tendência da IA feita naquela data (ADRs 0052, 0054, 0058 e 0062, nos quatro ativos). A variação é aritmética
// sobre a própria série (sem limiar, sem sinal).
//
// Cada ativo tem uma lista FIXA de séries de preço; a 1ª é o padrão e o usuário troca na tela. Não há regra que
// escolha a "melhor" série: isso seria critério de análise. Quando o David definir o preço de referência de cada
// ativo, muda só esta lista.

const ATIVOS = [
  {
    codigo: "OURO",
    nome: "Ouro",
    series: [
      { codigo: "GLD", nome: "Futuro B3 (GLD)", observavel: "GLD_PRECOS", futuro: { prefixo: "B3.GLD", campo: "SETTLE" } },
      { codigo: "LBMA", nome: "LBMA Gold Price PM", observavel: "OURO_LBMA", seriesCode: "LBMA.GOLD_PM.USD" }
    ]
  },
  {
    codigo: "PETROLEO",
    nome: "Petróleo",
    series: [
      { codigo: "BRENT", nome: "Brent à vista (EIA)", observavel: "PETROLEO_PRECOS_EIA", seriesCode: "EIA.PETROLEO_PRECOS.BRENT" },
      { codigo: "WTI", nome: "WTI à vista (EIA)", observavel: "PETROLEO_PRECOS_EIA", seriesCode: "EIA.PETROLEO_PRECOS.WTI" }
    ]
  },
  {
    codigo: "MILHO",
    nome: "Milho",
    series: [
      // O CCM primeiro: o preço de referência aprovado pelo Comitê (2026-10-04, ADR 0058).
      { codigo: "CCM", nome: "Futuro B3 (CCM)", observavel: "CCM_PRECOS", futuro: { prefixo: "B3.CCM", campo: "SETTLE" } },
      { codigo: "CEPEA", nome: "Indicador CEPEA/ESALQ", observavel: "MILHO_CEPEA_ESALQ", seriesCode: "B3.MILHO_ESALQ.AVISTA_BRL" }
    ]
  },
  {
    codigo: "CAFE",
    nome: "Café",
    series: [
      { codigo: "ICF", nome: "Futuro B3 (ICF)", observavel: "ICF_PRECOS", futuro: { prefixo: "B3.ICF", campo: "SETTLE" } },
      { codigo: "FMI", nome: "FMI mensal (arábica)", observavel: "CAFE_PRECO_FMI", seriesCode: "FRED.PCOFFOTMUSDM" }
    ]
  }
];

// Quanto do histórico o card mostra (gráfico) e quanto busca (o gráfico + folga para a variação de 90 dias achar um
// ponto anterior). Uma série mensal precisa de uma janela maior para ter mais de 2 pontos no gráfico.
const JANELAS = {
  DIARIA: { grafico: 90, busca: 100 },
  SEMANAL: { grafico: 180, busca: 190 },
  MENSAL: { grafico: 730, busca: 760 }
};
// Variações mostradas no card: contra o ponto anterior (1 dia) e contra o último ponto até N dias corridos antes.
// Numa série mensal, 1 e 7 dias não existem (null): a tela esconde a coluna.
const VARIACOES = [
  { codigo: "d1", dias: 1, rotulo: "1 dia", soDiaria: true },
  { codigo: "d7", dias: 7, rotulo: "7 dias", soDiaria: true },
  { codigo: "d30", dias: 30, rotulo: "30 dias" },
  { codigo: "d90", dias: 90, rotulo: "90 dias" }
];
// Eventos de mercado na seção "O que está movimentando o mercado": os da semana que termina na data.
const DIAS_EVENTOS = 7;
const MAX_EVENTOS = 12;

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

// O instante "o que se sabia" da data: o fim do dia em Brasília; hoje, o agora (nada foi publicado no futuro).
function instanteDaData(data, agora) {
  const fimDoDia = new Date(`${data}T23:59:59.999-03:00`);
  return fimDoDia.getTime() > agora.getTime() ? agora : fimDoDia;
}

function diasEntre(dataA, dataB) {
  return Math.round((Date.parse(`${dataB}T00:00:00Z`) - Date.parse(`${dataA}T00:00:00Z`)) / 86400000);
}

function validarFiltros({ ativo, data, serie }, agora) {
  const hoje = hojeEmSaoPaulo(agora);
  const definicao = ativo ? ATIVOS.find((a) => a.codigo === ativo) : ATIVOS[0];
  if (!definicao) throw new ValidationError(`"ativo" deve ser um entre: ${ATIVOS.map((a) => a.codigo).join(", ")}.`);

  const dataEscolhida = data || hoje;
  if (!REGEX_DATA.test(dataEscolhida) || Number.isNaN(Date.parse(`${dataEscolhida}T00:00:00Z`))) {
    throw new ValidationError('"data" deve estar em AAAA-MM-DD.');
  }
  if (dataEscolhida > hoje) throw new ValidationError('"data" não pode ser futura.');

  const serieDef = serie ? definicao.series.find((s) => s.codigo === serie) : definicao.series[0];
  if (!serieDef) throw new ValidationError(`"serie" deve ser uma entre: ${definicao.series.map((s) => s.codigo).join(", ")}.`);

  return { ativo: definicao, data: dataEscolhida, hoje, serie: serieDef };
}

// Variação percentual do último ponto contra a referência de cada janela. `pontos` em ordem crescente de data.
function calcularVariacoes(pontos, frequencia) {
  const resultado = {};
  const ultimo = pontos[pontos.length - 1];
  for (const variacao of VARIACOES) {
    resultado[variacao.codigo] = null;
    if (!ultimo || (variacao.soDiaria && frequencia !== "DIARIA")) continue;

    let referencia;
    if (variacao.dias === 1) {
      referencia = pontos[pontos.length - 2];
    } else {
      const limite = somarDias(ultimo.data, -variacao.dias);
      referencia = [...pontos].reverse().find((p) => p.data <= limite);
    }
    if (!referencia || referencia.valor === 0) continue;
    resultado[variacao.codigo] = {
      percentual: ((ultimo.valor - referencia.valor) / Math.abs(referencia.valor)) * 100,
      desde: referencia.data
    };
  }
  return resultado;
}

// Futuro: o vencimento mais próximo que negociou no último pregão até a data. Cada vencimento é uma série própria
// e nada é emendado: o gráfico e as variações usam só o histórico desse contrato.
async function lerFuturo(futuro, { data, asOf, desde }, repo) {
  const mesDaData = data.slice(0, 7);
  const contratos = (await repo.listarUltimasDatasItens({ prefixoSerie: futuro.prefixo, campoReferencia: futuro.campo }))
    .map((linha) => decodificarFuturoB3(linha.codigo))
    .filter((contrato) => contrato && contrato.vencimento >= mesDaData);
  if (contratos.length === 0) return null;

  const linhas = await repo.buscarAsOf({
    seriesCodes: contratos.map((c) => `${futuro.prefixo}.${c.ticker}.${futuro.campo}`),
    asOf,
    observadoDesde: desde,
    observadoAte: data
  });
  if (linhas.length === 0) return null;

  const ultimoPregao = linhas.reduce((maior, l) => (l.observed_at > maior ? l.observed_at : maior), "");
  const ativos = new Set(linhas.filter((l) => l.observed_at === ultimoPregao).map((l) => l.series_code));
  const contrato = contratos
    .filter((c) => ativos.has(`${futuro.prefixo}.${c.ticker}.${futuro.campo}`))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  const seriesCode = `${futuro.prefixo}.${contrato.ticker}.${futuro.campo}`;

  return { linhas: linhas.filter((l) => l.series_code === seriesCode), seriesCode, contrato: { ticker: contrato.ticker, rotulo: contrato.rotulo } };
}

async function lerPreco(serie, { data, agora }, deps) {
  const repo = deps.observationRepository || observationRepository;
  const catalogo = buscarNoCatalogo(serie.observavel);
  const campo = catalogo.campos?.find((c) => c.codigo === (serie.futuro?.campo || serie.seriesCode.split(".").pop()));
  const frequencia = catalogo.frequencia;
  const janela = JANELAS[frequencia] || JANELAS.DIARIA;
  const asOf = instanteDaData(data, agora);
  const desde = somarDias(data, -janela.busca);

  const lido = serie.futuro
    ? await lerFuturo(serie.futuro, { data, asOf, desde }, repo)
    : { linhas: await repo.buscarAsOf({ seriesCodes: [serie.seriesCode], asOf, observadoDesde: desde, observadoAte: data }), seriesCode: serie.seriesCode, contrato: null };

  const base = {
    codigo: serie.codigo,
    nome: serie.nome,
    observavel: serie.observavel,
    fonte: catalogo.fonte,
    unidade: campo?.unidade || catalogo.unidade,
    casasDecimais: campo?.casasDecimais ?? catalogo.casasDecimais,
    periodicidade: frequencia.toLowerCase(),
    tempoReal: false,
    encerradaEm: catalogo.encerradaEm || null
  };
  const linhas = lido?.linhas || [];
  if (linhas.length === 0) return { ...base, disponivel: false };

  const pontos = linhas
    .map((l) => ({ data: l.observed_at, valor: Number(l.value), publicadoEm: l.published_at, estimado: Boolean(Number(l.published_at_is_estimated)) }))
    .sort((a, b) => a.data.localeCompare(b.data));
  const ultimo = pontos[pontos.length - 1];
  const inicioGrafico = somarDias(ultimo.data, -janela.grafico);
  const diasSemDado = diasEntre(ultimo.data, data);

  return {
    ...base,
    disponivel: true,
    // A série exata do preço (num futuro, a do contrato): a leitura de tendência a grava (ADR 0064).
    seriesCode: lido.seriesCode,
    contrato: lido.contrato,
    valor: ultimo.valor,
    dataReferencia: ultimo.data,
    publicadoEm: ultimo.publicadoEm,
    publicadoEmEstimado: ultimo.estimado,
    diasSemDado,
    // A série parou de chegar antes da data (atraso da fonte ou série encerrada): a tela avisa, nunca esconde.
    defasada: diasSemDado > (catalogo.toleranciaDias ?? 4),
    variacoes: calcularVariacoes(pontos, frequencia),
    pontos: pontos.filter((p) => p.data >= inicioGrafico).map((p) => ({ data: p.data, valor: p.valor }))
  };
}

async function lerGeopolitica(ativo, data, deps) {
  const servico = deps.geopoliticaService || geopoliticaService;
  const [doDia, recentes] = await Promise.all([
    servico.obterGeopoliticaDoDia(ativo.codigo, data, deps),
    servico.listarEventos(
      { ativo: ativo.codigo, situacao: "aceitos", dataInicio: somarDias(data, -(DIAS_EVENTOS - 1)), dataFim: data, tamanhoPagina: MAX_EVENTOS, ordem: "DESC" },
      deps
    )
  ]);
  return {
    data,
    disponivel: doDia.disponivel,
    nivel: doDia.nivel,
    resumo: doDia.resumo,
    fontesLidas: doDia.fontesLidas,
    eventos: recentes.eventos,
    totalEventos: recentes.paginacao.total
  };
}

// GET /api/v1/centro-decisao?ativo=&data=&serie=
async function obterCentroDecisao(filtros = {}, deps = {}) {
  const agora = deps.agora || new Date();
  const { ativo, data, hoje, serie } = validarFiltros(filtros, agora);

  const [preco, geopolitica, analise] = await Promise.all([
    lerPreco(serie, { data, agora }, deps),
    lerGeopolitica(ativo, data, deps),
    (deps.analiseDiariaService || analiseDiariaService).obterAnaliseDoDia(ativo.codigo, data, deps)
  ]);

  // O realizado da leitura (ADR 0063 e adendo): em que faixa o preço de fato caiu em cada horizonte, a partir da base da
  // avaliação (o preço da data da análise), na série que a leitura gravou (o petróleo antes do Brent usava o WTI).
  if (analise?.disponivel) {
    analise.realizado = await (deps.realizadoAnaliseService || realizadoAnaliseService).apurarRealizado(analise, { agora }, deps);
  }

  return {
    centroDecisao: {
      data,
      hoje,
      ativos: ATIVOS.map((a) => ({ codigo: a.codigo, nome: a.nome })),
      ativo: { codigo: ativo.codigo, nome: ativo.nome },
      series: ativo.series.map((s) => ({ codigo: s.codigo, nome: s.nome })),
      variacoes: VARIACOES.map(({ codigo, rotulo }) => ({ codigo, rotulo })),
      preco,
      geopolitica,
      // null: o ativo não tem leitura diária de tendência (a tela mostra o espaço reservado da análise).
      analise
    }
  };
}

module.exports = { obterCentroDecisao, calcularVariacoes, lerPreco, ATIVOS };
