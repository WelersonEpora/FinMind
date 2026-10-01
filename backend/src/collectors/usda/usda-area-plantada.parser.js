"use strict";

// Leitor do CSV do Prospective Plantings (março) e do Acreage (junho) do USDA NASS: só a área plantada de
// milho dos EUA. ADR 0027.
//
// FORMATO (o `*_all*.csv` que vem no ZIP de cada edição no ESMIS, conferido nas 51 edições de 2001 a 2026):
// cada linha começa pelo número da tabela e por um tipo - "t" (título), "h" (cabeçalho), "u" (unidade) e "d"
// (dado) -, seguidos das células. A tabela da área do milho muda de número e de título ao longo dos anos
// (nº 8 ou 91 no Prospective Plantings, nº 11 no Acreage; "Corn: Area Planted by State and United States",
// "Corn Area Planted - States and United States", "Corn Area Planted for All Purposes and Harvested for
// Grain"...), e no Acreage de 2003 a 2009 o título ocupa duas linhas. Por isso a tabela é achada pelo
// SENTIDO do título, não pelo número:
//   - começa por "Corn";
//   - fala de "Area Planted";
//   - não é a de biotecnologia nem a de "Area Left to be Planted" (Acreage, desde 2021).
// Dentro dela, as colunas de área plantada são as que têm "Area planted" no cabeçalho e um ANO no cabeçalho
// de baixo ("2025", "2026 1/"): as de área colhida (Acreage) e a de variação percentual ficam de fora. O
// total é a linha "United States" (ou "US", até 2009). A unidade tem de ser mil acres.
//
// Cada edição traz o ano da edição e 1 ou 2 anos anteriores, com o valor que o USDA tinha NAQUELE dia (ex.:
// a de março de 2014 traz 2012 = 97.155, depois revisto para 97.291): tudo é gravado, cada um é uma versão.
// Só entram valores publicados, sem conversão (mil acres) nem cálculo.

const MESES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Uma linha do CSV em células: texto entre aspas (com "" escapado) ou valor cru até a vírgula.
function lerLinhaCsv(linha) {
  const celulas = [];
  let i = 0;
  while (i <= linha.length) {
    if (linha[i] === '"') {
      let texto = "";
      let j = i + 1;
      while (j < linha.length) {
        if (linha[j] === '"' && linha[j + 1] === '"') {
          texto += '"';
          j += 2;
        } else if (linha[j] === '"') {
          break;
        } else {
          texto += linha[j];
          j += 1;
        }
      }
      celulas.push(texto);
      i = j + 2;
    } else {
      let fim = linha.indexOf(",", i);
      if (fim < 0) fim = linha.length;
      celulas.push(linha.slice(i, fim));
      i = fim + 1;
    }
  }
  return celulas;
}

// { numero -> { titulos, cabecalhos, unidades, dados } }, na ordem em que as tabelas aparecem.
function agruparTabelas(textoCsv) {
  const tabelas = new Map();
  for (const bruta of textoCsv.split(/\r?\n/)) {
    if (!bruta.trim()) continue;
    const [numero, tipo, ...celulas] = lerLinhaCsv(bruta);
    if (!numero) continue;
    if (!tabelas.has(numero)) tabelas.set(numero, { numero, titulos: [], cabecalhos: [], unidades: [], dados: [] });
    const tabela = tabelas.get(numero);
    if (tipo === "t") tabela.titulos.push(celulas[0] || "");
    else if (tipo === "h") tabela.cabecalhos.push(celulas);
    else if (tipo === "u") tabela.unidades.push(celulas);
    else if (tipo === "d") tabela.dados.push(celulas);
  }
  return [...tabelas.values()];
}

const RE_LIBERADO = /Released ([A-Za-z]+) (\d{1,2}), (\d{4})/;

// "Prospective Plantings: Released March 31, 2026, by the National..." -> "2026-03-31".
function dataDeLiberacao(tabelas) {
  for (const t of tabelas) {
    for (const titulo of t.titulos) {
      const m = RE_LIBERADO.exec(titulo);
      if (!m) continue;
      const mes = MESES_EN.indexOf(m[1]) + 1;
      if (mes === 0) return null;
      return `${m[3]}-${String(mes).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    }
  }
  return null;
}

// Título sem a linha "Released ..." (repetida em toda tabela), numa linha só.
function tituloDe(tabela) {
  return tabela.titulos
    .filter((t) => !RE_LIBERADO.test(t))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function ehTabelaDaAreaDoMilho(tabela) {
  const titulo = tituloDe(tabela);
  return /^corn\b/i.test(titulo) && /area planted/i.test(titulo) && !/biotech|left to be planted/i.test(titulo);
}

const RE_ANO = /^(\d{4})(?:\s+\d+\/)?$/;

// Colunas (índice na linha de dados, sem o rótulo) com "Area planted" em cima e um ano embaixo.
function colunasDeAreaPlantada(tabela) {
  const largura = Math.max(...tabela.cabecalhos.map((h) => h.length));
  const colunas = [];
  for (let c = 1; c < largura; c += 1) {
    const textos = tabela.cabecalhos.map((h) => String(h[c] || "").trim());
    const ano = textos.map((t) => RE_ANO.exec(t)?.[1]).find(Boolean);
    if (ano && textos.some((t) => /area planted/i.test(t))) colunas.push({ indice: c, ano: Number(ano) });
  }
  return colunas;
}

function ehLinhaDoTotal(celulas) {
  return /^(united states|us)$/i.test(String(celulas[0] || "").trim());
}

// "(1,000 acres)" / "1,000 Acres".
function ehMilAcres(texto) {
  return /^\(?1,000 acres\)?$/i.test(String(texto || "").trim());
}

// CSV de uma edição -> { dataLiberacao, titulo, valores: [{ ano, valor }] }. Lança erro se a tabela, as
// colunas, o total ou a unidade não forem os esperados: é melhor recusar a edição do que gravar errado.
function extrairAreaPlantada(textoCsv) {
  const tabelas = agruparTabelas(textoCsv);
  const candidatas = tabelas.filter(ehTabelaDaAreaDoMilho);
  if (candidatas.length !== 1) {
    throw new Error(`esperava 1 tabela de área plantada de milho, achei ${candidatas.length} (${candidatas.map(tituloDe).join(" | ") || "nenhuma"}).`);
  }
  const tabela = candidatas[0];

  const colunas = colunasDeAreaPlantada(tabela);
  if (colunas.length === 0) throw new Error(`tabela "${tituloDe(tabela)}" sem coluna de área plantada com ano.`);

  const unidades = tabela.unidades[0] || [];
  const semMilAcres = colunas.filter((c) => !ehMilAcres(unidades[c.indice]));
  if (semMilAcres.length > 0) {
    throw new Error(`unidade inesperada na área plantada: ${semMilAcres.map((c) => `${c.ano} = "${unidades[c.indice] || ""}"`).join(", ")}.`);
  }

  const totais = tabela.dados.filter(ehLinhaDoTotal);
  if (totais.length !== 1) throw new Error(`esperava 1 linha do total dos EUA, achei ${totais.length}.`);

  const valores = colunas.map(({ indice, ano }) => {
    const bruto = String(totais[0][indice] || "").trim();
    const valor = Number(bruto.replace(/,/g, ""));
    if (!/^[\d,]+$/.test(bruto) || !Number.isFinite(valor) || valor <= 0) {
      throw new Error(`valor do total dos EUA em ${ano} não é um número: "${bruto}".`);
    }
    return { ano, valor };
  });

  return { dataLiberacao: dataDeLiberacao(tabelas), titulo: tituloDe(tabela), valores };
}

module.exports = { lerLinhaCsv, agruparTabelas, dataDeLiberacao, extrairAreaPlantada, ehTabelaDaAreaDoMilho, colunasDeAreaPlantada };
