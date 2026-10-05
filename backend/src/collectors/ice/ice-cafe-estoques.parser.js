"use strict";

const XLSX = require("xlsx");

// Leitura do relatório diário de estoques certificados do café "C" da ICE Futures U.S. (XLS antigo, uma aba). ADR 0032.
//
// Layout conferido em arquivos reais de 2016-01-04, 2021-07-21 e 2026-09-25:
//   "ICE Futures U.S." / 'COFFEE "C" CERTIFIED WAREHOUSE STOCK REPORT' / "As of: Sep 25, 2026  1:18:21PM"
//   (desde algum ponto entre 2021 e 2026, uma linha "TOTAL BAGS CERTIFIED")
//   [vazio, <portos...>, "Total"]            <- os portos MUDAM com o tempo (NOLA, VA...) e o nome deles também
//   ["Brazil", ..., 52791]                   <- uma linha por país de ORIGEM com saca certificada
//   ["Total in Bags", ..., 254304]
//   depois: sacas de transição (2026), classificação do dia, pendentes de classificação, marcadas para reensaque.
//
// Do primeiro bloco entra só a coluna "Total" (sacas certificadas por origem e o total geral): a quebra por porto
// muda de colunas ao longo dos anos. A soma das origens tem de fechar com o "Total in Bags": se não fechar, o arquivo
// foi mal lido e nada dele é gravado. Origem que não aparece num dia = nenhuma saca certificada dela naquele dia; o
// FinMind NÃO grava zero por ela.
//
// Do bloco "Pending Grading Report" (sacas entregues para classificação e ainda não classificadas) entra SÓ O TOTAL
// (ADR 0061): o bloco muda de formato com os anos (por porto, com "Grand Total in Bags", em 2016 e 2021; por origem e
// porto, com "Total in Bags", em 2026). A soma das linhas tem de fechar com o total; se não fechar, ou se o bloco não
// existir, só o pendente fica de fora (o certificado é gravado) e o motivo vai em `motivoPendente`.

const TITULO = 'COFFEE "C" CERTIFIED WAREHOUSE STOCK REPORT';
const ROTULO_TOTAL = "Total in Bags";
const MESES = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
// Horário e sufixo opcionais: casos reais "As of: Jun 11, 2026 " (sem horário) e "As of: Jun 6, 2018  2:10:33PM- Total
// Correction" (arquivo republicado com correção, 2 dias depois pelo Last-Modified).
const RE_AS_OF = /^As of:\s*([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM))?\s*(?:-\s*(.*\S))?$/;

function texto(celula) {
  return celula === null || celula === undefined ? "" : String(celula).trim();
}

// "Papua New Guinea" -> PAPUA_NEW_GUINEA. Os códigos de série não têm ponto.
function slugOrigem(nome) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// "As of: Sep 25, 2026  1:18:21PM" -> { data: "2026-09-25", horario: "13:18:21", observacao: null } (hora de Nova
// York, presumida). Sem horário, `horario` = null; o texto depois de "-" vai em `observacao` ("Total Correction").
function lerAsOf(celula) {
  const m = RE_AS_OF.exec(texto(celula));
  if (!m || !MESES[m[1]]) return null;
  const dois = (n) => String(n).padStart(2, "0");
  let horario = null;
  if (m[4] !== undefined) {
    const hora = (Number(m[4]) % 12) + (m[7] === "PM" ? 12 : 0);
    horario = `${dois(hora)}:${m[5]}:${m[6]}`;
  }
  return { data: `${m[3]}-${dois(MESES[m[1]])}-${dois(m[2])}`, horario, observacao: m[8] ?? null };
}

// Cabeçalho do 1º bloco: 1ª célula vazia e a última preenchida = "Total".
function ehCabecalhoDoBloco(linha) {
  const preenchidas = linha.map(texto);
  return preenchidas[0] === "" && preenchidas.filter(Boolean).at(-1) === "Total";
}

function localizarBloco(linhas) {
  const inicio = linhas.findIndex(ehCabecalhoDoBloco);
  if (inicio < 0) throw new Error('não achei o cabeçalho do bloco de sacas certificadas (linha terminando em "Total").');
  const colunaTotal = linhas[inicio].map(texto).lastIndexOf("Total");
  const fim = linhas.findIndex((l, i) => i > inicio && texto(l[0]) === ROTULO_TOTAL);
  if (fim < 0) throw new Error(`não achei a linha "${ROTULO_TOTAL}" depois do cabeçalho.`);
  return { inicio, fim, colunaTotal };
}

const TITULO_PENDENTE = "PENDING GRADING REPORT";
const RE_TOTAL_PENDENTE = /^(Grand )?Total in Bags$/i;
// Linha de texto sem número dentro do bloco: "No Bags Pending ..." (dia sem saca pendente) = zero.
const RE_SEM_SACAS = /^No Bags\b/i;

// Um título de bloco: só a 1ª célula preenchida, em texto, e a linha seguinte é um cabeçalho.
function ehTituloDeBloco(linha) {
  return typeof linha[0] === "string" && linha.slice(1).every((c) => texto(c) === "");
}

// -> { total } | { motivo }. Nunca lança: o pendente é um bloco auxiliar.
function lerPendentes(linhas) {
  const inicio = linhas.findIndex((l) => texto(l[0]).toUpperCase() === TITULO_PENDENTE);
  if (inicio < 0) return { motivo: 'bloco "Pending Grading Report" ausente.' };
  let soma = 0;
  let coluna = null;
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    const linha = linhas[i];
    const rotulo = texto(linha[0]);
    if (RE_TOTAL_PENDENTE.test(rotulo)) {
      const total = lerSacas(coluna === null ? null : linha[coluna]);
      if (total === null) return { motivo: `total pendente ilegível: ${JSON.stringify(linha)}.` };
      if (soma !== total) return { motivo: `a soma das linhas pendentes (${soma}) não fecha com o total (${total}).` };
      return { total };
    }
    if (coluna === null) {
      if (RE_SEM_SACAS.test(rotulo)) return { total: 0 };
      // Cabeçalho: a coluna dos valores é a última preenchida ("Total" em 2026, "Bags" em 2016).
      coluna = linha.map(texto).findLastIndex(Boolean);
      if (coluna < 1) return { motivo: `cabeçalho do bloco pendente ilegível: ${JSON.stringify(linha)}.` };
      continue;
    }
    if (ehTituloDeBloco(linha)) return { motivo: `bloco pendente sem linha de total (chegou a "${rotulo}").` };
    const sacas = lerSacas(linha[coluna]);
    if (sacas === null) return { motivo: `linha pendente ilegível: ${JSON.stringify(linha)}.` };
    soma += sacas;
  }
  return { motivo: "bloco pendente sem linha de total (fim do arquivo)." };
}

function lerSacas(valor) {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 ? valor : null;
}

/**
 * Buffer do XLS -> { asOf, origens: [{ codigo, nome, sacas }], total, pendente, motivoPendente }. Qualquer desvio de layout é erro (a coleta
 * daquele dia não grava nada), nunca um número lido da coluna errada.
 */
function lerRelatorio(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const aba = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(aba, { header: 1, blankrows: false, defval: null });

  if (!linhas.slice(0, 5).some((l) => texto(l[0]).toUpperCase() === TITULO)) {
    throw new Error(`o arquivo não é o relatório de estoques certificados do café "C" (título "${TITULO}" ausente).`);
  }
  const linhaAsOf = linhas.slice(0, 6).find((l) => texto(l[0]).startsWith("As of:"));
  const asOf = linhaAsOf && lerAsOf(linhaAsOf[0]);
  if (!asOf) throw new Error(`data do relatório ilegível: ${JSON.stringify(linhaAsOf?.[0] ?? null)}.`);

  const { inicio, fim, colunaTotal } = localizarBloco(linhas);
  const origens = [];
  for (const linha of linhas.slice(inicio + 1, fim)) {
    const nome = texto(linha[0]);
    const sacas = lerSacas(linha[colunaTotal]);
    const codigo = slugOrigem(nome);
    if (!codigo || sacas === null) throw new Error(`linha de origem ilegível: ${JSON.stringify(linha)}.`);
    if (origens.some((o) => o.codigo === codigo)) throw new Error(`origem repetida no bloco: ${nome}.`);
    origens.push({ codigo, nome, sacas });
  }

  const total = lerSacas(linhas[fim][colunaTotal]);
  if (total === null) throw new Error(`total ilegível: ${JSON.stringify(linhas[fim])}.`);
  const soma = origens.reduce((s, o) => s + o.sacas, 0);
  if (soma !== total) throw new Error(`a soma das origens (${soma}) não fecha com o "${ROTULO_TOTAL}" (${total}).`);

  const pendentes = lerPendentes(linhas.slice(fim + 1));
  return { asOf, origens, total, pendente: pendentes.total ?? null, motivoPendente: pendentes.motivo ?? null };
}

module.exports = { lerRelatorio, lerAsOf, slugOrigem, lerPendentes };
