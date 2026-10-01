"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// Cecafé - resumo diário das exportações brasileiras de café. ADR 0038; reconhecimento em
// `docs/reconhecimento-fontes/cafe-cecafe-mapa-embrapa.md`.
//
// O QUE É: a página do Cecafé (associação dos exportadores) com 3 tabelas por mês, em sacas de 60 kg, por unidade
// (Santos, Vitória, Rio de Janeiro, Salvador, REDEX/EADI de Minas Gerais, outros e total) e por tipo (arábica,
// conilon, solúvel e total): a emissão de CERTIFICADOS DE ORIGEM, os DESPACHOS aduaneiros e os EMBARQUES. É o único
// dado diário de exportação de café e o único com arábica e conilon separados (o Comex Stat é mensal e não separa).
// A página mostra só o mês atual e o anterior: o histórico começa na 1ª coleta.
//
// O QUE É GRAVADO: o ACUMULADO DO MÊS de cada aba, com observed_at = 1º do mês e published_at = a data que a página
// informa ("Informações recebidas até: 30/09/2026"), fim do dia em UTC, estimado (o horário não é dito). Cada dia
// vira uma versão nova do total do mês: o histórico de versões guarda a evolução diária com a data exata. Ficam de
// fora, de propósito: o "Movimento do Dia" (é a diferença entre duas versões consecutivas) e a coluna "Mês Anterior"
// (é um comparativo parcial: em 2026-10-01 ela dava 3.725.093 certificados para agosto, e a aba de agosto, 3.775.928).
//
// HTML raspado, sem API nem contrato: quebra se o layout mudar, e a quebra vira falha explícita (formato inesperado)
// ou item inválido (unidade nova), nunca dado errado. O `robots.txt` do Cecafé não proíbe esta página (proíbe PDFs e
// /wp-*/); a página de termos de uso do site está vazia. Verificado por chamada real em 2026-10-01.

const URL_PAGINA = "https://www.cecafe.com.br/dados-estatisticos/exportacoes-brasileiras/resumo-diario/";
const SOURCE_CODE = "CECAFE";

// Título da tabela na página -> código do indicador.
const INDICADORES = [
  { re: /Emiss[aã]o de Certificados de Origem/i, codigo: "CERTIFICADOS" },
  { re: /Unidades de Despachos Aduaneiros/i, codigo: "DESPACHOS" },
  { re: /Unidades de Embarques Mar[ií]timos e Rodovi[aá]rios/i, codigo: "EMBARQUES" }
];

// Unidade na página -> código. Uma unidade nova vira item inválido (a tabela precisa ser atualizada).
const UNIDADES = {
  SANTOS: "SANTOS",
  "VITÓRIA": "VITORIA",
  "RIO DE JANEIRO": "RIO_DE_JANEIRO",
  SALVADOR: "SALVADOR",
  "REDEX E EADI (MINAS GERAIS)": "REDEX_EADI_MG",
  OUTROS: "OUTROS",
  TOTAIS: "TOTAL"
};

// Colunas de cada linha: unidade, 4 do "Movimento do Dia", 4 do "Acumulado" e 4 do "Mês Anterior". Só o acumulado
// (índices 5 a 8) é gravado.
const TIPOS_ACUMULADO = [
  [5, "ARABICA"],
  [6, "CONILON"],
  [7, "SOLUVEL"],
  [8, "TOTAL"]
];

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function textoSemTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function celulas(linhaHtml) {
  return [...linhaHtml.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => textoSemTags(m[1]));
}

// HTML -> [{ indicador, dataInformacoes, mes, unidade, valores: [12 textos] }].
function parse(html) {
  if (typeof html !== "string" || !/Resumo Di[aá]rio/i.test(html)) {
    throw new UpstreamServiceError("Página do Cecafé em formato inesperado (não achei o resumo diário).");
  }
  const itens = [];
  let dataInformacoes = null;
  let mes = null;
  let fim = 0;
  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    // O texto entre a tabela anterior e esta traz a data, o mês (no início de cada aba) e o título da tabela.
    const antes = textoSemTags(html.slice(fim, m.index));
    fim = m.index + m[0].length;
    const data = /Informa[cç][oõ]es recebidas at[eé]:\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(antes);
    if (data) dataInformacoes = `${data[3]}-${data[2]}-${data[1]}`;
    const rotuloMes = new RegExp(`(${MESES.join("|")})\\s+(\\d{4})`, "i").exec(antes);
    if (rotuloMes) mes = `${rotuloMes[2]}-${String(MESES.indexOf(rotuloMes[1].toLowerCase()) + 1).padStart(2, "0")}-01`;
    const indicador = INDICADORES.find((i) => i.re.test(antes))?.codigo;
    if (!indicador) continue; // tabela que não é do resumo (o site tem outras)

    for (const linha of m[0].match(/<tr[\s\S]*?<\/tr>/g) || []) {
      const c = celulas(linha);
      if (c.length !== 13 || /^Unidade$/i.test(c[0])) continue; // cabeçalhos
      itens.push({ indicador, dataInformacoes, mes, unidade: c[0], valores: c.slice(1) });
    }
  }
  if (itens.length === 0) throw new UpstreamServiceError("Página do Cecafé sem as tabelas do resumo diário (o layout mudou?).");
  return itens;
}

// "2.895.876" -> 2895876 (separador de milhar brasileiro); outra coisa -> NaN.
function numero(texto) {
  return /^\d{1,3}(\.\d{3})*$/.test(texto) ? Number(texto.replace(/\./g, "")) : NaN;
}

function normalize(rawItems) {
  const validos = [];
  const invalidos = [];
  for (const item of rawItems) {
    const unidade = UNIDADES[String(item.unidade).toUpperCase()];
    if (!unidade || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.dataInformacoes)) || !/^\d{4}-\d{2}-01$/.test(String(item.mes))) {
      invalidos.push({ item, motivo: `Unidade, data ou mês inesperado: "${item.unidade}" / ${item.dataInformacoes} / ${item.mes}.` });
      continue;
    }
    for (const [indice, tipo] of TIPOS_ACUMULADO) {
      const valor = numero(item.valores[indice - 1]);
      if (!Number.isFinite(valor)) {
        invalidos.push({ item, motivo: `Valor inválido em ${tipo}: "${item.valores[indice - 1]}".` });
        continue;
      }
      validos.push({
        series_code: `CECAFE.${item.indicador}.${unidade}.${tipo}`,
        observed_at: item.mes,
        value: valor,
        unit: "sacas 60 kg",
        source_code: SOURCE_CODE,
        published_at: fimDoDiaUtc(item.dataInformacoes),
        published_at_is_estimated: true,
        published_at_basis: "source",
        metadata: { fonte: "Cecafé (resumo diário)", indicador: item.indicador, unidadeCecafe: item.unidade, tipo, informacoesAte: item.dataInformacoes }
      });
    }
  }
  return { validos, invalidos };
}

module.exports = {
  codigo: "cecafe-resumo-diario",
  get timeoutMs() {
    return env.collectors.sourceTimeoutMs;
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download: ({ signal }) => baixar(URL_PAGINA, { signal }),
  parse,
  normalize,
  persist: persistirObservacoes,
  UNIDADES,
  SOURCE_CODE
};
