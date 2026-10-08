"use strict";

const { URL } = require("node:url");

// Fontes autorizadas da leitura diária de eventos de mercado (ADRs 0047 e 0049). UMA lista para os quatro ativos: a IA
// decide os ativos de cada evento pelo canal de transmissão, não pela fonte (um ataque no Mar Vermelho, do UKMTO, conta
// para o petróleo, o ouro e o café). Os `tipos` e os `ativos` de cada fonte orientam a busca no prompt; não limitam o
// que a fonte pode sustentar.
//
// Cada fonte tem um ou mais ESCOPOS: o domínio e, quando o domínio é compartilhado, o caminho da instituição. No
// `gov.br`, o domínio sozinho não prova nada (o título que o Google devolve é "www.gov.br" para o MAPA, a Conab ou
// qualquer ministério): vale só `gov.br/agricultura`. A conferência é sempre pela URL final da página lida.
//
// Testadas com a pesquisa do Gemini em 2026-10-02 (ADR 0049) e, as nove últimas, em 2026-10-06 (ADR 0092). Fonte nova
// só com autorização do usuário no ADR.
//
// A API do Gemini não restringe a busca por domínio: a lista orienta a busca pelo prompt (com "site:") e é conferida
// depois, página a página, contra o que a pesquisa de fato leu (paginas-da-pesquisa.js).

const FONTES = {
  UKMTO: {
    nome: "UKMTO / JMIC",
    papel: "incidentes marítimos: ataques, ameaças e desvios em Ormuz, Mar Vermelho e Bab el-Mandeb",
    escopos: [{ host: "ukmto.org" }],
    tipos: ["GEOPOLITICA", "CHOQUE_LOGISTICO"],
    ativos: ["PETROLEO", "OURO", "CAFE"],
    apelidos: ["ukmto", "jmic", "joint maritime information center", "united kingdom maritime trade operations"],
    buscas: [
      { busca: "site:ukmto.org warning", ativos: ["PETROLEO", "OURO"] },
      { busca: "site:ukmto.org JMIC advisory", ativos: ["PETROLEO", "OURO"] },
      { busca: "site:ukmto.org Red Sea Bab el-Mandeb", ativos: ["CAFE"] }
    ]
  },
  TESOURO: {
    nome: "Tesouro dos EUA (OFAC e comunicados)",
    papel: "sanções a países produtores, à frota que os atende, a reservas e a pagamentos internacionais",
    escopos: [{ host: "treasury.gov" }],
    tipos: ["GEOPOLITICA"],
    ativos: ["PETROLEO", "OURO"],
    apelidos: ["ofac", "office of foreign assets control", "u.s. treasury", "us treasury", "treasury department", "tesouro dos eua", "departamento do tesouro"],
    buscas: ["site:home.treasury.gov press releases sanctions", "site:ofac.treasury.gov recent actions"]
  },
  OPEP: {
    nome: "OPEP",
    papel: "decisões de produção da OPEP+ (raras, mas decisivas)",
    escopos: [{ host: "opec.org" }],
    tipos: ["POLITICA_OFERTA"],
    ativos: ["PETROLEO"],
    apelidos: ["opep", "opec"],
    buscas: ["site:opec.org press release"]
  },
  AP: {
    nome: "AP News",
    papel: "escalada militar, ataques em terra e guerra (inclusive no Mar Negro): o que nenhuma instituição publica em tempo real",
    escopos: [{ host: "apnews.com" }],
    tipos: ["GEOPOLITICA"],
    ativos: ["OURO", "PETROLEO", "MILHO"],
    apelidos: ["ap news", "associated press", "apnews"],
    buscas: [
      { busca: "site:apnews.com Iran strike", ativos: ["OURO", "PETROLEO"] },
      { busca: "site:apnews.com oil attack sanctions", ativos: ["OURO", "PETROLEO"] },
      { busca: "site:apnews.com Black Sea ports Odesa grain", ativos: ["MILHO"] }
    ]
  },
  USTR: {
    nome: "USTR (Representante Comercial dos EUA)",
    papel: "tarifas, acordos e investigações comerciais dos EUA (Brasil, China, México)",
    escopos: [{ host: "ustr.gov" }],
    tipos: ["POLITICA_COMERCIAL"],
    ativos: ["MILHO", "CAFE"],
    apelidos: ["ustr", "u.s. trade representative", "office of the united states trade representative", "representante comercial dos eua"],
    buscas: ["site:ustr.gov press release tariff", "site:ustr.gov Brazil", "site:ustr.gov China agriculture"]
  },
  CASA_BRANCA: {
    nome: "Casa Branca (atos presidenciais)",
    papel: "ordens executivas e proclamações: tarifas, isenções, sanções e regras de biocombustível",
    escopos: [{ host: "whitehouse.gov" }],
    tipos: ["POLITICA_COMERCIAL", "REGULACAO", "GEOPOLITICA"],
    ativos: ["MILHO", "CAFE", "PETROLEO"],
    apelidos: ["white house", "whitehouse", "casa branca"],
    buscas: ["site:whitehouse.gov presidential-actions tariff", "site:whitehouse.gov executive order Brazil"]
  },
  MOFCOM: {
    nome: "MOFCOM (Ministério do Comércio da China)",
    papel: "tarifas, contramedidas e restrições de importação da China",
    escopos: [{ host: "mofcom.gov.cn" }],
    tipos: ["POLITICA_COMERCIAL"],
    ativos: ["MILHO"],
    apelidos: ["mofcom", "ministry of commerce", "ministerio do comercio da china"],
    buscas: ["site:english.mofcom.gov.cn tariff countermeasures", "site:english.mofcom.gov.cn agricultural imports"]
  },
  // Código mantido (COMISSAO_EUROPEIA) para não quebrar as fontes já gravadas; o Conselho entrou em 2026-10-02 (ADR 0049):
  // a posição do Conselho sobre resíduos de pesticidas nas importações (30/09) saiu só em consilium.europa.eu.
  COMISSAO_EUROPEIA: {
    nome: "União Europeia (Comissão e Conselho)",
    papel: "regulação de importação da UE (EUDR, a lei antidesmatamento que atinge o café; limites de resíduos de pesticidas) e acordos comerciais (UE-Mercosul)",
    escopos: [{ host: "ec.europa.eu" }, { host: "consilium.europa.eu" }],
    tipos: ["REGULACAO", "POLITICA_COMERCIAL"],
    ativos: ["CAFE", "MILHO"],
    apelidos: ["european commission", "comissao europeia", "council of the eu", "conselho da ue", "conselho da uniao europeia"],
    buscas: ["site:ec.europa.eu EUDR deforestation", "site:ec.europa.eu Mercosur trade agreement", "site:consilium.europa.eu press release import food feed"]
  },
  MAPA: {
    nome: "MAPA (Ministério da Agricultura)",
    papel: "abertura e fechamento de mercados externos, acordos sanitários, pragas e portarias do Brasil",
    escopos: [{ host: "gov.br", caminho: "/agricultura" }],
    tipos: ["POLITICA_COMERCIAL", "SANIDADE", "REGULACAO"],
    ativos: ["MILHO", "CAFE"],
    apelidos: ["mapa", "ministerio da agricultura"],
    buscas: ["site:gov.br/agricultura abertura de mercado", "site:gov.br/agricultura praga milho café"]
  },
  USDA_FAS: {
    nome: "USDA FAS (relatórios GAIN)",
    papel: "medidas de outros governos sobre milho e café (México, China, UE e outros), relatadas pelos adidos agrícolas dos EUA",
    escopos: [{ host: "fas.usda.gov" }],
    tipos: ["POLITICA_COMERCIAL", "SANIDADE", "REGULACAO"],
    ativos: ["MILHO", "CAFE"],
    apelidos: ["usda fas", "foreign agricultural service", "gain report", "relatorio gain"],
    buscas: ["site:fas.usda.gov GAIN corn import policy", "site:fas.usda.gov GAIN coffee"]
  },
  INMET: {
    nome: "INMET (avisos meteorológicos)",
    papel: "avisos de geada e onda de frio nas regiões do café (MG, SP, PR, ES) e da safrinha (PR, MS, MT, GO)",
    escopos: [{ host: "inmet.gov.br" }],
    tipos: ["CLIMA_EXTREMO"],
    ativos: ["CAFE", "MILHO"],
    apelidos: ["inmet", "instituto nacional de meteorologia"],
    buscas: ["site:avisos.inmet.gov.br geada", "site:portal.inmet.gov.br geada onda de frio"]
  },
  // As nove abaixo entraram em 2026-10-06 (ADR 0092, autorização do usuário), depois do teste de acesso com a pesquisa
  // do Gemini (todas lidas na 1ª tentativa). Cobrem o que a lista do ADR 0049 não alcançava: a safra e o clima fora do
  // Brasil e dos EUA, o furacão no Golfo do México, a demanda de etanol e as rotas.
  CENTCOM: {
    nome: "CENTCOM (Comando Central dos EUA)",
    papel: "operações militares dos EUA no Oriente Médio: ataques, bloqueios e interceptações em Ormuz, no Mar Vermelho e no Irã",
    escopos: [{ host: "centcom.mil" }],
    tipos: ["GEOPOLITICA"],
    ativos: ["PETROLEO", "OURO"],
    apelidos: ["centcom", "u.s. central command", "us central command", "comando central"],
    buscas: ["site:centcom.mil press release Iran", "site:centcom.mil Houthi Red Sea"]
  },
  NHC: {
    nome: "NOAA NHC (Centro Nacional de Furacões)",
    papel: "tempestades e furacões que ameaçam a produção e o refino de petróleo no Golfo do México",
    escopos: [{ host: "nhc.noaa.gov" }],
    tipos: ["CLIMA_EXTREMO"],
    ativos: ["PETROLEO"],
    apelidos: ["nhc", "national hurricane center", "centro nacional de furacoes"],
    buscas: ["site:nhc.noaa.gov Gulf of Mexico tropical storm hurricane"],
    // A perspectiva tropical e os avisos de uma tempestade são reescritos na mesma URL: a página repetida em outro dia
    // não indica repetição do evento (ver o coletor).
    paginaAtualizada: true
  },
  BSEE: {
    nome: "BSEE (produção paralisada no Golfo do México)",
    papel: "produção de petróleo e gás paralisada no Golfo do México por tempestade (só publica quando há uma)",
    escopos: [{ host: "bsee.gov" }],
    tipos: ["CLIMA_EXTREMO"],
    ativos: ["PETROLEO"],
    apelidos: ["bsee", "bureau of safety and environmental enforcement"],
    buscas: ["site:bsee.gov hurricane response shut-in production"]
  },
  BCR: {
    nome: "Bolsa de Comercio de Rosario",
    papel: "seca, plantio e estado do milho na Argentina (região núcleo), greves nos portos de Rosário e o nível do rio Paraná",
    escopos: [{ host: "bcr.com.ar" }],
    tipos: ["CLIMA_EXTREMO", "CHOQUE_LOGISTICO"],
    ativos: ["MILHO"],
    apelidos: ["bolsa de comercio de rosario", "bcr", "rosario board of trade"],
    buscas: ["site:bcr.com.ar maíz sequía siembra región núcleo", "site:bcr.com.ar paro portuario Rosario"]
  },
  ARGENTINA: {
    nome: "Governo da Argentina (Boletín Oficial)",
    papel: "imposto de exportação (retenciones) e restrições à exportação de milho da Argentina",
    escopos: [{ host: "argentina.gob.ar" }, { host: "boletinoficial.gob.ar" }],
    tipos: ["POLITICA_COMERCIAL"],
    ativos: ["MILHO"],
    apelidos: ["boletin oficial", "gobierno argentino", "governo argentino", "argentina.gob.ar"],
    buscas: ["site:argentina.gob.ar derechos de exportación maíz", "site:boletinoficial.gob.ar derechos de exportación granos"]
  },
  EPA: {
    nome: "EPA (Agência de Proteção Ambiental dos EUA)",
    papel: "mandatos de etanol dos EUA (volumes do RFS, liberação do E15): a demanda de milho para etanol",
    escopos: [{ host: "epa.gov" }],
    tipos: ["REGULACAO"],
    ativos: ["MILHO"],
    apelidos: ["epa", "environmental protection agency", "renewable fuel standard"],
    buscas: ["site:epa.gov Renewable Fuel Standard volumes", "site:epa.gov E15 emergency fuel waiver"]
  },
  MME: {
    nome: "MME/CNPE (Ministério de Minas e Energia)",
    papel: "mistura de etanol na gasolina (CNPE) e metas do RenovaBio: a demanda de etanol de milho no Brasil",
    escopos: [{ host: "gov.br", caminho: "/mme" }],
    tipos: ["REGULACAO"],
    ativos: ["MILHO"],
    apelidos: ["mme", "cnpe", "ministerio de minas e energia", "conselho nacional de politica energetica"],
    buscas: ["site:gov.br/mme CNPE mistura etanol", "site:gov.br/mme RenovaBio"]
  },
  PANAMA: {
    nome: "Autoridade do Canal do Panamá",
    papel: "restrições de calado e de trânsito no Canal do Panamá (a rota do milho dos EUA para a Ásia e de navios-tanque)",
    escopos: [{ host: "pancanal.com" }],
    tipos: ["CHOQUE_LOGISTICO"],
    ativos: ["MILHO", "PETROLEO"],
    apelidos: ["panama canal authority", "autoridad del canal de panama", "canal do panama", "acp"],
    buscas: ["site:pancanal.com advisory to shipping draft restriction"]
  },
  CPC_ENSO: {
    nome: "NOAA CPC (El Niño e La Niña)",
    papel: "mudança de status do El Niño ou da La Niña (alerta, início, fim), que muda o risco de seca na Argentina, no sul do Brasil e no café da Ásia",
    escopos: [{ host: "cpc.ncep.noaa.gov" }],
    tipos: ["CLIMA_EXTREMO"],
    ativos: ["MILHO", "CAFE"],
    apelidos: ["climate prediction center", "cpc", "noaa cpc", "enso"],
    buscas: ["site:cpc.ncep.noaa.gov ENSO diagnostic discussion"],
    // A discussão mensal sai sempre na mesma URL (ensodisc.shtml).
    paginaAtualizada: true
  }
};

// SOJA (fase 1 da soja, só aquisição, ADR 0115): a leitura própria da soja usa fontes que JÁ estão autorizadas, com o
// papel, os tipos e as buscas da soja num bloco à parte. O `ativos` e o `papel` de cada fonte não mudam: a lista e as
// sugestões das chamadas dos quatro ativos validados ficam exatamente como eram. O clima não é evento da soja (é F1 e F2
// na proposta, `docs/proposta-ativo-soja.md`, §2.9): o INMET e o CPC ficam de fora. O nível do rio Mississippi, citado
// na proposta, não tem fonte autorizada.
const COBERTURA_DA_SOJA = {
  USTR: {
    papel: "tarifas, acordos e compromissos de compra entre os EUA e a China (e outros parceiros) que atingem a soja dos EUA",
    tipos: ["POLITICA_COMERCIAL"],
    buscas: ["site:ustr.gov China soybeans", "site:ustr.gov China agricultural purchases agreement"]
  },
  CASA_BRANCA: {
    papel: "ordens executivas de tarifa e acordos com a China; regras de biocombustível que mudam a demanda de óleo de soja",
    tipos: ["POLITICA_COMERCIAL", "REGULACAO"],
    buscas: ["site:whitehouse.gov China trade agreement soybeans", "site:whitehouse.gov presidential-actions biofuel"]
  },
  MOFCOM: {
    papel: "tarifas, contramedidas e suspensões da China sobre a soja dos EUA",
    tipos: ["POLITICA_COMERCIAL"],
    buscas: ["site:english.mofcom.gov.cn soybeans tariff", "site:english.mofcom.gov.cn countermeasures United States agricultural products"]
  },
  COMISSAO_EUROPEIA: {
    papel: "regulação de importação da UE que atinge a soja (EUDR, a lei antidesmatamento) e o acordo UE-Mercosul",
    tipos: ["REGULACAO", "POLITICA_COMERCIAL"],
    buscas: ["site:ec.europa.eu EUDR soy", "site:ec.europa.eu Mercosur trade agreement"]
  },
  MAPA: {
    papel: "abertura e fechamento de mercados e acordos sanitários da soja brasileira (China em especial)",
    tipos: ["POLITICA_COMERCIAL", "SANIDADE", "REGULACAO"],
    buscas: ["site:gov.br/agricultura soja China mercado"]
  },
  USDA_FAS: {
    papel: "medidas de outros governos sobre a soja (China, UE, Argentina e outros), relatadas pelos adidos agrícolas dos EUA",
    tipos: ["POLITICA_COMERCIAL", "SANIDADE", "REGULACAO"],
    buscas: ["site:fas.usda.gov GAIN soybean policy", "site:fas.usda.gov GAIN China oilseeds"]
  },
  BCR: {
    papel: "greves nos portos de Rosário e o nível do rio Paraná: o polo de esmagamento e exportação da soja da Argentina",
    tipos: ["CHOQUE_LOGISTICO"],
    buscas: ["site:bcr.com.ar paro portuario Rosario", "site:bcr.com.ar bajante río Paraná"]
  },
  ARGENTINA: {
    papel: "imposto de exportação (retenciones) e câmbio especial da soja e dos derivados na Argentina",
    tipos: ["POLITICA_COMERCIAL"],
    buscas: ["site:boletinoficial.gob.ar derechos de exportación soja", "site:argentina.gob.ar retenciones soja"]
  },
  EPA: {
    papel: "volumes do RFS para o biodiesel e o diesel renovável (biomass-based diesel): a demanda de óleo de soja nos EUA",
    tipos: ["REGULACAO"],
    buscas: ["site:epa.gov Renewable Fuel Standard biomass-based diesel volumes"]
  },
  MME: {
    papel: "mistura obrigatória de biodiesel no diesel (CNPE): a demanda de óleo de soja no Brasil",
    tipos: ["REGULACAO"],
    buscas: ["site:gov.br/mme CNPE mistura biodiesel"]
  },
  PANAMA: {
    papel: "restrições de calado e de trânsito no Canal do Panamá (a rota da soja dos EUA para a Ásia)",
    tipos: ["CHOQUE_LOGISTICO"],
    buscas: ["site:pancanal.com advisory to shipping draft restriction"]
  }
};
for (const [codigo, cobertura] of Object.entries(COBERTURA_DA_SOJA)) FONTES[codigo].soja = cobertura;

// Os ativos que a fonte cobre: os da lista e, com o bloco `soja`, a soja.
function ativosDaFonte(fonte) {
  return fonte.soja ? [...fonte.ativos, "SOJA"] : fonte.ativos;
}

// A chamada é só da soja (a leitura própria, ADR 0115): vale o bloco `soja` de cada fonte.
function soDaSoja(ativos) {
  return Array.isArray(ativos) && ativos.length === 1 && ativos[0] === "SOJA";
}

const CODIGOS = Object.keys(FONTES);

// Hosts de redirecionamento do grounding do Google: a URL não diz o site de origem.
const HOSTS_REDIRECIONAMENTO = ["vertexaisearch.cloud.google.com"];

function semAcento(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function dominioCasa(host, dominio) {
  return host === dominio || host.endsWith(`.${dominio}`);
}

// O caminho casa por segmento: "/agricultura" aceita "/agricultura/pt-br/..." e não aceita "/agricultura-familiar".
function caminhoCasa(caminhoUrl, prefixo) {
  return !prefixo || caminhoUrl === prefixo || caminhoUrl.startsWith(`${prefixo}/`);
}

// Código da fonte autorizada a que a URL pertence (domínio e, se houver, o caminho da instituição), ou null.
function fonteDaUrl(url) {
  let partes;
  try {
    partes = new URL(url);
  } catch {
    return null;
  }
  const host = partes.hostname.toLowerCase();
  if (HOSTS_REDIRECIONAMENTO.some((h) => dominioCasa(host, h))) return null;
  const caminho = decodeURIComponent(partes.pathname).toLowerCase();
  return CODIGOS.find((codigo) => FONTES[codigo].escopos.some((e) => dominioCasa(host, e.host) && caminhoCasa(caminho, e.caminho))) || null;
}

// A URL é de uma publicação específica (a matéria, o aviso, o comunicado)? Página inicial, página de autor, de tag, de
// tópico, de busca ou listagem de notícias e comunicados NÃO sustentam um fato (ADR 0049, item 15): no 1º evento do
// reforço militar dos EUA (2026-10-02), a pesquisa ligou ao texto a página do autor na AP. Essas páginas continuam
// contando como fonte lida para o piso (mostram que a fonte foi consultada).
const SEGMENTOS_DE_INDICE = new Set(["author", "authors", "autor", "autores", "tag", "tags", "topic", "topics", "hub", "search", "busca", "category", "categories", "categoria", "categorias"]);
const ULTIMOS_SEGMENTOS_DE_LISTAGEM = new Set([
  "news",
  "newsroom",
  "noticias",
  "ultimas-noticias",
  "press-releases",
  "press-release",
  "releases",
  "presidential-actions",
  "fact-sheets",
  "recent-actions",
  "index.html",
  "index.htm",
  "index.shtml"
]);

function paginaEspecifica(url) {
  let partes;
  try {
    partes = new URL(url);
  } catch {
    return false;
  }
  const segmentos = decodeURIComponent(partes.pathname).toLowerCase().split("/").filter(Boolean);
  if (segmentos.length === 0) return false;
  if (segmentos.some((s) => SEGMENTOS_DE_INDICE.has(s))) return false;
  const ultimo = segmentos[segmentos.length - 1];
  if (ULTIMOS_SEGMENTOS_DE_LISTAGEM.has(ultimo)) return false;
  // Listagem por ano ou por mês: ".../press-releases/2026", ".../press-releases/2026/september".
  const anterior = segmentos[segmentos.length - 2];
  if (/^\d{4}$/.test(ultimo) && ULTIMOS_SEGMENTOS_DE_LISTAGEM.has(anterior)) return false;
  const meses = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  if (meses.includes(ultimo) && /^\d{4}$/.test(anterior || "")) return false;
  return true;
}

// Fonte autorizada de uma CITAÇÃO da IA ({ nome, url }), só para exibir: com uma URL de verdade, decide a URL; sem URL
// (ou com o redirecionamento do Google), decide o nome. A citação nunca sustenta o evento sozinha (ver o coletor).
function classificarFonte({ nome, url }) {
  if (url) {
    let host = null;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      host = null;
    }
    if (host && !HOSTS_REDIRECIONAMENTO.some((h) => dominioCasa(host, h))) return fonteDaUrl(url);
  }
  const texto = semAcento(nome || "");
  return (
    CODIGOS.find((codigo) =>
      FONTES[codigo].apelidos.some((apelido) => new RegExp(`(^|[^a-z])${apelido.replace(/\./g, "\\.")}([^a-z]|$)`).test(texto))
    ) || null
  );
}

// Fontes autorizadas com alguma página lida nesta pesquisa (pela URL final de cada página do grounding).
function fontesDaPesquisa(grounding) {
  const codigos = (grounding?.groundingChunks || []).map((c) => (c.web?.urlFinal ? fonteDaUrl(c.web.urlFinal) : null)).filter(Boolean);
  return [...new Set(codigos)];
}

function rotulosDe(codigos, rotulos) {
  return codigos.map((codigo) => rotulos[codigo] || codigo).join(", ");
}

// Fontes que cobrem algum dos ativos (os de uma chamada: ADR 0049, item 12). Sem `ativos`, todas.
function fontesDosAtivos(ativos) {
  return CODIGOS.filter((codigo) => !ativos || ativosDaFonte(FONTES[codigo]).some((a) => ativos.includes(a)));
}

// Texto da lista para o prompt de uma chamada: "- USTR (...) (ustr.gov) - tipos: Política comercial - ativos: milho,
// café: tarifas ...". Só as fontes que cobrem os ativos da chamada, e só esses ativos em cada uma.
function listaParaPrompt({ rotuloTipo, nomeAtivo, ativos }) {
  const soja = soDaSoja(ativos);
  return fontesDosAtivos(ativos)
    .map((codigo) => {
      const fonte = FONTES[codigo];
      const enderecos = fonte.escopos.map((e) => `${e.host}${e.caminho || ""}`).join(", ");
      if (soja) return `- ${fonte.nome} (${enderecos}) - tipos: ${rotulosDe(fonte.soja.tipos, rotuloTipo)} - ativos: ${nomeAtivo.SOJA}: ${fonte.soja.papel}`;
      const ativosDaFonte = ativos ? fonte.ativos.filter((a) => ativos.includes(a)) : fonte.ativos;
      return `- ${fonte.nome} (${enderecos}) - tipos: ${rotulosDe(fonte.tipos, rotuloTipo)} - ativos: ${rotulosDe(ativosDaFonte, nomeAtivo)}: ${fonte.papel}`;
    })
    .join("\n");
}

// Uma sugestão é um texto (vale para os ativos da fonte) ou { busca, ativos } (só para esses ativos).
function sugestoesDeBusca({ ativos } = {}) {
  if (soDaSoja(ativos)) return fontesDosAtivos(ativos).flatMap((codigo) => FONTES[codigo].soja.buscas.map((busca) => `- ${busca}`)).join("\n");
  return fontesDosAtivos(ativos)
    .flatMap((codigo) =>
      FONTES[codigo].buscas
        .map((s) => (typeof s === "string" ? { busca: s, ativos: FONTES[codigo].ativos } : s))
        .filter((s) => !ativos || s.ativos.some((a) => ativos.includes(a)))
        .map((s) => `- ${s.busca}`)
    )
    .join("\n");
}

module.exports = { FONTES, CODIGOS, ativosDaFonte, fonteDaUrl, paginaEspecifica, classificarFonte, fontesDaPesquisa, fontesDosAtivos, listaParaPrompt, sugestoesDeBusca };
