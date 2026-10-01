"use strict";

// Leitor dos Informes de Semeadura e de Colheita do milho do IMEA (PDF, um por safra). ADR 0039.
//
// Cada informe traz, na 2ª página, a tabela "Acompanhamento da semeadura (colheita) por região": uma linha por semana,
// com o percentual ACUMULADO da área semeada (colhida) em cada uma das 7 regiões do IMEA e em Mato Grosso. Lido por
// COORDENADA (x/y de cada texto, `shared/utils/pdf-texto.js`), como o balanço do IMEA (ADR 0019). Conferido nos 26
// informes do catálogo em 2026-10-01 (semeadura 2012/13 a 2025/26, colheita 2014/15 a 2025/26), que variam:
//   - a data: "11-jan-19", "1-fev-19", "28/05/2015" ou "13/jan/23";
//   - a ORDEM das regiões no cabeçalho (até 2014/15 o Noroeste vem primeiro): a coluna de cada número é a do cabeçalho
//     mais próximo em x, nunca a ordem;
//   - às vezes a data cai numa linha e os números na linha logo abaixo;
//   - linhas que não são semana ("Área (ha)", "Produt. Parcial (sc/ha)") ficam de fora;
//   - nas edições novas, depois das semanas vêm "Δ Semanal" e a linha da safra anterior (comparação): a leitura para
//     no primeiro rótulo com "Δ" ou na primeira data que volta no tempo (nas edições antigas, a comparação vem sem o "Δ").
// DEFEITO CONHECIDO DA FONTE: o cabeçalho da colheita 2014/15 não tem o Médio-Norte ("Nororeste", 7 nomes para 8
// colunas). Um número sem cabeçalho a menos de TOLERANCIA_X recusa a edição: adivinhar a região seria inventar o dado.

const REGIOES = {
  "centro-sul": "CENTRO_SUL",
  "medio-norte": "MEDIO_NORTE",
  nordeste: "NORDESTE",
  noroeste: "NOROESTE",
  norte: "NORTE",
  oeste: "OESTE",
  sudeste: "SUDESTE",
  "mato grosso": "MATO_GROSSO"
};
const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
// Distância máxima, em x, entre um número e o nome da região no cabeçalho (as colunas ficam a ~45 de distância).
const TOLERANCIA_X = 22;
const TOLERANCIA_Y = 3;
const RE_PERCENTUAL = /^(\d{1,3}(?:,\d+)?)%$/;

function semAcento(texto) {
  return String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// "11-jan-19", "1-fev-19", "13/jan/23", "28/05/2015" -> "2019-01-11"; outra coisa -> null.
function lerData(texto) {
  const t = semAcento(texto);
  let m = /^(\d{1,2})[-/]([a-z]{3})[-/](\d{2})$/.exec(t);
  if (m && MESES[m[2]]) return `20${m[3]}-${String(MESES[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

// Itens de uma página -> linhas (y decrescente), cada uma com os itens em x crescente.
function linhasDaPagina(itens) {
  const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas = [];
  for (const it of ordenados) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(ultima.y - it.y) <= TOLERANCIA_Y) ultima.itens.push(it);
    else linhas.push({ y: it.y, itens: [it] });
  }
  for (const l of linhas) l.itens.sort((a, b) => a.x - b.x);
  return linhas;
}

// Linha do cabeçalho: a que tem "Mato Grosso" e ao menos 4 regiões. Devolve [{ regiao, x }].
function colunasDoCabecalho(linha) {
  const colunas = [];
  for (const it of linha.itens) {
    const regiao = REGIOES[semAcento(it.str)];
    if (regiao) colunas.push({ regiao, x: it.x });
  }
  return colunas.length >= 5 && colunas.some((c) => c.regiao === "MATO_GROSSO") ? colunas : null;
}

// Páginas (de `lerPdf`) -> { semanas: [{ data, valores: { REGIAO: percentual } }] }. Lança erro quando a tabela não
// existe ou uma coluna não tem cabeçalho: é melhor recusar o informe do que gravar uma região trocada.
function extrairAndamento(paginas) {
  for (const pagina of paginas) {
    const linhas = linhasDaPagina(pagina.itens || []);
    const iCabecalho = linhas.findIndex((l) => colunasDoCabecalho(l));
    if (iCabecalho < 0) continue;
    const colunas = colunasDoCabecalho(linhas[iCabecalho]);

    const semanas = [];
    let dataPendente = null;
    for (const linha of linhas.slice(iCabecalho + 1)) {
      const primeiro = String(linha.itens[0].str).trim();
      if (primeiro.startsWith("Δ")) break; // variação semanal e comparação com a safra anterior
      const data = lerData(primeiro);
      const percentuais = linha.itens.filter((it) => RE_PERCENTUAL.test(String(it.str).trim()));
      if (data && percentuais.length === 0) {
        dataPendente = data; // a data numa linha, os números na seguinte
        continue;
      }
      const dataDaLinha = data || dataPendente;
      dataPendente = null;
      if (!dataDaLinha || percentuais.length === 0) continue; // "Área (ha)", "Produt. Parcial" etc.
      // A linha da mesma semana da safra ANTERIOR (comparação) fecha a tabela: nas edições antigas ela não vem depois de
      // um "Δ", mas é a primeira data que volta no tempo.
      if (semanas.length > 0 && dataDaLinha <= semanas[semanas.length - 1].data) break;

      const valores = {};
      for (const it of percentuais) {
        const coluna = colunas.reduce((melhor, c) => (Math.abs(c.x - it.x) < Math.abs(melhor.x - it.x) ? c : melhor));
        if (Math.abs(coluna.x - it.x) > TOLERANCIA_X) {
          throw new Error(`número "${String(it.str).trim()}" (x=${it.x}) da semana ${dataDaLinha} sem região no cabeçalho.`);
        }
        if (valores[coluna.regiao] !== undefined) throw new Error(`duas colunas para ${coluna.regiao} na semana ${dataDaLinha}.`);
        valores[coluna.regiao] = Number(RE_PERCENTUAL.exec(String(it.str).trim())[1].replace(",", "."));
      }
      semanas.push({ data: dataDaLinha, valores });
    }
    if (semanas.length === 0) throw new Error("tabela de acompanhamento sem nenhuma semana.");
    return { semanas };
  }
  throw new Error("tabela de acompanhamento por região não encontrada (cabeçalho com as regiões e Mato Grosso).");
}

module.exports = { extrairAndamento, lerData, linhasDaPagina, REGIOES };
