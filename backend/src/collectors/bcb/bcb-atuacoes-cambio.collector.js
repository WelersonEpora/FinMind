"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { zonedParaUtc } = require("../../shared/utils/zoned-time");
const { combinacaoDe } = require("../../shared/utils/bcb-atuacao-cambio");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// Atuações do BCB no mercado de câmbio (fator 27 do relatório do Comitê sobre o dólar; fase 1 do dólar, só aquisição,
// ADR 0122). Fonte: o CSV "Histórico de Atuações no Mercado de Câmbio" do Portal de Dados Abertos do BCB, uma linha por
// atuação desde 1999-01-22 (o câmbio flutuante): instrumento (swap, venda à vista, linha...), modalidade (tradicional,
// reverso, PTAX...), data, volumes ofertado e aceito em US$ e taxa de corte.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-09: 10.439 atuações, 15 colunas em todas, 13 pares instrumento/modalidade;
// a última atuação era de 2026-08-27 (o BCB atualiza o arquivo no último dia útil do mês, com o mês anterior).
//
// Gravado POR DIA e por par instrumento/modalidade (`BCB.ATUACAO_CAMBIO.<ITEM>.<CAMPO>`): ACEITO_USD e OFERTADO_USD (a
// soma do dia, em US$) e LEILOES (quantas atuações). Vários leilões do mesmo par num dia são comuns (rolagem de swap
// em lotes): somar é aritmética, não interpretação. A rolagem de swap não é separada da oferta nova: o CSV não diz qual
// é qual. O par desconhecido vira item inválido (não é adivinhado).
//
// published_at (ESTIMADO): o fim do dia da atuação em Brasília. O resultado de cada leilão é divulgado pelo BCB no dia
// dele; o CSV só o traz no fim do mês seguinte, mas a informação já era pública (é o que vale para um teste histórico).

const URL_CSV = "https://www.bcb.gov.br/conteudo/dadosabertos/BCBDepin/historico-atuacoes-mercado-cambio.csv";
const SOURCE_CODE = "BCB_DADOS_ABERTOS";
const PREFIXO_SERIE = "BCB.ATUACAO_CAMBIO";
const FUSO = "America/Sao_Paulo";
const CABECALHO = [
  "Comunicação",
  "Data Hora Comunicação",
  "Comunicado",
  "Data Hora Comunicado",
  "Data Hora Anúncio",
  "Procedimento Operacional",
  "Data",
  "Instrumento",
  "Modalidade",
  "Tipo Composto",
  "Data de Liquidação",
  "Data de Vencimento",
  "Volume USD Ofertado",
  "Volume USD Aceito",
  "Taxa de Corte"
];
const COLUNA = Object.fromEntries(CABECALHO.map((nome, i) => [nome, i]));
const REGEX_DATA = /^(\d{4}-\d{2}-\d{2})(?: 00:00:00)?$/;

// Uma linha do CSV (vírgula como separador, campos com vírgula decimal entre aspas).
function separarCampos(linha) {
  const campos = [];
  let atual = "";
  let aspas = false;
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas;
    else if (ch === "," && !aspas) {
      campos.push(atual);
      atual = "";
    } else atual += ch;
  }
  campos.push(atual);
  return campos;
}

// "3000000000,00" -> 3000000000; vazio -> null; ilegível -> NaN.
function numero(texto) {
  if (texto === undefined || texto.trim() === "") return null;
  const valor = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? valor : NaN;
}

function parse(csv) {
  if (typeof csv !== "string" || !csv.trim()) throw new UpstreamServiceError("CSV de atuações do BCB vazio.");
  const linhas = csv.replace(/^﻿/, "").trim().split(/\r?\n/);
  const cabecalho = separarCampos(linhas[0]);
  if (cabecalho.join("|") !== CABECALHO.join("|")) {
    throw new UpstreamServiceError(`Colunas do CSV de atuações do BCB diferentes do esperado (layout mudou?): "${linhas[0].slice(0, 120)}".`);
  }
  return linhas.slice(1).map((linha) => separarCampos(linha));
}

function normalize(linhas) {
  const validos = [];
  const invalidos = [];
  const porDia = new Map(); // "<data>|<codigo>" -> { data, combinacao, aceito, ofertado, leiloes, compostos }

  for (const campos of linhas) {
    const invalido = (motivo) => invalidos.push({ item: campos.join(","), motivo });
    if (campos.length !== CABECALHO.length) {
      invalido(`Linha com ${campos.length} colunas (esperadas ${CABECALHO.length}).`);
      continue;
    }
    const data = REGEX_DATA.exec(campos[COLUNA.Data])?.[1];
    if (!data) {
      invalido(`Data da atuação em formato inesperado: "${campos[COLUNA.Data]}".`);
      continue;
    }
    const combinacao = combinacaoDe(campos[COLUNA.Instrumento], campos[COLUNA.Modalidade]);
    if (!combinacao) {
      invalido(`Par instrumento/modalidade desconhecido: "${campos[COLUNA.Instrumento]} / ${campos[COLUNA.Modalidade]}" (incluir em bcb-atuacao-cambio.js).`);
      continue;
    }
    const aceito = numero(campos[COLUNA["Volume USD Aceito"]]);
    const ofertado = numero(campos[COLUNA["Volume USD Ofertado"]]);
    if (Number.isNaN(aceito) || Number.isNaN(ofertado)) {
      invalido(`Volume ilegível em ${data} (${combinacao.codigo}).`);
      continue;
    }

    const chave = `${data}|${combinacao.codigo}`;
    const dia = porDia.get(chave) ?? { data, combinacao, aceito: null, ofertado: null, leiloes: 0, compostos: new Set() };
    if (aceito !== null) dia.aceito = (dia.aceito ?? 0) + aceito;
    if (ofertado !== null) dia.ofertado = (dia.ofertado ?? 0) + ofertado;
    dia.leiloes += 1;
    if (campos[COLUNA["Tipo Composto"]]) dia.compostos.add(campos[COLUNA["Tipo Composto"]]);
    porDia.set(chave, dia);
  }

  for (const dia of porDia.values()) {
    const publicadoEm = zonedParaUtc(dia.data, "23:59:59", FUSO);
    const base = {
      observed_at: dia.data,
      source_code: SOURCE_CODE,
      published_at: publicadoEm,
      published_at_is_estimated: true,
      published_at_basis: "lag_rule",
      metadata: {
        fonte: "BCB - Histórico de Atuações no Mercado de Câmbio",
        instrumento: dia.combinacao.instrumento,
        modalidade: dia.combinacao.modalidade,
        ...(dia.compostos.size ? { tipoComposto: [...dia.compostos] } : {}),
        regraPublicacao: "fim_do_dia_da_atuacao_brt"
      }
    };
    const serie = (campo) => `${PREFIXO_SERIE}.${dia.combinacao.codigo}.${campo}`;
    if (dia.aceito !== null) validos.push({ ...base, series_code: serie("ACEITO_USD"), value: dia.aceito, unit: "USD" });
    if (dia.ofertado !== null) validos.push({ ...base, series_code: serie("OFERTADO_USD"), value: dia.ofertado, unit: "USD" });
    validos.push({ ...base, series_code: serie("LEILOES"), value: dia.leiloes, unit: "atuacoes" });
  }

  return { validos, invalidos };
}

module.exports = {
  codigo: "bcb-atuacoes-cambio",
  get timeoutMs() {
    return Math.max(env.collectors.sourceTimeoutMs, 60000);
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  // O arquivo inteiro (~1,3 MB) a cada coleta: é pequeno e a fonte só o troca uma vez por mês.
  download: ({ signal }) => baixar(URL_CSV, { signal }),
  parse,
  normalize,
  persist: persistirObservacoes,
  separarCampos,
  PREFIXO_SERIE
};
