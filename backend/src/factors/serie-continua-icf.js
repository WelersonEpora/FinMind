"use strict";

const observationRepository = require("../repositories/observation.repository");
const { decodificarFuturoB3 } = require("../shared/utils/b3-contrato");
const { PARAMETROS_PADRAO, montarSerieContinua, pregaoAntes } = require("./base/serie-continua-futuro");

// Série contínua do ICF da B3 (café arábica, US$/saca): o ICF-CA, "ICF contínuo ajustado" (análise do café de
// 2026-10-19, itens E1 e E11; sancionada pelo Comitê com a regra de rolagem como estava, ADR 0140, adendo). A regra de
// rolagem e o ajuste estão em base/serie-continua-futuro.js. Calculada sob demanda, NUNCA gravada: o código da série
// (SERIE_CONTINUA_ICF.seriesCode) não existe na observation. É o preço de referência do café desde a configuração v8:
// os quatro horizontes da leitura, o realizado e o Centro de Decisão.
//
// O que o histórico do ICF mostrou (2022-03 a 2026-10, banco de dev):
//   - O mercado gira em H, U e Z (março, setembro e dezembro); o K (maio) às vezes negocia e o N (julho) quase nunca:
//     nos 20 pregões antes do vencimento do N26, 0 contratos no N26 contra 12.748 no U26.
//   - Os negócios migram para o vencimento seguinte de 18 a 27 pregões antes do último pregão.
//   - Os contratos em aberto só existem até 2025-12-11 (vêm do BDI): a liquidez é medida pelos contratos negociados.

const PREFIXO = "B3.ICF";
const CAMPO_AJUSTE = "SETTLE";
const CAMPO_NEGOCIADOS = "CONTRACTS";
// Os dias fixos sem pregão na B3 ("MM-DD"): os feriados nacionais de data fixa e 24 e 31 de dezembro. Os móveis
// (Carnaval, Sexta-feira Santa, Corpus Christi) ficam de fora: no último pregão do ICF, só dezembro tem feriado perto.
const FERIADOS_FIXOS = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-24", "12-25", "12-31"]);

// O último pregão de um vencimento do ICF: o 6º dia útil antes do último dia útil do mês de vencimento. Conferido no
// banco: 22/09/2026 (U26), 18/12/2025 (Z25), 23/03/2026 (H26), 22/05/2025 (K25), 23/07/2025 (N25), 18/12/2024 (Z24).
function ultimoPregaoIcf({ ano, mes }) {
  const ultimoDoMes = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  return pregaoAntes(ultimoDoMes, 6, FERIADOS_FIXOS);
}

function agruparPorTicker(linhas) {
  const porTicker = new Map();
  for (const linha of linhas) {
    const ticker = linha.series_code.split(".")[2];
    if (!porTicker.has(ticker)) porTicker.set(ticker, new Map());
    porTicker.get(ticker).set(linha.observed_at, Number(linha.value));
  }
  return porTicker;
}

// A série contínua do ICF com o que se sabia em `asOf`. -> { pontos, trocas, parametros }; cada ponto com a publicação
// do ajuste do contrato do dia (`publicadoEm`, `estimado`).
async function calcularSerieContinuaIcf({ asOf = new Date(), parametros = PARAMETROS_PADRAO } = {}, deps = {}) {
  const repo = deps.observationRepository || observationRepository;
  const contratos = (await repo.listarUltimasDatasItens({ prefixoSerie: PREFIXO, campoReferencia: CAMPO_AJUSTE }))
    .map((item) => decodificarFuturoB3(item.codigo, "ICF"))
    .filter(Boolean)
    .map((c) => ({ ticker: c.ticker, vencimento: c.vencimento, ultimoPregao: ultimoPregaoIcf(c) }));
  const serie = (campo) => contratos.map((c) => `${PREFIXO}.${c.ticker}.${campo}`);
  const [ajustes, negociados] = await Promise.all([
    repo.buscarAsOf({ seriesCodes: serie(CAMPO_AJUSTE), asOf }),
    repo.buscarAsOf({ seriesCodes: serie(CAMPO_NEGOCIADOS), asOf })
  ]);
  const resultado = montarSerieContinua(
    { contratos, ajustes: agruparPorTicker(ajustes), negociados: agruparPorTicker(negociados), feriados: FERIADOS_FIXOS },
    parametros
  );
  const publicacao = new Map(ajustes.map((l) => [`${l.series_code.split(".")[2]}|${l.observed_at}`, l]));
  const pontos = resultado.pontos.map((p) => {
    const linha = publicacao.get(`${p.ticker}|${p.data}`);
    return { ...p, publicadoEm: linha?.published_at ?? null, estimado: Boolean(Number(linha?.published_at_is_estimated)) };
  });
  return { ...resultado, pontos, parametros: { ...PARAMETROS_PADRAO, ...parametros } };
}

// O nome e o código da série (ADR 0140, adendo). Ao lado, em cada data, vai o contrato do dia (ex.: "ICF-CA · ICFZ26");
// o contrato por vencimento continua com o nome da B3.
const SERIE_CONTINUA_ICF = Object.freeze({
  codigo: "ICF-CA",
  nome: "ICF contínuo ajustado",
  seriesCode: "FINMIND.ICF.ICF-CA.AJUSTE",
  campo: CAMPO_AJUSTE,
  calcular: calcularSerieContinuaIcf
});

module.exports = { FERIADOS_FIXOS, SERIE_CONTINUA_ICF, ultimoPregaoIcf, calcularSerieContinuaIcf };
