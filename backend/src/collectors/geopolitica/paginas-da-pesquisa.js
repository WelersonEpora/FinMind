"use strict";

// Páginas que a pesquisa do Gemini de fato leu (ADR 0047): o grounding traz, para cada página, um título (o domínio)
// e um link de redirecionamento do Google, e diz quais trechos da resposta se apoiam em quais páginas. Daqui saem os
// links diretos de cada evento: o aviso do UKMTO, o comunicado do Tesouro, a matéria da AP - páginas que a IA leu, não
// URLs digitadas por ela (que podem ser inventadas ou a página inicial do site).
//
// O AgroMind não cruza trechos com páginas (ADR 0027 de lá) por achar frágil. Aqui o cruzamento só ACRESCENTA: sem
// correspondência, o evento fica com as fontes que a IA citou, como antes.

const TIMEOUT_POR_LINK_MS = 10000;
// Trecho curto demais ("OURO", "EVENTO 1") casaria com qualquer bloco.
const TAMANHO_MINIMO_TRECHO = 15;

// Segue cada link de redirecionamento e grava a URL final em `web.urlFinal` (null se não deu). Precisa ser feito na
// coleta: os links do Google expiram. Um link que já é a página (resposta 2xx) vale como está.
async function resolverLinks(grounding, { fetchFn = fetch, signal } = {}) {
  const paginas = grounding?.groundingChunks || [];
  await Promise.all(
    paginas.map(async (pagina) => {
      const uri = pagina.web?.uri;
      if (!uri) return;
      try {
        const resposta = await fetchFn(uri, {
          redirect: "manual",
          signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT_POR_LINK_MS), signal].filter(Boolean))
        });
        const destino = resposta.headers?.get?.("location");
        if (destino && /^https?:\/\//.test(destino)) pagina.web.urlFinal = destino;
        else pagina.web.urlFinal = resposta.status >= 200 && resposta.status < 300 ? uri : null;
      } catch {
        pagina.web.urlFinal = null;
      }
    })
  );
  return grounding;
}

function compactar(texto) {
  return String(texto || "").replace(/\s+/g, " ").trim();
}

// Páginas (com URL final) que apoiam algum trecho contido em `trecho` (o bloco de um EVENTO). [{ site, url }]
function paginasDoTrecho(trecho, grounding) {
  const alvo = compactar(trecho);
  const paginas = grounding?.groundingChunks || [];
  const indices = new Set();
  for (const apoio of grounding?.groundingSupports || []) {
    const segmento = compactar(apoio.segment?.text);
    if (segmento.length >= TAMANHO_MINIMO_TRECHO && alvo.includes(segmento)) {
      for (const indice of apoio.groundingChunkIndices || []) indices.add(indice);
    }
  }
  return [...indices]
    .sort((a, b) => a - b)
    .map((indice) => paginas[indice])
    .filter((pagina) => pagina?.web?.urlFinal)
    .map((pagina) => ({ site: String(pagina.web.title || "").toLowerCase(), url: pagina.web.urlFinal }));
}

module.exports = { resolverLinks, paginasDoTrecho };
