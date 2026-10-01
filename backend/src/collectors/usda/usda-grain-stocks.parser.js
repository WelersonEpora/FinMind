"use strict";

// Leitor do CSV do Grain Stocks do USDA NASS: só os estoques de MILHO dos EUA por posição (na fazenda, fora da
// fazenda e total), em 1º de março, junho, setembro e dezembro. ADR 0035.
//
// FORMATO (o `grst_all_tables.csv` do ZIP de cada edição no ESMIS, conferido nas 103 edições de 2001-06-29 a
// 2026-09-30): o mesmo do Prospective Plantings (linhas "t", "h", "u", "d" com o número da tabela na frente). A
// tabela usada é a "Grain Stocks by Position and Month" em unidades domésticas (mil bushels), que traz o ano
// anterior e o corrente lado a lado. Três layouts ao longo do tempo, todos tratados aqui:
//   - até 2012: o grão é uma linha de CABEÇALHO ("Corn" em todas as colunas) e as datas são "Mar 1", "Jun 1"...;
//   - 2013-01-11: CSV sem aspas, exportado do Excel, com as datas como "1-Mar", "1-Jun"...;
//   - de 2013 em diante: o grão é uma linha de DADO sem valores ("Corn",,,) e as datas são "March 1", "June 1"...
// Por isso a tabela é lida NA ORDEM das linhas (o grão vale para as datas que vêm depois dele), e as colunas são
// achadas pelo cabeçalho: o ano ("2025") e a posição ("On farms", "Off farms", "Total all positions").
//
// Cada edição traz os trimestres já publicados do ano anterior e do corrente, com o valor que o USDA tinha NAQUELE
// dia (a de janeiro revisa o 1º de setembro anterior): cada um é uma versão. Valores como publicados, sem conversão.
// Em 2010 os revisados vinham marcados com "*" ("*3497460", nota "* Revised."): o asterisco é tirado e fica em
// `revisado`.
//
// DEFEITO CONHECIDO DA FONTE: a listagem do Grain Stocks inclui uma edição que é outro relatório (2003-02-27, "Corn,
// Soybeans, and Wheat Sold Through Marketing Contracts"). `ehOutroRelatorio` a reconhece, para virar aviso.

const { lerLinhaCsv, dataDeLiberacao } = require("./usda-area-plantada.parser");

const MESES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const POSICOES = { ON_FARM: "ON_FARM", OFF_FARM: "OFF_FARM", TOTAL: "TOTAL" };

// Linhas de UMA tabela, na ordem do arquivo: [{ tipo, celulas }] (celulas[0] é o rótulo).
function linhasPorTabela(textoCsv) {
  const tabelas = new Map();
  for (const bruta of textoCsv.split(/\r?\n/)) {
    if (!bruta.trim()) continue;
    const [numero, tipo, ...celulas] = lerLinhaCsv(bruta);
    if (!numero) continue;
    if (!tabelas.has(numero)) tabelas.set(numero, []);
    tabelas.get(numero).push({ tipo, celulas: celulas.map((c) => String(c ?? "").trim()) });
  }
  return tabelas;
}

function tituloDe(linhas) {
  return linhas
    .filter((l) => l.tipo === "t" && !/Released/.test(l.celulas[0]))
    .map((l) => l.celulas[0])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// "Grain Stocks by Position and Month in Domestic Units ..." ou, até 2012, "Grain Stocks: By Position, Month, ..."
// seguido de "(Domestic Units)". A versão em unidades métricas fica de fora.
function ehTabelaPorPosicaoEMes(linhas) {
  const titulo = tituloDe(linhas);
  return /position/i.test(titulo) && /month/i.test(titulo) && !/metric/i.test(titulo);
}

// O arquivo é de outro relatório, não do Grain Stocks (a 1ª linha de título diz qual é).
function ehOutroRelatorio(textoCsv) {
  const primeira = textoCsv.split(/\r?\n/).find((l) => l.trim());
  if (!primeira) return false;
  const [, tipo, titulo] = lerLinhaCsv(primeira);
  return tipo === "t" && /Released/.test(titulo || "") && !/^Grain Stocks/i.test(String(titulo).trim());
}

// "March 1", "Mar 1", "Sept 1", "1-Mar" -> 3. Qualquer outra coisa -> null.
function mesDaData(rotulo) {
  const m = /^([A-Za-z]{3})[a-z]*\.? 1$/.exec(rotulo) || /^1-([A-Za-z]{3})$/.exec(rotulo);
  return m ? (MESES[m[1].toLowerCase()] ?? null) : null;
}

function posicaoDe(textos) {
  const t = textos.join(" ").toLowerCase();
  if (/total/.test(t)) return POSICOES.TOTAL;
  if (/\boff\b/.test(t)) return POSICOES.OFF_FARM;
  if (/\bon\b/.test(t)) return POSICOES.ON_FARM;
  return null;
}

// Colunas de valor (índice em `celulas`): { indice, ano, posicao }, pelo cabeçalho.
function colunasDe(linhas) {
  const cabecalhos = linhas.filter((l) => l.tipo === "h").map((l) => l.celulas);
  const linhaDosAnos = cabecalhos.find((h) => h.slice(1).filter((c) => /^\d{4}$/.test(c)).length >= 2);
  if (!linhaDosAnos) return [];
  const colunas = [];
  for (let c = 1; c < linhaDosAnos.length; c += 1) {
    if (!/^\d{4}$/.test(linhaDosAnos[c])) continue;
    const posicao = posicaoDe(cabecalhos.filter((h) => h !== linhaDosAnos).map((h) => h[c] || ""));
    colunas.push({ indice: c, ano: Number(linhaDosAnos[c]), posicao });
  }
  return colunas;
}

function ehMilBushels(texto) {
  return /^\(?1,000 bushels\)?$/i.test(String(texto || "").trim());
}

// Linha que dá nome ao grão: um cabeçalho com o mesmo texto em todas as colunas (até 2012) ou um dado cujo rótulo
// não é uma data (desde 2013).
function graoDaLinha(linha, colunas) {
  const valores = colunas.map((c) => linha.celulas[c.indice] || "");
  if (linha.tipo === "h" && valores[0] && valores.every((v) => v === valores[0]) && !/^\d{4}$/.test(valores[0])) return valores[0];
  // Na edição de 2010-03-31 a linha "Sorghum" veio COM valores (cópia do 1º de março): o que define o grão é o
  // rótulo que não é data, não a linha estar vazia.
  if (linha.tipo === "d" && linha.celulas[0] && !mesDaData(linha.celulas[0])) return linha.celulas[0];
  return null;
}

// CSV de uma edição -> { dataLiberacao, titulo, valores: [{ observedAt, posicao, valor }] }. Lança erro se a tabela,
// as colunas ou a unidade não forem os esperados, ou se faltar o milho: é melhor recusar a edição do que gravar
// errado (inclusive uma data repetida no bloco do milho). Célula vazia (trimestre ainda não estimado) ou "(D)"
// (sigilo) não é valor.
function extrairEstoquesMilho(textoCsv) {
  const tabelas = linhasPorTabela(textoCsv);
  const candidatas = [...tabelas.values()].filter(ehTabelaPorPosicaoEMes);
  if (candidatas.length === 0) throw new Error("tabela de estoques por posição e mês (unidades domésticas) não encontrada.");
  const linhas = candidatas[0];

  const colunas = colunasDe(linhas);
  if (colunas.length === 0) throw new Error(`tabela "${tituloDe(linhas)}" sem linha de anos no cabeçalho.`);
  const semPosicao = colunas.filter((c) => !c.posicao);
  if (semPosicao.length > 0) throw new Error(`coluna sem posição (na fazenda, fora, total): ${semPosicao.map((c) => c.indice).join(", ")}.`);

  const unidades = linhas.find((l) => l.tipo === "u")?.celulas || [];
  const semMilBushels = colunas.filter((c) => !ehMilBushels(unidades[c.indice]));
  if (semMilBushels.length > 0) throw new Error(`unidade inesperada: ${semMilBushels.map((c) => `"${unidades[c.indice] || ""}"`).join(", ")}.`);

  const valores = [];
  let grao = null;
  let achouMilho = false;
  const datasDoMilho = new Set();
  for (const linha of linhas) {
    const novoGrao = graoDaLinha(linha, colunas);
    if (novoGrao) {
      grao = novoGrao;
      if (/^corn$/i.test(grao)) achouMilho = true;
      continue;
    }
    if (linha.tipo !== "d" || !/^corn$/i.test(grao || "")) continue;
    const mes = mesDaData(linha.celulas[0]);
    if (!mes) continue;
    // Trava: uma data repetida no bloco do milho é sinal de que o bloco do grão seguinte não foi reconhecido.
    if (datasDoMilho.has(mes)) throw new Error(`a data "${linha.celulas[0]}" aparece duas vezes no bloco do milho (o grão seguinte não foi reconhecido).`);
    datasDoMilho.add(mes);

    for (const { indice, ano, posicao } of colunas) {
      const celula = linha.celulas[indice] || "";
      if (celula === "" || celula === "(D)") continue;
      const revisado = celula.startsWith("*");
      const bruto = revisado ? celula.slice(1) : celula;
      const valor = Number(bruto.replace(/,/g, ""));
      if (!/^[\d,]+$/.test(bruto) || !Number.isFinite(valor)) throw new Error(`valor do milho em ${linha.celulas[0]} de ${ano} não é um número: "${celula}".`);
      valores.push({ observedAt: `${ano}-${String(mes).padStart(2, "0")}-01`, posicao, valor, ...(revisado && { revisado: true }) });
    }
  }
  if (!achouMilho) throw new Error(`tabela "${tituloDe(linhas)}" sem o bloco do milho.`);
  if (valores.length === 0) throw new Error("bloco do milho sem nenhum valor.");

  return { dataLiberacao: dataDeLiberacao([{ titulos: linhas.filter((l) => l.tipo === "t").map((l) => l.celulas[0]) }]), titulo: tituloDe(linhas), valores };
}

module.exports = { extrairEstoquesMilho, ehOutroRelatorio, linhasPorTabela, mesDaData, colunasDe, POSICOES };
