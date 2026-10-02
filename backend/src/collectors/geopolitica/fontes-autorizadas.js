"use strict";

const { URL } = require("node:url");

// Sites confiáveis da leitura diária de geopolítica (ADR 0047). UMA lista para os dois ativos: a IA decide em que
// seção o fato entra pelo canal de transmissão (um ataque em Ormuz, do UKMTO, também conta para o ouro), e qualquer
// site da lista sustenta um evento de qualquer ativo. Com listas separadas por ativo, o ouro ficou sem nenhuma fonte
// diária legível (a Reuters não aparece na pesquisa do Gemini) - ver o ADR.
//
// O núcleo são fontes que só publicam quando algo acontece (um aviso do UKMTO já é uma anomalia por definição), mais
// uma agência de notícias para o que nenhuma instituição publica em tempo real (escalada militar, ataque em terra).
// Fonte nova nesta lista só com autorização do usuário registrada no ADR.
//
// A API do Gemini não restringe a busca por domínio: a lista orienta a busca pelo prompt (com "site:") e é conferida
// depois, fonte a fonte, contra os sites que a pesquisa de fato devolveu (verificarNaPesquisa).

const FONTES = {
  UKMTO: {
    nome: "UKMTO / JMIC",
    papel: "incidentes marítimos: ataques, ameaças e desvios em Ormuz, Mar Vermelho e Bab el-Mandeb",
    dominios: ["ukmto.org"],
    apelidos: ["ukmto", "jmic", "joint maritime information center", "united kingdom maritime trade operations"],
    buscas: ["site:ukmto.org warning", "site:ukmto.org JMIC advisory"]
  },
  TESOURO: {
    nome: "Tesouro dos EUA (OFAC e comunicados)",
    papel: "sanções a países produtores, à frota que os atende, a reservas e a pagamentos internacionais",
    dominios: ["treasury.gov"],
    apelidos: ["ofac", "office of foreign assets control", "u.s. treasury", "us treasury", "treasury department", "tesouro dos eua", "departamento do tesouro"],
    buscas: ["site:home.treasury.gov press releases sanctions", "site:ofac.treasury.gov recent actions"]
  },
  OPEP: {
    nome: "OPEP",
    papel: "decisões de produção da OPEP+ (raras, mas decisivas)",
    dominios: ["opec.org"],
    apelidos: ["opep", "opec"],
    buscas: ["site:opec.org press release"]
  },
  AP: {
    nome: "AP News",
    papel: "escalada militar, ataques em terra e fatos que nenhuma instituição publica em tempo real",
    dominios: ["apnews.com"],
    apelidos: ["ap news", "associated press", "apnews"],
    buscas: ["site:apnews.com Iran strike", "site:apnews.com oil attack sanctions", "site:apnews.com gold safe haven"]
  },
  WGC: {
    nome: "World Gold Council",
    papel: "interpretação: se o mercado de ouro está precificando o risco geopolítico (análise semanal, não notícia)",
    dominios: ["gold.org"],
    apelidos: ["world gold council", "wgc"],
    buscas: ["site:gold.org weekly markets monitor"]
  }
};

const CODIGOS = Object.keys(FONTES);

// Hosts de redirecionamento do grounding do Google: a URL não diz o site de origem, então vale o nome citado.
const HOSTS_REDIRECIONAMENTO = ["vertexaisearch.cloud.google.com"];

function semAcento(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function hostDe(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function dominioCasa(host, dominio) {
  return host === dominio || host.endsWith(`.${dominio}`);
}

// Código do site confiável da citação, ou null. Com uma URL de verdade, decide só o domínio: "Reuters via
// business-standard.com" não conta. Sem URL (ou com o redirecionamento do Google), decide o nome.
function classificarFonte({ nome, url }) {
  const host = url ? hostDe(url) : null;
  if (host && !HOSTS_REDIRECIONAMENTO.some((h) => dominioCasa(host, h))) {
    return CODIGOS.find((codigo) => FONTES[codigo].dominios.some((d) => dominioCasa(host, d))) || null;
  }
  const texto = semAcento(nome || "");
  return (
    CODIGOS.find((codigo) =>
      FONTES[codigo].apelidos.some((apelido) => new RegExp(`(^|[^a-z])${apelido.replace(/\./g, "\\.")}([^a-z]|$)`).test(texto))
    ) || null
  );
}

// Sites que a pesquisa desta chamada de fato devolveu. O grounding do Gemini traz um título por resultado, que é o
// domínio ("ukmto.org", "treasury.gov"); a URL é um redirecionamento do Google e não serve.
function sitesDaPesquisa(grounding) {
  return [...new Set((grounding?.groundingChunks || []).map((c) => String(c.web?.title || "").toLowerCase()).filter(Boolean))];
}

// O site confiável `codigo` apareceu nos resultados da pesquisa? Sem isso, a citação não prova nada: no teste de
// 2026-10-02, a IA citou "Reuters" com a página inicial do site sem ter lido nenhuma página do reuters.com.
function verificarNaPesquisa(codigo, sites) {
  return FONTES[codigo].dominios.some((d) => sites.some((site) => dominioCasa(site, d) || dominioCasa(d, site)));
}

// Texto da lista para o prompt: "- UKMTO / JMIC (ukmto.org): incidentes marítimos...".
function listaParaPrompt() {
  return CODIGOS.map((codigo) => `- ${FONTES[codigo].nome} (${FONTES[codigo].dominios.join(", ")}): ${FONTES[codigo].papel}`).join("\n");
}

function sugestoesDeBusca() {
  return Object.values(FONTES)
    .flatMap((fonte) => fonte.buscas)
    .map((busca) => `- ${busca}`)
    .join("\n");
}

module.exports = { FONTES, CODIGOS, classificarFonte, sitesDaPesquisa, verificarNaPesquisa, listaParaPrompt, sugestoesDeBusca };
