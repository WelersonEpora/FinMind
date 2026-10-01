"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { UFS } = require("../../shared/utils/conab-regiao");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// ANP - produção mensal de petróleo do Brasil por UF e localização (terra ou mar), dos dados abertos da ANP. Fator do
// petróleo "Oferta não-OPEP (Brasil, Guiana, Noruega)" do FEL 1 (`controle_fatores.xlsx`: fontes "ANP, EIA, IEA";
// indicador "Produção ANP"). ADR 0041.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-01:
//   - CSV `producao-petroleo-m3.csv` (~460 KB, UTF-8 com BOM, separador ";", VÍRGULA decimal: "65031,6"), colunas
//     ANO;MÊS;GRANDE REGIÃO;UNIDADE DA FEDERAÇÃO;PRODUTO;LOCALIZAÇÃO;PRODUÇÃO (m³). Metadados oficiais: "Petróleo: óleo
//     e condensado. Não inclui LGN"; fonte "ANP - Boletim Mensal de Produção".
//   - Grade completa: 11 UFs x {TERRA, MAR} x 12 meses de cada ano, de jan/1997 a dez do ano corrente. **Os meses ainda
//     não publicados vêm com 0** (set a dez/2026 na leitura de 2026-10-01): não são gravados.
//   - A página de dados abertos traz "Produção de petróleo (metros cúbicos) 1997-2026 (atualizado em 30/9/2026)" e a
//     regra "atualizados mensalmente até o último dia do mês subsequente ao mês de referência".
//
// published_at: o MÊS MAIS RECENTE publicado entra com a data de atualização da página (real, só a data); os
// anteriores, pela regra da própria página (fim do mês seguinte ao de referência), ESTIMADO. O arquivo é substituído a
// cada mês, sem versões: uma revisão vira versão nova (ADR 0008). Fim do dia em UTC.

const URL_PAGINA = "https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/producao-de-petroleo-e-gas-natural-por-estado-e-localizacao";
const URL_CSV = "https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/ppgn-el/producao-petroleo-m3.csv";
const SOURCE_CODE = "ANP";
const PREFIXO_SERIE = "ANP.PETROLEO_PRODUCAO";
const CABECALHO = ["ANO", "MÊS", "GRANDE REGIÃO", "UNIDADE DA FEDERAÇÃO", "PRODUTO", "LOCALIZAÇÃO", "PRODUÇÃO"];
const MESES = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };
const LOCALIZACOES = new Set(["TERRA", "MAR"]);

const semAcento = (texto) => String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
const SIGLA_POR_NOME = new Map(Object.entries(UFS).map(([sigla, nome]) => [semAcento(nome), sigla]));

// "Produção de petróleo (metros cúbicos) 1997-2026 (atualizado em 30/9/2026)" -> "2026-09-30"
function extrairDataAtualizacao(html) {
  const texto = String(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const m = /Produção de petróleo \(metros cúbicos\)[^(]*\(atualizado em (\d{1,2})\/(\d{1,2})\/(\d{4})\)/i.exec(texto);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// Último dia do mês seguinte a `ano-mes`.
function fimDoMesSeguinte(ano, mes) {
  return new Date(Date.UTC(ano, mes + 1, 0)).toISOString().slice(0, 10);
}

async function download({ signal } = {}) {
  const pagina = await baixar(URL_PAGINA, { signal });
  const csv = await baixar(URL_CSV, { signal });
  return { pagina, csv };
}

function parse(rawData) {
  if (!rawData || typeof rawData.csv !== "string" || typeof rawData.pagina !== "string") {
    throw new UpstreamServiceError("Resposta da ANP em formato inesperado (esperava a página e o CSV).");
  }
  const atualizadoEm = extrairDataAtualizacao(rawData.pagina);
  if (!atualizadoEm) throw new UpstreamServiceError('Página da ANP sem a data "atualizado em" do arquivo de produção de petróleo.');

  const linhas = rawData.csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const cabecalho = linhas[0].split(";").map((c) => c.trim());
  if (cabecalho.join(";") !== CABECALHO.join(";")) {
    throw new UpstreamServiceError(`CSV da ANP com colunas inesperadas: "${linhas[0]}".`);
  }
  const itens = linhas.slice(1).map((linha) => {
    const [ano, mes, , uf, produto, localizacao, producao] = linha.split(";").map((c) => c.trim());
    return { ano, mes, uf, produto, localizacao, producao, atualizadoEm };
  });
  return itens;
}

function normalize(itens) {
  const atualizadoEm = itens[0]?.atualizadoEm;
  const invalidos = [];
  const lidos = [];
  for (const item of itens) {
    const ano = Number(item.ano);
    const mes = MESES[item.mes];
    const sigla = SIGLA_POR_NOME.get(semAcento(item.uf));
    const value = Number(String(item.producao).replace(/\./g, "").replace(",", "."));
    let motivo = null;
    if (!Number.isInteger(ano) || !mes) motivo = `Ano/mês em formato inesperado: "${item.ano}/${item.mes}".`;
    else if (!sigla) motivo = `UF desconhecida: "${item.uf}".`;
    else if (semAcento(item.produto) !== "PETROLEO") motivo = `Produto inesperado: "${item.produto}".`;
    else if (!LOCALIZACOES.has(semAcento(item.localizacao))) motivo = `Localização inesperada: "${item.localizacao}".`;
    else if (item.producao === "" || !Number.isFinite(value) || value < 0) motivo = `Produção inválida: "${item.producao}".`;
    if (motivo) {
      invalidos.push({ item: { ano: item.ano, mes: item.mes, uf: item.uf, localizacao: item.localizacao, producao: item.producao }, motivo });
      continue;
    }
    lidos.push({ ano, mes, sigla, localizacao: semAcento(item.localizacao), value });
  }

  // Último mês publicado = o último com produção no Brasil; os seguintes são os zeros do ano corrente.
  const totalPorMes = new Map();
  for (const l of lidos) {
    const chave = l.ano * 100 + l.mes;
    totalPorMes.set(chave, (totalPorMes.get(chave) || 0) + l.value);
  }
  const ultimoPublicado = Math.max(...[...totalPorMes].filter(([, total]) => total > 0).map(([chave]) => chave));
  const naoPublicados = [...totalPorMes.keys()].filter((chave) => chave > ultimoPublicado).length;
  const avisos =
    naoPublicados > 0
      ? [{ item: null, motivo: `${naoPublicados} mês(es) depois do último publicado vêm zerados no CSV da ANP (ainda não publicados): não gravados.` }]
      : [];

  const validos = [];
  for (const l of lidos) {
    const chave = l.ano * 100 + l.mes;
    if (chave > ultimoPublicado) continue;
    const regra = fimDoMesSeguinte(l.ano, l.mes);
    const publicadoEm = regra < atualizadoEm ? regra : atualizadoEm;
    const real = chave === ultimoPublicado && publicadoEm === atualizadoEm;
    validos.push({
      series_code: `${PREFIXO_SERIE}.${l.sigla}.${l.localizacao}`,
      observed_at: `${l.ano}-${String(l.mes).padStart(2, "0")}-01`,
      value: l.value,
      unit: "m³",
      source_code: SOURCE_CODE,
      published_at: fimDoDiaUtc(publicadoEm),
      published_at_is_estimated: !real,
      published_at_basis: real ? "source" : "lag_rule",
      metadata: {
        fonte: "ANP - dados abertos, produção de petróleo por UF e localização (Boletim Mensal de Produção)",
        uf: l.sigla,
        localizacao: l.localizacao,
        arquivoAtualizadoEm: atualizadoEm,
        regraPublicacao: real ? "data_de_atualizacao_da_pagina" : "fim_do_mes_seguinte"
      }
    });
  }
  return { validos, invalidos, avisos };
}

module.exports = {
  codigo: "anp-producao-petroleo",
  get timeoutMs() {
    return env.collectors.sourceTimeoutMs;
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  parse,
  normalize,
  persist: persistirObservacoes,
  extrairDataAtualizacao,
  PREFIXO_SERIE
};
