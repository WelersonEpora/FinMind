"use strict";

const XLSX = require("xlsx");

// Leitor de uma edição do Short-Term Energy Outlook (STEO) da EIA: a tabela da produção de petróleo bruto da OPEP
// (e, desde 2024, da OPEP+), com a capacidade de produção e a capacidade ociosa da OPEP. ADR 0091.
//
// VERIFICADO NAS EDIÇÕES REAIS (2026-10-06, de abr/2008 a out/2026):
//   - Até 2023 é a tabela 3c ("OPEC Crude Oil Production"), com os países da OPEP, a capacidade e a capacidade ociosa
//     de cada um. De 2024 em diante é a 3d ("World Crude Oil Production"), com a OPEP+ (total, os membros da OPEP
//     sujeitos aos acordos e os outros participantes, Rússia e Cazaquistão entre eles) e só a capacidade da OPEP.
//     Acha-se a tabela pela linha `copr_sa` (Arábia Saudita), presente nas duas.
//   - A 1ª coluna é o código da série da EIA (às vezes em maiúsculas: `copr_IR`); a 2ª, o nome. A linha 3 traz o ano
//     só na coluna de janeiro e a linha 4 os meses ("Jan", ...). Cada edição traz ~4 anos de histórico e a previsão
//     até o fim do ano seguinte.
//   - Os países não têm previsão ("-"): o último mês com a Arábia Saudita preenchida é o último mês histórico da
//     edição (o mês anterior ao da edição). Os totais e a capacidade seguem na previsão, que NÃO é gravada.
//   - A filiação muda (Indonésia sai em 2009, Catar em 2019, Equador em 2020, Angola em 2024, Emirados em 2026): cada
//     total é o da edição, com a filiação dela.

// Código da EIA -> código ISO 3166 alfa-2 (o do JODI).
const PAISES = {
  ag: "DZ",
  ao: "AO",
  aj: "AZ",
  ba: "BH",
  bx: "BN",
  cf: "CG",
  ec: "EC",
  ek: "GQ",
  gb: "GA",
  id: "ID",
  ir: "IR",
  iz: "IQ",
  ku: "KW",
  kz: "KZ",
  ly: "LY",
  mu: "OM",
  mx: "MX",
  my: "MY",
  ni: "NG",
  od: "SS",
  qa: "QA",
  rs: "RU",
  sa: "SA",
  su: "SD",
  tc: "AE",
  ve: "VE"
};

// Agregados, com o rótulo do FinMind.
const AGREGADOS = {
  copr_opec: { serie: "PETROLEO.OPEP.PRODUCAO", nome: "OPEP, total" },
  copr_opecplus: { serie: "PETROLEO.OPEP_MAIS.PRODUCAO", nome: "OPEP+, total (países sujeitos aos acordos)" },
  copr_opecplus_opec: { serie: "PETROLEO.OPEP_MAIS_MEMBROS_OPEP.PRODUCAO", nome: "OPEP+, membros da OPEP sujeitos aos acordos" },
  copr_opecplus_other: { serie: "PETROLEO.OPEP_MAIS_OUTROS.PRODUCAO", nome: "OPEP+, outros participantes" },
  copc_opec: { serie: "PETROLEO.OPEP.CAPACIDADE", nome: "OPEP, capacidade de produção" },
  cops_opec: { serie: "PETROLEO.OPEP.CAPACIDADE_OCIOSA", nome: "OPEP, capacidade ociosa" }
};

const MESES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MESES_EXTENSO = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function linhas(planilha) {
  return XLSX.utils.sheet_to_json(planilha, { header: 1, raw: true });
}

function acharTabela(workbook) {
  for (const nome of workbook.SheetNames) {
    const rows = linhas(workbook.Sheets[nome]);
    if (rows.some((r) => typeof r[0] === "string" && r[0].toLowerCase() === "copr_sa")) return { nome, rows };
  }
  return null;
}

// Coluna -> "AAAA-MM", das linhas de ano e de mês do cabeçalho.
function colunasDeMes(rows) {
  const iMes = rows.findIndex((r) => r.filter((c) => MESES.includes(String(c || "").trim().toLowerCase().slice(0, 3))).length >= 12);
  if (iMes < 1) return null;
  const anos = rows[iMes - 1];
  const nomes = rows[iMes];
  const colunas = new Map();
  let ano = null;
  for (let c = 0; c < nomes.length; c += 1) {
    if (typeof anos[c] === "number" && anos[c] > 1990 && anos[c] < 2100) ano = anos[c];
    const i = MESES.indexOf(String(nomes[c] || "").trim().toLowerCase().slice(0, 3));
    if (ano && i >= 0) colunas.set(c, `${ano}-${String(i + 1).padStart(2, "0")}`);
  }
  return colunas;
}

// "Thursday, September 3, 2026" -> "2026-09-03" (a data da edição, nas edições que a trazem); null se não houver.
function dataDaEdicao(rows) {
  for (const r of rows.slice(0, 6)) {
    for (const c of r) {
      const m = /^[A-Za-z]+,\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(String(c || "").trim());
      if (m && MESES_EXTENSO.includes(m[1].toLowerCase())) {
        return `${m[3]}-${String(MESES_EXTENSO.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
      }
    }
  }
  return null;
}

// Um workbook (buffer XLS ou XLSX) -> { tabela, dataEdicao, ultimoMes, valores: [{ serie, nome, mes, valor }],
// desconhecidos: [códigos de país sem mapa] }. Só os meses históricos (até `ultimoMes`). Lança se a tabela não estiver
// lá ou o cabeçalho for outro.
function lerEdicao(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const tabela = acharTabela(workbook);
  if (!tabela) throw new Error("tabela da produção da OPEP não encontrada (sem a linha copr_sa)");
  const colunas = colunasDeMes(tabela.rows);
  if (!colunas || colunas.size < 24) throw new Error(`cabeçalho de meses inesperado na tabela ${tabela.nome}`);

  const vistas = new Set();
  const porCodigo = [];
  for (const r of tabela.rows) {
    if (typeof r[0] !== "string") continue;
    const codigo = r[0].trim().toLowerCase();
    if (vistas.has(codigo)) continue; // a 3d repete o total da OPEP+ como cabeçalho do bloco
    vistas.add(codigo);
    porCodigo.push({ codigo, nome: String(r[1] || "").trim(), r });
  }

  const sa = porCodigo.find((l) => l.codigo === "copr_sa");
  const mesesSa = [...colunas].filter(([c]) => typeof sa.r[c] === "number").map(([, mes]) => mes).sort();
  const ultimoMes = mesesSa.at(-1);
  if (!ultimoMes) throw new Error("a Arábia Saudita não tem nenhum mês preenchido");

  const valores = [];
  const desconhecidos = [];
  for (const { codigo, nome, r } of porCodigo) {
    let serie = null;
    let nomeSerie = nome;
    const pais = /^copr_([a-z]{2})$/.exec(codigo);
    if (AGREGADOS[codigo]) {
      serie = AGREGADOS[codigo].serie;
      nomeSerie = AGREGADOS[codigo].nome;
    } else if (pais) {
      if (!PAISES[pais[1]]) {
        desconhecidos.push(codigo);
        continue;
      }
      serie = `PETROLEO.${PAISES[pais[1]]}.PRODUCAO`;
    }
    if (!serie) continue;
    for (const [c, mes] of colunas) {
      if (mes > ultimoMes || typeof r[c] !== "number") continue;
      valores.push({ serie, codigoEia: codigo, nome: nomeSerie, mes, valor: r[c] });
    }
  }
  return { tabela: tabela.nome, dataEdicao: dataDaEdicao(tabela.rows), ultimoMes, valores, desconhecidos };
}

module.exports = { lerEdicao, PAISES, AGREGADOS };
