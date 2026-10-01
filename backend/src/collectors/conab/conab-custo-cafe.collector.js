"use strict";

const { URL } = require("node:url");
const XLSX = require("xlsx");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { persistirObservacoes } = require("../base/persist-observations");

// Conab - custo de produção do café (arábica e conilon), série histórica por município, das planilhas de custos de
// produção da Conab. Fator do café "Custo de produção e preço mínimo" (Médio) da planilha `controle_fatores.xlsx`
// (fontes "Conab, MAPA"). ADR 0043.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-01:
//   - A página "Planilhas de Custos de Produção - Agrícolas" da Conab lista `seriehistoricacustoscafearabica2003a2025.xls`
//     (2,4 MB, 198 abas) e `seriehistoricacustoscafeconilon2007a2025.xls` (1,1 MB, 89 abas). O nome traz o último ano:
//     muda a cada ano, por isso o coletor acha o link na página, não monta a URL.
//   - Uma aba por município e ano ("Patrocínio-MG-2025"; variantes "-S.Mec"/"-Mec"; "SP-Franca 2019" desde 2019),
//     além do "Índice". O layout dos ITENS muda ao longo dos anos (numeração e rótulos); os 4 TOTAIS são estáveis:
//     custo variável (A+B+C=D), fixo (E+F=G), operacional (D+G=H) e total (H+I=J), cada um em R$/ha e R$/60 kg.
//   - Referência de preços: "Mês/Ano: Outubro/2025" (abas novas) ou "A PREÇOS DE: 24.07.2003" (antigas, às vezes
//     como data serial do Excel). Guardada nos metadados.
//   - O preço mínimo (PGPM) fica num aplicativo da Conab que exige reCAPTCHA em toda consulta: não é coletado.
//
// published_at: a fonte não informa quando publicou cada custo (nem a página, nem o arquivo): vale a data da coleta
// (estimado). O mês de referência dos preços fica nos metadados, para quem quiser aplicar uma defasagem. Sem versões:
// uma revisão vira versão nova (ADR 0008).

const URL_PAGINA =
  "https://www.gov.br/conab/pt-br/atuacao/informacoes-agropecuarias/custos-de-producao/planilhas-de-custos-de-producao/copy_of_agricolas";
const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";
const SOURCE_CODE = "CONAB";
const PREFIXO_SERIE = "CONAB.CAFE_CUSTO";
const TIPOS = [
  { tipo: "ARABICA", link: /href="([^"]*custos-?cafe-?arabica[^"]*\.xlsx?)"/i },
  { tipo: "CONILON", link: /href="([^"]*custos-?cafe-?conilon[^"]*\.xlsx?)"/i }
];
const TOTAIS = [
  { campo: "VARIAVEL", rotulo: /^custo vari[aá]vel\s*\(/i },
  { campo: "FIXO", rotulo: /^custo fixo\s*\(/i },
  { campo: "OPERACIONAL", rotulo: /^custo operacional\s*\(/i },
  { campo: "TOTAL", rotulo: /^custo total\s*\(/i }
];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const semAcento = (texto) => String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "");

// "Outubro" | "Jun" | "março" -> 1..12, ou 0.
function numeroDoMes(nome) {
  return MESES.indexOf(semAcento(nome).toLowerCase().slice(0, 3)) + 1;
}

const anoMes = (ano, mes) => `${ano}-${String(mes).padStart(2, "0")}`;

// "Patrocínio-MG-2025" | "Guaxupé-MG-2014-S.Mec" | "SP-Franca 2019" -> { local: "Patrocínio-MG[-S.Mec]", ano } ou null.
function lerNomeDaAba(nome) {
  const texto = String(nome).trim();
  let m = /^(.+)-(\d{4})(?:-(.+))?$/.exec(texto);
  if (m) return { local: m[3] ? `${m[1]}-${m[3]}` : m[1], ano: Number(m[2]) };
  m = /^([A-Z]{2})-(.+) (\d{4})$/.exec(texto);
  if (m) return { local: `${m[2]}-${m[1]}`, ano: Number(m[3]) };
  return null;
}

// "S.S. Paraíso-MG-S.Mec" -> "S_S_PARAISO_MG_S_MEC"
function codigoDoLocal(local) {
  return semAcento(local).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// Mês de referência dos preços ("AAAA-MM") ou null.
function mesDeReferencia(linhas) {
  for (const linha of linhas.slice(0, 12)) {
    const texto = linha.map((c) => String(c)).join(" ");
    const novo = /M[eê]s\/Ano:\s*([A-Za-zçÇ]+)\/(\d{4})/i.exec(texto);
    if (novo && numeroDoMes(novo[1]) > 0) return anoMes(novo[2], numeroDoMes(novo[1]));
    if (/A PRE[ÇC]OS DE/i.test(texto)) {
      const valor = linha.find((c, i) => i > linha.findIndex((x) => /A PRE[ÇC]OS DE/i.test(String(x))) && String(c).trim() !== "");
      if (typeof valor === "number" && valor > 20000 && valor < 80000) {
        const data = new Date(Date.UTC(1899, 11, 30) + valor * 86400000);
        return data.toISOString().slice(0, 7);
      }
      const d = /(\d{1,2})[./](\d{1,2})[./](\d{2,4})/.exec(String(valor));
      if (d) {
        const ano = d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3]);
        return anoMes(ano, Number(d[2]));
      }
      const abreviado = /([A-Za-zçÇ]{3,})\/(\d{4})/.exec(String(valor));
      if (abreviado && numeroDoMes(abreviado[1]) > 0) return anoMes(abreviado[2], numeroDoMes(abreviado[1]));
    }
  }
  return null;
}

// Os 4 totais de uma aba: { campo -> { ha, saca } }, só os que aparecem.
function lerTotais(linhas) {
  const totais = {};
  for (const linha of linhas) {
    const rotulo = String(linha.find((c) => typeof c === "string" && c.trim() !== "") || "").trim();
    const total = TOTAIS.find((t) => t.rotulo.test(rotulo));
    if (!total || totais[total.campo]) continue;
    const numeros = linha.filter((c) => typeof c === "number");
    if (numeros.length >= 2) totais[total.campo] = { ha: numeros[0], saca: numeros[1] };
  }
  return totais;
}

async function buscar(url, { signal, fetchFn = fetch }) {
  let resposta;
  try {
    resposta = await fetchFn(url, { signal, headers: { "user-agent": USER_AGENT } });
  } catch (err) {
    throw new UpstreamServiceError(`Falha de rede ao consultar a Conab: ${err.message}`);
  }
  if (!resposta.ok) throw new UpstreamServiceError(`Conab respondeu com status ${resposta.status} (${new URL(url).pathname}).`);
  return resposta;
}

async function download({ signal, fetchFn } = {}) {
  const pagina = await (await buscar(URL_PAGINA, { signal, fetchFn })).text();
  const planilhas = [];
  for (const { tipo, link } of TIPOS) {
    const url = link.exec(pagina)?.[1];
    if (!url) throw new UpstreamServiceError(`A página de custos da Conab não tem mais o link da série do café ${tipo.toLowerCase()}.`);
    const resposta = await buscar(new URL(url, URL_PAGINA).href, { signal, fetchFn });
    planilhas.push({ tipo, arquivo: url.split("/").pop(), buffer: Buffer.from(await resposta.arrayBuffer()) });
  }
  return planilhas;
}

function parse(planilhas) {
  if (!Array.isArray(planilhas)) throw new UpstreamServiceError("Resposta da Conab em formato inesperado (esperava as planilhas).");
  const itens = [];
  for (const { tipo, arquivo, buffer } of planilhas) {
    let wb;
    try {
      wb = XLSX.read(buffer);
    } catch (err) {
      throw new UpstreamServiceError(`Planilha ${arquivo} da Conab ilegível: ${err.message}`);
    }
    for (const aba of wb.SheetNames) {
      if (/^[ÍI]ndice$/i.test(aba.trim())) continue;
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, defval: "" });
      itens.push({ tipo, arquivo, aba, nome: lerNomeDaAba(aba), totais: lerTotais(linhas), mesReferencia: mesDeReferencia(linhas) });
    }
  }
  return itens;
}

function normalize(itens) {
  const validos = [];
  const invalidos = [];
  const avisos = [];
  const vistos = new Set();
  for (const { tipo, arquivo, aba, nome, totais, mesReferencia } of itens) {
    const item = { tipo, arquivo, aba };
    if (!nome) {
      invalidos.push({ item, motivo: `Aba "${aba}" fora do padrão "Município-UF-AAAA".` });
      continue;
    }
    const presentes = TOTAIS.filter((t) => totais[t.campo]);
    if (presentes.length === 0) {
      invalidos.push({ item, motivo: `Aba "${aba}" sem nenhum dos totais de custo.` });
      continue;
    }
    // Defeito conhecido da fonte: abas da agricultura familiar de RO em 2014 param no custo operacional.
    const faltando = TOTAIS.filter((t) => !totais[t.campo]).map((t) => t.campo);
    if (faltando.length > 0) avisos.push({ item, motivo: `Aba "${aba}" sem o(s) total(is) ${faltando.join(", ")} na fonte: gravados só os demais.` });
    const local = codigoDoLocal(nome.local);
    const chave = `${tipo}.${local}.${nome.ano}`;
    if (vistos.has(chave)) {
      invalidos.push({ item, motivo: `Aba "${aba}" repete o local e o ano de outra aba.` });
      continue;
    }
    vistos.add(chave);
    for (const { campo } of presentes) {
      for (const [sufixo, unit] of [
        ["HA", "R$/ha"],
        ["SACA", "R$/sc 60 kg"]
      ]) {
        const value = totais[campo][sufixo === "HA" ? "ha" : "saca"];
        if (!Number.isFinite(value) || value < 0) {
          invalidos.push({ item: { ...item, campo }, motivo: `Valor inválido em ${campo} (${unit}): "${value}".` });
          continue;
        }
        validos.push({
          series_code: `${PREFIXO_SERIE}.${tipo}.${local}.${campo}_${sufixo}`,
          observed_at: `${nome.ano}-01-01`,
          value: Math.round(value * 100) / 100,
          unit,
          source_code: SOURCE_CODE,
          metadata: { fonte: "Conab - custos de produção, série histórica", arquivo, aba, local: nome.local, mesReferenciaPrecos: mesReferencia }
        });
      }
    }
  }
  return { validos, invalidos, avisos };
}

module.exports = {
  codigo: "conab-custo-cafe",
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
  lerNomeDaAba,
  codigoDoLocal,
  mesDeReferencia,
  lerTotais,
  PREFIXO_SERIE
};
