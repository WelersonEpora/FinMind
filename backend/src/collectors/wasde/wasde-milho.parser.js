"use strict";

// Extrai o MILHO de uma edição do WASDE (planilha XLS do ESMIS). ADR 0015.
//
// Funciona sobre matrizes de células (array de linhas), não sobre o arquivo: a leitura do
// XLS fica em `lerPlanilha`, e o resto é função pura, testável sem arquivo.
//
// O layout foi conferido em 6 edições reais (jan/2011, jan/2012, jan/2015, mai/2025, set/2026
// e o TXT de 2010, que NÃO é tratado aqui). Tudo é achado pelo TEXTO, nunca pelo número da
// página nem da coluna: as colunas deslocam de 2011 para 2026, e a "Page 12" pode mudar.
//
//   - EUA: aba com o título "U.S. Feed Grain and Corn Supply and Use". O bloco do milho começa
//     na linha cujo rótulo é "CORN"; as colunas são anos (`2024/25`, `2025/26 Est.`,
//     `2026/27 Proj.`) e a safra em projeção aparece DUAS vezes (mês anterior e mês atual): fica
//     a última. Valores em milhões de bushels (área em milhões de acres, produtividade em bu/ac).
//   - Mundo: abas com o título "World Corn Supply and Use". Cada bloco de ano traz uma linha de
//     cabeçalho com "Beginning Stocks ... Ending Stocks" e uma linha por região; na safra em
//     projeção cada região tem duas linhas (mês anterior e atual, esta última com o rótulo em
//     branco): fica a última. Valores em milhões de t.
//
// NÃO extraído, de propósito: preço médio ao produtor (projeção vem como faixa, "4,80 - 5,60"),
// etanol (a definição mudou: "Ethanol for Fuel" × "Ethanol & by-products"), CCC/estoques
// livres/empréstimos (só nas edições antigas) e o bloco de "FEED GRAINS" (é outro produto).

const XLSX = require("xlsx");

const TITULO_EUA = /U\.S\. Feed Grain and Corn Supply and Use/i;
const TITULO_MUNDO = /World Corn Supply and Use/i;
const RE_ANO = /^(\d{4})\/(\d{2})\s*(Est\.|Proj\.)?$/;
const RE_MES_ANO = /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/;
const RE_NUMERO_EDICAO = /^WASDE\s*-\s*(\d+)/;
const RE_MES_ABREVIADO = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)$/i;
const LINHAS_DO_CABECALHO = 14;

// Atributos dos EUA (rótulo normalizado -> código e unidade). Rótulo normalizado = minúsculas,
// sem nota de rodapé ("2/") e sem pontuação.
const ATRIBUTOS_EUA = {
  "area planted": { codigo: "AREA_PLANTED", unidade: "M acres" },
  "area harvested": { codigo: "AREA_HARVESTED", unidade: "M acres" },
  "yield per harvested acre": { codigo: "YIELD", unidade: "bu/acre" },
  "beginning stocks": { codigo: "BEGINNING_STOCKS", unidade: "M bu" },
  production: { codigo: "PRODUCTION", unidade: "M bu" },
  imports: { codigo: "IMPORTS", unidade: "M bu" },
  "supply total": { codigo: "SUPPLY_TOTAL", unidade: "M bu" },
  "feed and residual": { codigo: "FEED_RESIDUAL", unidade: "M bu" },
  "food seed industrial": { codigo: "FSI", unidade: "M bu" },
  "domestic total": { codigo: "DOMESTIC_TOTAL", unidade: "M bu" },
  exports: { codigo: "EXPORTS", unidade: "M bu" },
  "use total": { codigo: "USE_TOTAL", unidade: "M bu" },
  "ending stocks": { codigo: "ENDING_STOCKS", unidade: "M bu" }
};

// Colunas da tabela do mundo (cabeçalho normalizado -> código).
const ATRIBUTOS_MUNDO = {
  "beginning stocks": "BEGINNING_STOCKS",
  production: "PRODUCTION",
  imports: "IMPORTS",
  "domestic feed": "DOMESTIC_FEED",
  "domestic total": "DOMESTIC_TOTAL",
  exports: "EXPORTS",
  "ending stocks": "ENDING_STOCKS"
};

// Linhas da tabela do mundo que são títulos de seção (rótulo normalizado), sem dado próprio.
const TITULOS_DE_SECAO = new Set(["selected other"]);

function texto(celula) {
  if (celula === null || celula === undefined) return "";
  return String(celula).replace(/\s+/g, " ").trim();
}

// Sem nota de rodapé no fim ("World  3/", "Domestic Feed 2/") e sem pontuação.
function normalizarRotulo(celula) {
  return texto(celula)
    .replace(/\s+\d+\/$/, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// null = célula vazia, "NA" (a fonte não tem o dado: normal na 1ª projeção de uma safra) ou
// "filler" (linha de preenchimento que aparece na edição de jan/2015);
// NaN = texto que não é número (ex.: faixa "4.80 - 5.60") - vai para os inválidos.
// Um asterisco depois do número ("95.3 *") é nota de rodapé ("área conforme o Prospective
// Plantings"): o valor vale, a nota é descartada.
function numero(celula) {
  if (typeof celula === "number") return Number.isFinite(celula) ? celula : NaN;
  const t = texto(celula).replace(/,/g, "").replace(/\s*\*+$/, "");
  if (t === "" || /^(NA|N\/A|--?|filler)$/i.test(t)) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

function slugRegiao(celula) {
  return texto(celula)
    .replace(/\s+\d+\/$/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function lerAno(celula) {
  const m = RE_ANO.exec(texto(celula));
  if (!m) return null;
  const situacao = m[3] === "Est." ? "est" : m[3] === "Proj." ? "proj" : "final";
  return { safra: `${m[1]}/${m[2]}`, anoInicial: Number(m[1]), situacao };
}

function cabecalhoDaAba(linhas) {
  const celulas = linhas.slice(0, LINHAS_DO_CABECALHO).flatMap((l) => l.map(texto));
  return {
    titulo: celulas.join(" "),
    mesAno: celulas.map((c) => RE_MES_ANO.exec(c)).find(Boolean) || null,
    edicao: celulas.map((c) => RE_NUMERO_EDICAO.exec(c)).find(Boolean)?.[1] || null
  };
}

function observacao({ escopo, regiao, atributo, unidade, ano, valor }) {
  const codigo = escopo === "EUA" ? `WASDE.MILHO.EUA.${atributo}` : `WASDE.MILHO.MUNDO.${regiao}.${atributo}`;
  return {
    seriesCode: codigo,
    // Safra 2024/25 -> 1º de setembro de 2024 (início do ano comercial do milho nos EUA; o
    // WASDE agrega "anos comerciais locais", então isto é uma CONVENÇÃO - ADR 0015).
    observedAt: `${ano.anoInicial}-09-01`,
    safra: ano.safra,
    situacao: ano.situacao,
    escopo,
    regiao: escopo === "EUA" ? "UNITED_STATES" : regiao,
    atributo,
    unidade,
    valor
  };
}

// ---------------------------------------------------------------- EUA

function extrairEua(linhas) {
  const observacoes = [];
  const invalidos = [];

  const linhaMilho = linhas.findIndex((l) => l.some((c) => texto(c).toUpperCase() === "CORN"));
  if (linhaMilho < 0) return { observacoes, invalidos: [{ motivo: 'Bloco "CORN" não encontrado na tabela dos EUA.' }] };

  const colRotulo = linhas[linhaMilho].findIndex((c) => texto(c).toUpperCase() === "CORN");

  // Coluna -> ano. A safra em projeção repete o ano (mês anterior, mês atual): vale a última.
  const anoPorColuna = new Map();
  const colunaDoAno = new Map();
  linhas[linhaMilho].forEach((c, i) => {
    if (i <= colRotulo) return;
    const ano = lerAno(c);
    if (ano) {
      anoPorColuna.set(i, ano);
      colunaDoAno.set(ano.safra, i);
    }
  });
  const colunas = [...colunaDoAno.values()].sort((a, b) => a - b);
  if (colunas.length === 0) return { observacoes, invalidos: [{ motivo: "Nenhum ano (ex.: 2024/25) no cabeçalho do milho dos EUA." }] };

  for (let i = linhaMilho + 1; i < linhas.length; i += 1) {
    const rotulo = texto(linhas[i][colRotulo]);
    if (/^Note/i.test(rotulo)) break;
    const atributo = ATRIBUTOS_EUA[normalizarRotulo(rotulo)];
    if (!atributo) continue;

    for (const col of colunas) {
      const valor = numero(linhas[i][col]);
      if (valor === null) continue;
      if (Number.isNaN(valor)) {
        invalidos.push({ motivo: `${rotulo} (${anoPorColuna.get(col).safra}): valor não numérico "${texto(linhas[i][col])}".` });
        continue;
      }
      observacoes.push(
        observacao({ escopo: "EUA", atributo: atributo.codigo, unidade: atributo.unidade, ano: anoPorColuna.get(col), valor })
      );
    }
  }
  return { observacoes, invalidos };
}

// ---------------------------------------------------------------- Mundo

function extrairMundo(linhas) {
  const observacoes = [];
  const invalidos = [];

  let bloco = null; // { ano, colunas: Map<col, atributo>, primeiraColuna, entradas: [{ rotulo, linhas: [] }] }
  const blocos = [];

  for (const linha of linhas) {
    const colunas = new Map();
    linha.forEach((c, i) => {
      const atributo = ATRIBUTOS_MUNDO[normalizarRotulo(c)];
      if (atributo) colunas.set(i, atributo);
    });

    // Linha de cabeçalho do bloco: traz "Beginning Stocks" e "Ending Stocks".
    if (colunas.size >= 2 && [...colunas.values()].includes("ENDING_STOCKS")) {
      const primeiraColuna = Math.min(...colunas.keys());
      const ano = linha.slice(0, primeiraColuna).map(lerAno).find(Boolean);
      bloco = ano ? { ano, colunas, primeiraColuna, entradas: [], atual: null } : null;
      if (bloco) blocos.push(bloco);
      else invalidos.push({ motivo: "Cabeçalho de bloco do mundo sem ano reconhecível." });
      continue;
    }
    if (!bloco) continue;
    if (/^1\/ Aggregate/i.test(texto(linha[0])) || linha.some((c) => /^1\/ Aggregate/i.test(texto(c)))) {
      bloco = null;
      continue;
    }

    // Rótulo da região: 1º texto não vazio à esquerda das colunas de dados que não seja mês.
    const rotulo = linha
      .slice(0, bloco.primeiraColuna)
      .map(texto)
      .find((t) => t !== "" && !RE_MES_ABREVIADO.test(t) && !lerAno(t));
    const valores = [...bloco.colunas.keys()].map((col) => linha[col]);
    const temDado = valores.some((v) => numero(v) !== null || texto(v).toUpperCase() === "NA");

    // "Selected Other" é um TÍTULO de seção, não uma região: a planilha deixa um "0" solto na
    // coluna de estoque final dessa linha (visto em 137 das 189 edições de 2011 a 2026), que não
    // é dado. Ignora o título e as linhas soltas que viessem depois dele.
    if (rotulo) {
      bloco.atual = TITULOS_DE_SECAO.has(normalizarRotulo(rotulo)) ? null : { rotulo, linhas: [] };
      if (bloco.atual) bloco.entradas.push(bloco.atual);
    }
    if (temDado && bloco.atual) bloco.atual.linhas.push(linha);
  }

  for (const b of blocos) {
    for (const entrada of b.entradas) {
      if (entrada.linhas.length === 0) continue; // ex.: "Selected Other" (só título)
      const regiao = slugRegiao(entrada.rotulo);
      // Duas linhas = mês anterior e mês atual: vale a última.
      const linha = entrada.linhas.at(-1);
      for (const [col, atributo] of b.colunas) {
        const valor = numero(linha[col]);
        if (valor === null) continue;
        if (Number.isNaN(valor)) {
          invalidos.push({ motivo: `${entrada.rotulo} (${b.ano.safra}) ${atributo}: valor não numérico "${texto(linha[col])}".` });
          continue;
        }
        observacoes.push(observacao({ escopo: "MUNDO", regiao, atributo, unidade: "Mt", ano: b.ano, valor }));
      }
    }
  }
  return { observacoes, invalidos };
}

// ---------------------------------------------------------------- Edição

// `abas`: [{ nome, linhas }]. Devolve as observações da edição inteira (EUA + mundo) e os
// itens inválidos. Uma edição sem a tabela dos EUA OU sem a do mundo é reportada como inválida.
function extrairEdicao(abas) {
  const observacoes = [];
  const invalidos = [];
  let edicao = null;
  let mesAno = null;

  const abaEua = abas.find((a) => TITULO_EUA.test(cabecalhoDaAba(a.linhas).titulo));
  const abasMundo = abas.filter((a) => TITULO_MUNDO.test(cabecalhoDaAba(a.linhas).titulo));

  if (!abaEua) {
    invalidos.push({ motivo: "Aba do milho dos EUA (U.S. Feed Grain and Corn Supply and Use) não encontrada." });
  } else {
    const cab = cabecalhoDaAba(abaEua.linhas);
    edicao = cab.edicao;
    mesAno = cab.mesAno;
    const eua = extrairEua(abaEua.linhas);
    observacoes.push(...eua.observacoes);
    invalidos.push(...eua.invalidos);
  }

  if (abasMundo.length === 0) {
    invalidos.push({ motivo: "Abas do milho do mundo (World Corn Supply and Use) não encontradas." });
  } else {
    for (const aba of abasMundo) {
      const cab = cabecalhoDaAba(aba.linhas);
      edicao = edicao || cab.edicao;
      mesAno = mesAno || cab.mesAno;
      const mundo = extrairMundo(aba.linhas);
      observacoes.push(...mundo.observacoes);
      invalidos.push(...mundo.invalidos);
    }
  }

  return {
    edicao,
    mes: mesAno ? { nome: mesAno[1], ano: Number(mesAno[2]) } : null,
    observacoes,
    invalidos
  };
}

// Lê o XLS (Buffer) para abas em matriz de células.
function lerPlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return wb.SheetNames.map((nome) => ({
    nome,
    linhas: XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null, blankrows: true })
  }));
}

module.exports = {
  extrairEdicao,
  extrairEua,
  extrairMundo,
  lerPlanilha,
  normalizarRotulo,
  numero,
  slugRegiao,
  lerAno,
  ATRIBUTOS_EUA,
  ATRIBUTOS_MUNDO
};
