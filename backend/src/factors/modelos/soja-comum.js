"use strict";

const faixa = require("../base/decisao-por-faixa");
const { percentil } = require("./fundos-cot");

// O que os fatores e as regras da soja (ADR 0116, proposta da soja v2.2) têm em comum:
//   - o DIA de uma publicação (em São Paulo), que é a data de cada ponto: os fatores da soja têm um ponto por dia em que
//     um dado novo é publicado ou em que uma janela da regra R1 muda (point-in-time: o ponto só usa o que tinha sido
//     publicado até o fim daquele dia);
//   - as VERSÕES de uma série (o WASDE, a Conab, a área plantada), indexadas para dizer o que se sabia num dia e a
//     revisão de uma edição contra o que se sabia antes dela;
//   - a POSIÇÃO de uma medida no próprio histórico (percentil - 50) e a decisão por faixa sobre ela, a calibração do
//     FinMind (ADR 0060): neutra do percentil 20 ao 80, forte abaixo do 10 ou acima do 90. A proposta aprovada define os
//     baselines (§2.8); os limites são parâmetros do Comitê;
//   - a MEDIÇÃO aprovada (§2.5): um primário dá a direção e a intensidade; a confirmação que aponta o lado oposto, fora da
//     faixa neutra, limita o fator a FRACA; o contexto só informa.

// Os limites de posição (percentil - 50), os do café (modelos/posicao-historica.js): neutra até 30 pontos (do percentil
// 20 ao 80), forte a partir de 40 (abaixo do 10 ou acima do 90). Sem tendência: os primários da soja mudam por
// publicação, não por semana.
const PARAMETROS_POSICAO_SOJA = Object.freeze({ limiarModeradoPct: 30, limiarFortePct: 40 });
const DESCRITORES_PARAMETROS = faixa.parametrosFaixa({ unidade: "pontos", unidadeMudanca: "pontos" }).slice(0, 2);

// O mínimo de valores anteriores para uma posição no histórico: abaixo disso, a medida não tem leitura.
const MINIMO_HISTORICO = 10;

const DIRECAO = faixa.DIRECAO;
const INTENSIDADE = faixa.INTENSIDADE;
const OPOSTA = { ALTA: "BAIXA", BAIXA: "ALTA" };
const ORDEM_INTENSIDADE = { FRACA: 1, MODERADA: 2, FORTE: 3 };

const DIA_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

// O dia (AAAA-MM-DD, em São Paulo) de um instante de publicação.
function diaDe(instante) {
  return DIA_SP.format(new Date(instante));
}

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const mesDe = (dataIso) => Number(dataIso.slice(5, 7));
const anoDe = (dataIso) => Number(dataIso.slice(0, 4));
// A safra no formato da observation (o WASDE, a Conab e a área gravam a safra no 1º de setembro do ano em que começa).
const safraDoAno = (ano) => `${ano}-09-01`;
const rotuloSafra = (safra) => `${safra.slice(0, 4)}/${String((Number(safra.slice(0, 4)) + 1) % 100).padStart(2, "0")}`;

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f + 0;
}

// --- Versões ------------------------------------------------------------------------------------------------------

// As linhas de obterVersoesAsOf() -> { serie: { observedAt: [{ dia, valor, em, estimado }] } }, em ordem de publicação.
function indexarVersoes(linhas) {
  const indice = new Map();
  const ordenadas = [...linhas].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  for (const linha of ordenadas) {
    if (!indice.has(linha.seriesCode)) indice.set(linha.seriesCode, new Map());
    const porPeriodo = indice.get(linha.seriesCode);
    if (!porPeriodo.has(linha.observedAt)) porPeriodo.set(linha.observedAt, []);
    porPeriodo.get(linha.observedAt).push({ dia: diaDe(linha.publishedAt), valor: linha.value, em: linha.publishedAt, estimado: linha.publishedAtIsEstimated });
  }
  return indice;
}

// A versão vigente de (série, período) no fim de `dia`; `antes: true` = a vigente antes de `dia` (o que se sabia na
// véspera de uma edição). null sem versão.
function versaoEm(indice, serie, periodo, dia, { antes = false } = {}) {
  const versoes = indice.get(serie)?.get(periodo);
  if (!versoes) return null;
  let vigente = null;
  for (const v of versoes) {
    if (antes ? v.dia < dia : v.dia <= dia) vigente = v;
    else break;
  }
  return vigente;
}

const valorEm = (indice, serie, periodo, dia, opcoes) => versaoEm(indice, serie, periodo, dia, opcoes)?.valor ?? null;

// Os dias de publicação de um conjunto de linhas (as edições do WASDE, os levantamentos da Conab), em ordem.
function diasDePublicacao(linhas, filtro = () => true) {
  return [...new Set(linhas.filter(filtro).map((l) => diaDe(l.publishedAt)))].sort();
}

// A última edição até `dia` (inclusive), ou null.
function ultimaAte(dias, dia) {
  let ultima = null;
  for (const d of dias) {
    if (d <= dia) ultima = d;
    else break;
  }
  return ultima;
}

// A revisão (%) de uma soma de séries de um período numa edição: o que a edição dizia contra o que se sabia antes dela.
// null sem as duas versões de todas as séries.
function revisaoNaEdicao(indice, series, periodo, edicao) {
  const depois = series.map((s) => valorEm(indice, s, periodo, edicao));
  const antes = series.map((s) => valorEm(indice, s, periodo, edicao, { antes: true }));
  if ([...depois, ...antes].some((v) => v === null)) return null;
  const somaAntes = antes.reduce((a, b) => a + b, 0);
  if (!somaAntes) return null;
  return { revisaoPct: arredondar((depois.reduce((a, b) => a + b, 0) / somaAntes - 1) * 100, 2), depois: depois.reduce((a, b) => a + b, 0), antes: somaAntes };
}

// --- Posição no histórico -----------------------------------------------------------------------------------------

// `valor` contra `anteriores`: o percentil (0 a 100) e a posição (percentil - 50). Nulo com menos de `minimo`.
function posicaoNoHistorico(valor, anteriores, minimo = MINIMO_HISTORICO) {
  if (valor === null || valor === undefined || anteriores.length < minimo) return { percentil: null, posicao: null, n: anteriores.length };
  const pctl = arredondar(percentil(valor, anteriores), 1);
  return { percentil: pctl, posicao: arredondar(pctl - 50, 1), n: anteriores.length };
}

// Uma série SEMANAL (linhas de obterAsOf de uma série) -> [{ observedAt, dia, valor, estimado }] em ordem.
function semanal(linhas, serie) {
  return linhas
    .filter((l) => l.seriesCode === serie)
    .map((l) => ({ observedAt: l.observedAt, dia: diaDe(l.publishedAt), valor: l.value, em: l.publishedAt, estimado: l.publishedAtIsEstimated }))
    .sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1));
}

// O valor de uma semana contra a MESMA semana dos anos anteriores (§2.8: o estado da lavoura): em cada ano anterior, a
// observação a até 3 dias da mesma data. Todos os anos disponíveis antes, sem o ano corrente.
function posicaoNaMesmaSemana(semanas, ponto, minimo = MINIMO_HISTORICO) {
  const ano = anoDe(ponto.observedAt);
  const md = ponto.observedAt.slice(5);
  const anteriores = [];
  for (const outra of semanas) {
    const anoOutra = anoDe(outra.observedAt);
    if (anoOutra >= ano) break;
    const alvo = `${anoOutra}-${md}`;
    const distancia = Math.abs(Date.parse(`${outra.observedAt}T00:00:00Z`) - Date.parse(`${alvo}T00:00:00Z`)) / 86400000;
    if (distancia <= 3) anteriores.push(outra.valor);
  }
  return posicaoNoHistorico(ponto.valor, anteriores, minimo);
}

// A última semana publicada até `dia` (pelo dia de publicação), ou null.
function semanaAte(semanas, dia, { desde = null } = {}) {
  let ultima = null;
  for (const s of semanas) {
    if (s.dia <= dia && (!desde || s.observedAt >= desde)) {
      if (!ultima || s.observedAt > ultima.observedAt) ultima = s;
    }
  }
  return ultima;
}

// --- Decisão e medição --------------------------------------------------------------------------------------------

// A leitura de uma medida pela posição: `acimaPressiona` é o lado que a posição alta pressiona.
function decidirPosicao(posicao, parametros, acimaPressiona) {
  if (posicao === null || posicao === undefined) return null;
  const { direcao, intensidade } = faixa.decidirPorFaixa(posicao, null, parametros, acimaPressiona);
  return { direcao, intensidade };
}

// A medição aprovada (§2.5): o primário decide; uma confirmação no lado oposto (fora da faixa neutra) limita a FRACA. Com
// o primário neutro, a confirmação não cria sinal. -> { direcao, intensidade, limitadoPor: [rótulos] }.
function aplicarConfirmacoes(primaria, confirmacoes) {
  if (!primaria) return null;
  if (primaria.direcao === DIRECAO.NEUTRA) return { ...primaria, limitadoPor: [] };
  const contra = confirmacoes.filter((c) => c.leitura && c.leitura.direcao === OPOSTA[primaria.direcao]);
  if (!contra.length) return { ...primaria, limitadoPor: [] };
  return { direcao: primaria.direcao, intensidade: INTENSIDADE.FRACA, limitadoPor: contra.map((c) => c.rotulo) };
}

// Dois componentes ativos ao mesmo tempo (o F1 de junho a agosto: área e produtividade): no mesmo lado, vale o mais
// intenso; em lados opostos, o de percentil mais extremo, limitado a FRACA; um neutro, vale o outro. Cada componente:
// { rotulo, posicao, leitura, dia }. Empate de extremos em lados opostos (os dois no percentil 0 e 100, comum num ano
// fora da curva): vale o publicado por último, porque o fator lê o choque NOVO (operacionalização do FinMind, ADR 0116).
function combinarComponentes(a, b) {
  if (!a?.leitura) return b?.leitura ? { ...b.leitura, decidiu: b.rotulo, conflito: false } : null;
  if (!b?.leitura) return { ...a.leitura, decidiu: a.rotulo, conflito: false };
  const neutroA = a.leitura.direcao === DIRECAO.NEUTRA;
  const neutroB = b.leitura.direcao === DIRECAO.NEUTRA;
  if (neutroA && neutroB) return { ...a.leitura, decidiu: null, conflito: false };
  if (neutroA) return { ...b.leitura, decidiu: b.rotulo, conflito: false };
  if (neutroB) return { ...a.leitura, decidiu: a.rotulo, conflito: false };
  if (a.leitura.direcao === b.leitura.direcao) {
    const maior = ORDEM_INTENSIDADE[a.leitura.intensidade] >= ORDEM_INTENSIDADE[b.leitura.intensidade] ? a : b;
    return { ...maior.leitura, decidiu: maior.rotulo, conflito: false };
  }
  const [extA, extB] = [Math.abs(a.posicao), Math.abs(b.posicao)];
  const empate = extA === extB;
  const extremo = empate ? ((a.dia || "") > (b.dia || "") ? a : b) : extA > extB ? a : b;
  return { direcao: extremo.leitura.direcao, intensidade: INTENSIDADE.FRACA, decidiu: extremo.rotulo, conflito: true, empate };
}

// A decisão de um ponto no formato dos fatores (texto-prompt.js, a tela): sem tendência (os primários mudam por
// publicação). Fora da janela da R1, NEUTRA com a marca `foraDaJanela`: o fator não pressiona nesta época.
function decisaoDoPonto(leitura, { foraDaJanela = false } = {}) {
  if (foraDaJanela) return { direcao: DIRECAO.NEUTRA, intensidade: INTENSIDADE.FRACA, tendencia: null, foraDaJanela: true };
  if (!leitura) return null;
  return { direcao: leitura.direcao, intensidade: leitura.intensidade, tendencia: null, foraDaJanela: false };
}

const ROTULOS_DECISAO = { ...faixa.ROTULOS, tendencia: { SUBINDO: "-", CAINDO: "-", ESTAVEL: "-" } };
const NOME_DIRECAO = { ALTA: "pressão de alta", BAIXA: "pressão de baixa", NEUTRA: "neutra" };
const NOME_INTENSIDADE = { FRACA: "fraca", MODERADA: "moderada", FORTE: "forte" };

// "neutra" ou "pressão de alta, moderada".
function descreverLeitura(leitura) {
  if (!leitura) return "sem leitura (histórico curto ou sem dado)";
  return leitura.direcao === DIRECAO.NEUTRA ? "neutra" : `${NOME_DIRECAO[leitura.direcao]}, ${NOME_INTENSIDADE[leitura.intensidade]}`;
}

const fmt = (n, casas = 1) => (n === null || n === undefined ? "-" : n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const comSinal = (n, casas = 2) => (n === null || n === undefined ? "-" : `${n > 0 ? "+" : ""}${fmt(n, casas)}`);
const dataBr = (iso) => (iso ? iso.split("-").reverse().join("/") : "-");

// O texto da regra de decisão para o prompt e a tela (texto-prompt.js, `apresentacao.regra`): os limites em uso.
const REGRA_POSICAO =
  "a posição de cada medida no próprio histórico (percentil - 50): neutra até {limiarModeradoPct} pontos (do percentil 20 ao 80 com o padrão), forte a partir de {limiarFortePct} (abaixo do 10 ou acima do 90); calibração do FinMind, os limites são do Comitê";

// Os exemplos da camada C: pontos reais do histórico (o último até cada data), sem cenários hipotéticos (a decisão
// depende do período e de várias medidas, não de um número só).
function exemplosPorData(pontos, episodios, campo) {
  return {
    episodios: episodios.map(({ data, rotulo }) => {
      const ponto = [...pontos].reverse().find((p) => p.observedAt <= data);
      return { data: ponto?.observedAt || data, rotulo, valor: ponto?.[campo] ?? null, decisao: ponto?.decisao ?? null };
    }),
    cenarios: []
  };
}

module.exports = {
  PARAMETROS_POSICAO_SOJA,
  DESCRITORES_PARAMETROS,
  MINIMO_HISTORICO,
  DIRECAO,
  INTENSIDADE,
  OPOSTA,
  ROTULOS_DECISAO,
  REGRA_POSICAO,
  diaDe,
  somarDias,
  mesDe,
  anoDe,
  safraDoAno,
  rotuloSafra,
  arredondar,
  indexarVersoes,
  versaoEm,
  valorEm,
  diasDePublicacao,
  ultimaAte,
  revisaoNaEdicao,
  posicaoNoHistorico,
  semanal,
  posicaoNaMesmaSemana,
  semanaAte,
  decidirPosicao,
  aplicarConfirmacoes,
  combinarComponentes,
  decisaoDoPonto,
  descreverLeitura,
  fmt,
  comSinal,
  dataBr,
  exemplosPorData
};
