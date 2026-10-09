"use strict";

const { percentil } = require("./fundos-cot");
const faixa = require("../base/decisao-por-faixa");

// O que os fatores do dólar (proposta do dólar, docs/proposta-ativo-dolar.md; ADR 0126) têm em comum:
//   - a RÉGUA de intensidade aprovada (§2.5 da proposta; decisão do usuário, 2026-10-09, ADR 0117, adendo): a variação do
//     observável na JANELA DE CADA HORIZONTE (1, 5, 20 e 60 dias úteis, para os horizontes de 1, 7, 30 e 90 dias),
//     contra as variações da mesma janela nos 3 anos anteriores: NEUTRA abaixo do percentil 40 da variação absoluta,
//     FORTE a partir do 80, FRACA entre os dois. A mesma régua das faixas de preço (ADR 0079); calibração do FinMind,
//     ajustável pelo Comitê;
//   - por isso, cada ponto tem UMA LEITURA POR HORIZONTE (`porHorizonte`), e não uma só: o prompt leva as quatro; a
//     `decisao` do ponto (a da tela e do resumo) é a do horizonte de 30 dias;
//   - a MEDIÇÃO aprovada (§2.3): um primário dá a direção e a intensidade; a confirmação que aponta o lado oposto, fora da
//     faixa neutra, limita o fator a FRACA; o contexto só informa;
//   - a regra de DEFASAGEM (R2 da proposta, §2.4): um fator cujo primário sai uma vez por semana (o fluxo cambial e o
//     índice do dólar do Fed) não lê o horizonte de 1 dia; nos outros, a idade do dado vai à tabela 2.3 do prompt.
// Tudo point-in-time (só o que se sabia na data) e sem IA.

const HORIZONTES = Object.freeze([
  { codigo: "IMEDIATO", janela: 1, rotulo: "1 dia" },
  { codigo: "CURTO", janela: 5, rotulo: "7 dias" },
  { codigo: "MEDIO", janela: 20, rotulo: "30 dias" },
  { codigo: "LONGO", janela: 60, rotulo: "90 dias" }
]);
// O horizonte cuja leitura vai à `decisao` do ponto (a tela de metodologia e o resumo da simulação).
const HORIZONTE_DA_TELA = "MEDIO";

const PARAMETROS_REGUA = Object.freeze({ reguaPercentilNeutro: 40, reguaPercentilForte: 80, reguaAnos: 3 });
const DESCRITORES_PARAMETROS = Object.freeze([
  {
    chave: "reguaPercentilNeutro",
    rotulo: "Limite da faixa neutra",
    unidade: "percentil",
    explicacao: "Abaixo desse percentil da variação absoluta (nos anos anteriores, na mesma janela), o movimento é ruído: neutro (decidido: 40)."
  },
  {
    chave: "reguaPercentilForte",
    rotulo: "Limite da intensidade forte",
    unidade: "percentil",
    explicacao: "A partir desse percentil, a pressão é forte; entre a faixa neutra e ele, fraca (decidido: 80)."
  },
  { chave: "reguaAnos", rotulo: "Histórico da comparação", unidade: "anos", maximo: 10, explicacao: "Quantos anos anteriores entram na comparação (decidido: 3)." }
]);

// O mínimo de variações anteriores para uma leitura: abaixo disso, a janela não tem histórico (o DI1, ~15 meses no
// Up2Data, só ganha leitura de 60 dias úteis meses depois do 1º dado).
const MINIMO_HISTORICO = 60;

const DIRECAO = faixa.DIRECAO;
const INTENSIDADE = faixa.INTENSIDADE;
const OPOSTA = { ALTA: "BAIXA", BAIXA: "ALTA" };
const ORDEM_INTENSIDADE = { FRACA: 1, MODERADA: 2, FORTE: 3 };
const ROTULOS_DECISAO = { ...faixa.ROTULOS, tendencia: { SUBINDO: "-", CAINDO: "-", ESTAVEL: "-" } };

// O tipo da variação: em % (preço, índice), em pontos-base (uma taxa em % ao ano) ou em pontos (o VIX, o Focus).
const TIPO = Object.freeze({
  PCT: { calcular: (agora, antes) => (antes ? (agora / antes - 1) * 100 : null), unidade: "%", casas: 2 },
  PB: { calcular: (agora, antes) => (agora - antes) * 100, unidade: " pb", casas: 0 },
  PONTOS: { calcular: (agora, antes) => agora - antes, unidade: " pontos", casas: 2 },
  PP: { calcular: (agora, antes) => agora - antes, unidade: " p.p.", casas: 2 }
});

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f + 0;
}

const DIA_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const diaDe = (instante) => DIA_SP.format(new Date(instante));

function anosAntes(dataIso, anos) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - anos);
  return d.toISOString().slice(0, 10);
}

// As linhas de obterAsOf() de uma série -> [{ observedAt, valor, disponivelEm, estimado }], em ordem de data.
function serieDiaria(linhas, codigo) {
  return linhas
    .filter((l) => l.seriesCode === codigo && Number.isFinite(l.value))
    .map((l) => ({ observedAt: String(l.observedAt).slice(0, 10), valor: l.value, disponivelEm: l.publishedAt, estimado: l.publishedAtIsEstimated }))
    .sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1));
}

// A variação de cada ponto contra o de `janela` observações antes (dias úteis da própria série), ou null.
function variacoesNaJanela(serie, janela, tipo) {
  return serie.map((p, i) => (i < janela ? null : arredondar(tipo.calcular(p.valor, serie[i - janela].valor), 4)));
}

// A régua sobre uma sequência de variações (datas em ordem): o percentil da variação absoluta de cada ponto entre as
// dos `reguaAnos` anos anteriores. -> [{ variacao, percentil, n }] (percentil null sem o histórico mínimo).
function reguaDaSequencia(datas, variacoes, parametros) {
  const resultado = new Array(variacoes.length).fill(null);
  let inicioJanela = 0;
  for (let i = 0; i < variacoes.length; i += 1) {
    const v = variacoes[i];
    if (v === null || v === undefined) continue;
    const limite = anosAntes(datas[i], parametros.reguaAnos);
    while (inicioJanela < i && datas[inicioJanela] < limite) inicioJanela += 1;
    const absoluto = Math.abs(v);
    let abaixo = 0;
    let iguais = 0;
    let n = 0;
    for (let k = inicioJanela; k < i; k += 1) {
      const outro = variacoes[k];
      if (outro === null || outro === undefined) continue;
      n += 1;
      const a = Math.abs(outro);
      if (a < absoluto) abaixo += 1;
      else if (a === absoluto) iguais += 1;
    }
    resultado[i] = { variacao: v, percentil: n >= MINIMO_HISTORICO ? arredondar(((abaixo + iguais / 2) / n) * 100, 1) : null, n };
  }
  return resultado;
}

// A leitura de uma medida pela régua: `acimaPressiona` é o lado que a variação positiva pressiona. null sem histórico.
function leituraDaRegua(regua, parametros, acimaPressiona) {
  if (!regua || regua.percentil === null) return null;
  if (regua.percentil < parametros.reguaPercentilNeutro || regua.variacao === 0) return { direcao: DIRECAO.NEUTRA, intensidade: INTENSIDADE.FRACA };
  const direcao = regua.variacao > 0 ? acimaPressiona : OPOSTA[acimaPressiona];
  return { direcao, intensidade: regua.percentil >= parametros.reguaPercentilForte ? INTENSIDADE.FORTE : INTENSIDADE.FRACA };
}

// A posição com sinal (de -100 a +100): o sinal da variação e o percentil dela. O gráfico C da tela.
function posicaoComSinal(regua) {
  if (!regua || regua.percentil === null) return null;
  return regua.variacao === 0 ? 0 : Math.sign(regua.variacao) * regua.percentil;
}

// A medição aprovada: a confirmação no lado oposto (fora da faixa neutra) limita o primário a FRACA. -> a leitura com
// `limitadoPor` (os rótulos das confirmações contra).
function aplicarConfirmacao(primaria, confirmacoes) {
  if (!primaria) return null;
  if (primaria.direcao === DIRECAO.NEUTRA) return { ...primaria, limitadoPor: [] };
  const contra = confirmacoes.filter((c) => c.leitura && c.leitura.direcao === OPOSTA[primaria.direcao]);
  if (!contra.length) return { ...primaria, limitadoPor: [] };
  return { direcao: primaria.direcao, intensidade: INTENSIDADE.FRACA, limitadoPor: contra.map((c) => c.rotulo) };
}

// Várias medidas que precisam concordar (os três vértices do DI; a maioria das commodities): `minimo` do mesmo lado,
// fora da faixa neutra, dão a direção, com a intensidade da mais fraca entre elas; abaixo disso, neutra. Sem leitura
// em alguma das medidas exigidas (`todas`), null.
function concordancia(leituras, { minimo, todas = false }) {
  if (todas && leituras.some((l) => !l)) return null;
  const validas = leituras.filter(Boolean);
  if (!validas.length) return null;
  for (const lado of [DIRECAO.ALTA, DIRECAO.BAIXA]) {
    const doLado = validas.filter((l) => l.direcao === lado);
    if (doLado.length >= minimo) {
      const intensidade = doLado.some((l) => l.intensidade === INTENSIDADE.FRACA) ? INTENSIDADE.FRACA : INTENSIDADE.FORTE;
      return { direcao: lado, intensidade };
    }
  }
  return { direcao: DIRECAO.NEUTRA, intensidade: INTENSIDADE.FRACA };
}

const NOME_DIRECAO = { ALTA: "pressão de alta", BAIXA: "pressão de baixa", NEUTRA: "neutra" };
const NOME_INTENSIDADE = { FRACA: "fraca", MODERADA: "moderada", FORTE: "forte" };

// "neutra" ou "pressão de alta, forte".
function descreverLeitura(leitura) {
  if (!leitura) return "sem leitura (histórico curto ou sem dado)";
  return leitura.direcao === DIRECAO.NEUTRA ? "neutra" : `${NOME_DIRECAO[leitura.direcao]}, ${NOME_INTENSIDADE[leitura.intensidade]}`;
}

// Um formatador por número de casas, criado uma vez: toLocaleString cria um a cada chamada, e um fator do dólar formata
// centenas de milhares de números (um ponto por dia útil desde os anos 1970).
const FORMATADORES = new Map();
function formatador(casas) {
  if (!FORMATADORES.has(casas)) FORMATADORES.set(casas, new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }));
  return FORMATADORES.get(casas);
}
const fmt = (n, casas = 2) => (n === null || n === undefined ? "-" : formatador(casas).format(n));
const comSinal = (n, casas = 2) => (n === null || n === undefined ? "-" : `${n > 0 ? "+" : ""}${fmt(n, casas)}`);
const dataBr = (iso) => (iso ? iso.split("-").reverse().join("/") : "-");

// "+12 pb (percentil 91)" ou "+0,4% (sem histórico)".
function descreverVariacao(regua, tipo) {
  if (!regua) return "sem dado";
  const valor = `${comSinal(regua.variacao, tipo.casas)}${tipo.unidade}`;
  return regua.percentil === null ? `${valor} (sem histórico mínimo: ${regua.n} de ${MINIMO_HISTORICO})` : `${valor} (percentil ${fmt(regua.percentil, 0)})`;
}

// Um horizonte sem leitura pela R2 (a defasagem): { aplica: false, motivo }.
function semLeituraR2(motivo) {
  return { aplica: false, direcao: null, intensidade: null, texto: `não se aplica (R2, defasagem: ${motivo})` };
}

// A leitura de um horizonte no formato do ponto: a direção, a intensidade e o texto que vai ao prompt.
function leituraDoHorizonte(leitura, detalhe) {
  if (!leitura) return { aplica: true, direcao: null, intensidade: null, texto: `sem leitura: histórico curto ou sem dado${detalhe ? ` (${detalhe})` : ""}` };
  const limitado = leitura.limitadoPor?.length ? `; limitada a fraca: ${leitura.limitadoPor.join(" e ")} aponta o lado oposto` : "";
  return { aplica: true, direcao: leitura.direcao, intensidade: leitura.intensidade, texto: `${descreverLeitura(leitura)}${detalhe ? ` (${detalhe})` : ""}${limitado}` };
}

// A `decisao` do ponto (a da tela): a do horizonte de 30 dias, no formato dos outros fatores (sem tendência).
function decisaoDaTela(porHorizonte) {
  const h = porHorizonte[HORIZONTE_DA_TELA];
  if (!h || !h.aplica || !h.direcao) return null;
  return { direcao: h.direcao, intensidade: h.intensidade, tendencia: null };
}

// As linhas da leitura por horizonte (a explicação da tela). `semJanela`: um fator com a mesma medida em todos os
// horizontes (o fluxo, o Focus) não fala de janela.
function linhasPorHorizonte(porHorizonte, { semJanela = false } = {}) {
  return HORIZONTES.map((h) => `${h.rotulo}${semJanela ? "" : ` (janela de ${h.janela} ${h.janela > 1 ? "dias úteis" : "dia útil"})`}: ${porHorizonte[h.codigo].texto}.`);
}

// O texto da régua para o prompt e a tela (texto-prompt.js, `apresentacao.regra`), com os parâmetros em uso.
const REGRA_REGUA =
  "a régua aprovada: a variação na janela de cada horizonte (1, 5, 20 e 60 dias úteis) contra as variações da mesma janela nos {reguaAnos} anos anteriores; neutra abaixo do percentil {reguaPercentilNeutro} da variação absoluta, forte a partir do {reguaPercentilForte}, fraca entre os dois";

// O gráfico C (a posição com sinal no horizonte de 30 dias e os limites da régua), igual em todos os fatores.
function graficoC(rotulo) {
  return {
    titulo: `${rotulo}: a posição no histórico, com sinal (C, horizonte de 30 dias) e os limites da régua`,
    campo: "posicaoMedio",
    rotulo: "Posição com sinal (percentil)",
    unidade: "percentil",
    limiares: [
      { chave: "reguaPercentilForte", sinal: 1, rotulo: "Forte (acima)" },
      { chave: "reguaPercentilNeutro", sinal: 1, rotulo: "Faixa neutra (acima)" },
      { chave: "reguaPercentilNeutro", sinal: -1, rotulo: "Faixa neutra (abaixo)" },
      { chave: "reguaPercentilForte", sinal: -1, rotulo: "Forte (abaixo)" }
    ]
  };
}

// Os exemplos da camada C: pontos reais (o último até cada data), sem cenários hipotéticos.
function exemplosPorData(pontos, episodios) {
  return {
    episodios: episodios.map(({ data, rotulo }) => {
      const ponto = [...pontos].reverse().find((p) => p.observedAt <= data);
      return { data: ponto?.observedAt || data, rotulo, valor: ponto?.posicaoMedio ?? null, decisao: ponto?.decisao ?? null };
    }),
    cenarios: []
  };
}

// O último valor de uma série até `data` (inclusive), ou null.
function ultimoAte(serie, data) {
  let lo = 0;
  let hi = serie.length - 1;
  let achado = null;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    if (serie[meio].observedAt <= data) {
      achado = serie[meio];
      lo = meio + 1;
    } else hi = meio - 1;
  }
  return achado;
}

// O índice do último ponto até `data`, ou -1.
function indiceAte(serie, data) {
  let lo = 0;
  let hi = serie.length - 1;
  let achado = -1;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    if (serie[meio].observedAt <= data) {
      achado = meio;
      lo = meio + 1;
    } else hi = meio - 1;
  }
  return achado;
}

// A régua de uma série inteira em cada janela: { CODIGO_DO_HORIZONTE: [regua por índice] }.
function reguasPorHorizonte(serie, tipo, parametros) {
  const datas = serie.map((p) => p.observedAt);
  return Object.fromEntries(HORIZONTES.map((h) => [h.codigo, reguaDaSequencia(datas, variacoesNaJanela(serie, h.janela, tipo), parametros)]));
}

module.exports = {
  HORIZONTES,
  HORIZONTE_DA_TELA,
  PARAMETROS_REGUA,
  DESCRITORES_PARAMETROS,
  MINIMO_HISTORICO,
  DIRECAO,
  INTENSIDADE,
  OPOSTA,
  ORDEM_INTENSIDADE,
  ROTULOS_DECISAO,
  TIPO,
  REGRA_REGUA,
  arredondar,
  diaDe,
  anosAntes,
  serieDiaria,
  variacoesNaJanela,
  reguaDaSequencia,
  reguasPorHorizonte,
  leituraDaRegua,
  posicaoComSinal,
  aplicarConfirmacao,
  concordancia,
  descreverLeitura,
  descreverVariacao,
  semLeituraR2,
  leituraDoHorizonte,
  decisaoDaTela,
  linhasPorHorizonte,
  graficoC,
  exemplosPorData,
  ultimoAte,
  indiceAte,
  fmt,
  comSinal,
  dataBr,
  percentil
};
