"use strict";

// Lê um PDF (Buffer) para páginas de itens de texto com coordenada (x/y), via `pdfjs-dist`. Impura;
// os parsers que usam isto (IMEA oferta e demanda, ADR 0019; Boletim Diário da B3, ADR 0020) são
// puros e testáveis com fixtures de itens que reproduzem os layouts reais.
//
// A extração por COORDENADA é o que resolve tabelas que o texto corrido (`pdftotext -layout`)
// desalinha: cada item vem com a posição do início do texto (x) e da baseline (y, crescendo para cima).

function texto(str) {
  return String(str ?? "").replace(/\s+/g, " ").trim();
}

async function lerPdf(buffer) {
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise;
  const paginas = [];
  try {
    for (let p = 1; p <= doc.numPages; p += 1) {
      const pagina = await doc.getPage(p);
      const conteudo = await pagina.getTextContent();
      const itens = conteudo.items
        .map((it) => ({ str: it.str, x: Math.round(it.transform[4] * 10) / 10, y: Math.round(it.transform[5] * 10) / 10 }))
        .filter((it) => texto(it.str) !== "");
      paginas.push({ itens });
      pagina.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return paginas;
}

module.exports = { lerPdf };
