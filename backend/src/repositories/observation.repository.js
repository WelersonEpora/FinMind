"use strict";

const { QueryTypes } = require("sequelize");
const { sequelize } = require("../models");
const { paraDatetimeSql } = require("../shared/utils/date-utils");

// Repository da camada point-in-time (observation, append-only - ADR 0008).
// De propósito NÃO expõe nenhum update/delete: a única escrita é inserir
// versões novas.

const COLUNAS_INSERT = [
  "id",
  "series_code",
  "observed_at",
  "published_at",
  "collected_at",
  "value",
  "unit",
  "source_code",
  "published_at_is_estimated",
  "revision_seq",
  "collection_execution_id",
  "metadata"
];

const TAMANHO_LOTE = 1000;

function paraLinhaSql(v) {
  return [
    v.id,
    v.series_code,
    v.observed_at,
    paraDatetimeSql(v.published_at),
    paraDatetimeSql(v.collected_at),
    v.value,
    v.unit,
    v.source_code,
    v.published_at_is_estimated ? 1 : 0,
    v.revision_seq,
    v.collection_execution_id,
    v.metadata ? JSON.stringify(v.metadata) : null
  ];
}

// Insere versões novas. INSERT IGNORE só como rede de segurança contra a
// chave única (series_code, observed_at, published_at) - o serviço já decide
// o que inserir; devolve quantas linhas REALMENTE entraram (affectedRows),
// para o chamador detectar colisões silenciosas.
async function inserirVersoes(versoes, { transaction } = {}) {
  let inseridas = 0;

  for (let i = 0; i < versoes.length; i += TAMANHO_LOTE) {
    const lote = versoes.slice(i, i + TAMANHO_LOTE).map(paraLinhaSql);
    const [resultado] = await sequelize.query(`INSERT IGNORE INTO observation (${COLUNAS_INSERT.join(", ")}) VALUES ?`, {
      replacements: [lote],
      transaction
    });
    inseridas += Number(resultado?.affectedRows ?? 0);
  }

  return inseridas;
}

// Versão mais recente (por published_at) de CADA observed_at de uma série -
// base da decisão "é novo / é o mesmo valor / é revisão" na escrita.
async function buscarUltimasVersoes(seriesCode, { transaction } = {}) {
  const linhas = await sequelize.query(
    `SELECT observed_at, value, published_at, revision_seq
       FROM (
         SELECT observed_at, value, published_at, revision_seq,
                ROW_NUMBER() OVER (PARTITION BY observed_at ORDER BY published_at DESC) AS rn
           FROM observation
          WHERE series_code = :seriesCode
       ) t
      WHERE rn = 1`,
    { replacements: { seriesCode }, type: QueryTypes.SELECT, transaction }
  );

  return new Map(linhas.map((l) => [l.observed_at, l]));
}

// asOf: "o que se sabia em `asOf`?". Para cada (series_code, observed_at)
// devolve a versão mais recente com published_at <= asOf.
//
// `estrito`: só considera versões que o FinMind de fato já tinha coletado em
// `asOf` (published_at estimado só vale a partir de collected_at). Sem
// `estrito`, uma estimativa por regra documentada vale a partir do
// published_at estimado - a visão "o que o mercado já podia saber".
async function buscarAsOf({ seriesCodes, asOf, observadoDesde, observadoAte, estrito = false }, { transaction } = {}) {
  const instante = paraDatetimeSql(asOf);
  const replacements = { seriesCodes, asOf: instante };

  const filtros = ["series_code IN (:seriesCodes)", "published_at <= :asOf"];
  if (estrito) filtros.push("(published_at_is_estimated = 0 OR collected_at <= :asOf)");
  if (observadoDesde) {
    filtros.push("observed_at >= :observadoDesde");
    replacements.observadoDesde = observadoDesde;
  }
  if (observadoAte) {
    filtros.push("observed_at <= :observadoAte");
    replacements.observadoAte = observadoAte;
  }

  return sequelize.query(
    `SELECT series_code, observed_at, value, unit, published_at, published_at_is_estimated, revision_seq
       FROM (
         SELECT series_code, observed_at, value, unit, published_at, published_at_is_estimated, revision_seq,
                ROW_NUMBER() OVER (PARTITION BY series_code, observed_at ORDER BY published_at DESC) AS rn
           FROM observation
          WHERE ${filtros.join(" AND ")}
       ) t
      WHERE rn = 1
      ORDER BY series_code, observed_at`,
    { replacements, type: QueryTypes.SELECT, transaction }
  );
}

// Última observação (período mais recente) de uma série, na versão vigente
// hoje - alimenta o "valor atual" da tela de Observáveis.
async function buscarMaisRecente(seriesCode, { transaction } = {}) {
  const [linha] = await sequelize.query(
    `SELECT series_code, observed_at, value, unit, published_at, published_at_is_estimated, collected_at
       FROM observation
      WHERE series_code = :seriesCode AND published_at <= :agora
      ORDER BY observed_at DESC, published_at DESC
      LIMIT 1`,
    { replacements: { seriesCode, agora: paraDatetimeSql(new Date()) }, type: QueryTypes.SELECT, transaction }
  );
  return linha || null;
}

const COLUNAS_ORDENACAO_HISTORICO = { referenceDate: "observed_at", value: "value" };

// Histórico paginado na visão "vigente hoje" (asOf = agora): uma linha por
// (série, período observado), a versão mais recente. É a mesma regra do
// buscarAsOf, com filtro por período, ordenação e paginação para a tela.
async function buscarHistoricoAtual({ seriesCodes, dataInicio, dataFim, ordenarPor, ordem, limite, deslocamento }, { transaction } = {}) {
  const replacements = { seriesCodes, agora: paraDatetimeSql(new Date()), limite, deslocamento };
  const filtros = ["series_code IN (:seriesCodes)", "published_at <= :agora"];
  if (dataInicio) {
    filtros.push("observed_at >= :dataInicio");
    replacements.dataInicio = dataInicio;
  }
  if (dataFim) {
    filtros.push("observed_at <= :dataFim");
    replacements.dataFim = dataFim;
  }
  const where = filtros.join(" AND ");
  const coluna = COLUNAS_ORDENACAO_HISTORICO[ordenarPor] || COLUNAS_ORDENACAO_HISTORICO.referenceDate;
  const direcao = ordem === "ASC" ? "ASC" : "DESC";

  const registros = await sequelize.query(
    `SELECT series_code, observed_at, value, unit, published_at, published_at_is_estimated, collected_at
       FROM (
         SELECT series_code, observed_at, value, unit, published_at, published_at_is_estimated, collected_at,
                ROW_NUMBER() OVER (PARTITION BY series_code, observed_at ORDER BY published_at DESC) AS rn
           FROM observation
          WHERE ${where}
       ) t
      WHERE rn = 1
      ORDER BY ${coluna} ${direcao}, series_code ASC
      LIMIT :limite OFFSET :deslocamento`,
    { replacements, type: QueryTypes.SELECT, transaction }
  );

  const [{ total }] = await sequelize.query(
    `SELECT COUNT(*) AS total FROM (SELECT DISTINCT series_code, observed_at FROM observation WHERE ${where}) t`,
    { replacements, type: QueryTypes.SELECT, transaction }
  );

  return { registros, total: Number(total) };
}

// Tickers distintos de um grupo de séries `<prefixo>.<TICKER>.<CAMPO>` (ex.:
// vencimentos do CCM), com a cobertura de cada um, medida numa série de
// referência que existe em todo pregão (ex.: SETTLE).
async function listarVencimentos({ prefixoSerie, campoReferencia }, { transaction } = {}) {
  // posição do ticker no código (contada a partir de um prefixo constante do catálogo)
  const posicao = prefixoSerie.split(".").length + 1;
  return sequelize.query(
    `SELECT SUBSTRING_INDEX(SUBSTRING_INDEX(series_code, '.', ${posicao}), '.', -1) AS ticker,
            MIN(observed_at) AS primeira_data,
            MAX(observed_at) AS ultima_data,
            COUNT(DISTINCT observed_at) AS pregoes
       FROM observation
      WHERE series_code LIKE :padrao
      GROUP BY ticker
      ORDER BY ticker`,
    { replacements: { padrao: `${prefixoSerie}.%.${campoReferencia}` }, type: QueryTypes.SELECT, transaction }
  );
}

// Resumo por série (cobertura) - usado para reportar o que já está no banco.
// Sem `seriesCodes`, resume todas.
async function resumirSeries(seriesCodes, { transaction } = {}) {
  return sequelize.query(
    `SELECT series_code, source_code,
            COUNT(*) AS total_versoes,
            COUNT(DISTINCT observed_at) AS total_observacoes,
            MIN(observed_at) AS primeira_data,
            MAX(observed_at) AS ultima_data,
            SUM(published_at_is_estimated) AS versoes_estimadas
       FROM observation
      ${seriesCodes ? "WHERE series_code IN (:seriesCodes)" : ""}
      GROUP BY series_code, source_code
      ORDER BY series_code`,
    { replacements: { seriesCodes }, type: QueryTypes.SELECT, transaction }
  );
}

module.exports = { inserirVersoes, buscarUltimasVersoes, buscarAsOf, buscarMaisRecente, buscarHistoricoAtual, listarVencimentos, resumirSeries };
