"use strict";

// Parser da leitura diária de geopolítica (ADR 0047): decompõe o texto do Gemini (formato em
// ai/prompts/geopolitica-diaria.md) nas seções OURO e PETRÓLEO, cada uma com o nível, o resumo e os blocos
// "EVENTO N". Funções puras, sem I/O. Mesmo critério do parser do AgroMind (ADR 0027 de lá): rótulos fixos no
// início da linha, tolerando as variações de markdown que o modelo às vezes usa (**Rótulo:**, ### EVENTO 1). Nunca
// corrige o texto da IA: um valor fora do vocabulário vira null e quem decide o que fazer é o normalize do coletor.

const NIVEIS = ["NORMAL", "ATENCAO", "RELEVANTE", "EXCEPCIONAL"];
const GRAUS = ["BAIXA", "MEDIA", "ALTA"];
// Pressão do fato sobre o preço (prompt v2): para que lado o fato, sozinho, empurra o preço. Não é previsão.
const PRESSOES = ["ALTA", "BAIXA", "AMBIGUA"];
// Tipo do evento dentro da geopolítica (prompt v6): rótulo da lista fechada -> código. Reconhece pelo começo das
// palavras, sem acento, para aceitar "Conflito militar", "Sanções", "Decisão de produção (OPEP+)". Um valor que não é
// de nenhum tipo vira OUTRO (o tipo veio, só não se encaixa); sem o rótulo, null.
const TIPOS = [
  { codigo: "CONFLITO_MILITAR", padrao: /CONFLITO|MILITAR|ESCALADA|GUERRA/ },
  { codigo: "ROTA_MARITIMA", padrao: /ROTA|MARITIM|NAVIO|ESTREITO/ },
  { codigo: "INFRAESTRUTURA", padrao: /INFRAESTRUTURA|INSTALAC|OLEODUTO|REFINARIA/ },
  { codigo: "SANCAO", padrao: /SANC/ },
  { codigo: "PRODUCAO", padrao: /PRODUC|OPEP/ },
  { codigo: "DIPLOMACIA", padrao: /DIPLOMA|NEGOCIA|TREGUA|CESSAR/ },
  { codigo: "OUTRO", padrao: /OUTRO/ }
];

const ROTULOS_SECAO = [
  { chave: "nivel", padrao: "N[ií]vel" },
  { chave: "resumo", padrao: "Resumo" }
];

const ROTULOS_EVENTO = [
  { chave: "titulo", padrao: "T[ií]tulo" },
  { chave: "tipo", padrao: "Tipo" },
  { chave: "resumo", padrao: "Resumo" },
  { chave: "canal", padrao: "Canal de transmiss[aã]o" },
  { chave: "pressao", padrao: "Press[aã]o sobre o pre[cç]o" },
  { chave: "intensidade", padrao: "Intensidade" },
  { chave: "confianca", padrao: "Confian[cç]a" },
  { chave: "fontes", padrao: "Fontes" }
];

// Linha só com o nome do ativo, aceitando "# OURO", "**PETRÓLEO**", "GEOPOLÍTICA — OURO" e dois-pontos no fim.
const REGEX_SECAO = /^[ \t]*#{0,6}[ \t]*\**[ \t]*(?:GEOPOL[IÍ]TICA[ \t]*[—–-][ \t]*)?(OURO|PETR[OÓ]LEO)[ \t]*\**[ \t]*:?[ \t]*\**[ \t]*$/gim;
const REGEX_EVENTO = /^[ \t]*#{0,6}[ \t]*\**[ \t]*EVENTO[ \t]+\d+[ \t]*\**[ \t]*:?[ \t]*\**[ \t]*$/gim;

function semAcentoMaiusculo(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

// Fatia o texto nos pontos em que a regex casa: [{ match, corpo }], o corpo vai até o próximo cabeçalho.
function fatiar(texto, regex) {
  const cabecalhos = [...texto.matchAll(regex)];
  return cabecalhos.map((m, i) => ({
    match: m,
    corpo: texto.slice(m.index + m[0].length, i + 1 < cabecalhos.length ? cabecalhos[i + 1].index : texto.length)
  }));
}

function limpar(valor) {
  return valor.replace(/^[\s*]+|[\s*]+$/g, "").trim();
}

// Valores dos rótulos de um trecho: cada valor vai do fim do rótulo até o próximo rótulo encontrado.
function extrairCampos(trecho, rotulos) {
  const achados = [];
  for (const { chave, padrao } of rotulos) {
    const m = new RegExp(`^[ \\t]*[-*]?[ \\t]*\\**[ \\t]*${padrao}[ \\t]*\\**[ \\t]*:[ \\t]*\\**`, "im").exec(trecho);
    if (m) achados.push({ chave, inicio: m.index, fimRotulo: m.index + m[0].length });
  }
  achados.sort((a, b) => a.inicio - b.inicio);
  const campos = {};
  achados.forEach((achado, i) => {
    const fim = i + 1 < achados.length ? achados[i + 1].inicio : trecho.length;
    campos[achado.chave] = limpar(trecho.slice(achado.fimRotulo, fim));
  });
  return campos;
}

// Primeira palavra do valor, sem acento e em maiúsculas, se estiver no vocabulário ("Relevante." -> "RELEVANTE").
// Só a primeira palavra: se o modelo ecoar "NORMAL, ATENÇÃO, RELEVANTE ou EXCEPCIONAL", não vira NORMAL.
function vocabulario(valor, permitidos) {
  if (!valor) return null;
  const primeira = semAcentoMaiusculo(valor).split(/[^A-Z]+/).find(Boolean);
  return permitidos.includes(primeira) ? primeira : null;
}

// "Fontes:" -> [{ nome, url }], uma por linha (ou separadas por ";"). Aceita "Nome - URL", "Nome (URL)" e
// "[Nome](URL)". Sem URL, fica só o nome.
function tipo(valor) {
  if (!valor) return null;
  const texto = semAcentoMaiusculo(valor);
  return (TIPOS.find((t) => t.padrao.test(texto)) || { codigo: "OUTRO" }).codigo;
}

function parsearFontes(texto) {
  if (!texto) return [];
  return texto
    .split(/\n+|;/)
    .map((segmento) => segmento.trim())
    .filter(Boolean)
    .map((segmento) => {
      const urlMatch = segmento.match(/https?:\/\/[^\s)\]}>]+/);
      const url = urlMatch ? urlMatch[0].replace(/[.,;]+$/, "") : null;
      const resto = urlMatch ? segmento.slice(0, urlMatch.index) + segmento.slice(urlMatch.index + urlMatch[0].length) : segmento;
      const nome = resto.replace(/[[\]()<>*]/g, " ").replace(/^[\s\-–—:•]+|[\s\-–—:•]+$/g, "").replace(/\s+/g, " ").trim();
      return { nome: nome || null, url };
    })
    .filter((fonte) => fonte.nome || fonte.url);
}

function parsearSecao(corpo) {
  const blocos = fatiar(corpo, REGEX_EVENTO);
  const cabecalho = blocos.length > 0 ? corpo.slice(0, blocos[0].match.index) : corpo;
  const campos = extrairCampos(cabecalho, ROTULOS_SECAO);
  return {
    nivelTexto: campos.nivel || null,
    nivel: vocabulario(campos.nivel, NIVEIS),
    resumo: campos.resumo || null,
    eventos: blocos.map(({ match, corpo: bloco }, i) => {
      const c = extrairCampos(bloco, ROTULOS_EVENTO);
      return {
        ordem: i + 1,
        // O bloco inteiro como veio (cabeçalho + corpo): é contra ele que se cruzam os trechos do grounding.
        trecho: match[0] + bloco,
        titulo: c.titulo || null,
        tipo: tipo(c.tipo),
        resumo: c.resumo || null,
        canal: c.canal || null,
        pressao: vocabulario(c.pressao, PRESSOES),
        intensidade: vocabulario(c.intensidade, GRAUS),
        confianca: vocabulario(c.confianca, GRAUS),
        fontes: parsearFontes(c.fontes)
      };
    })
  };
}

// Texto inteiro -> { OURO?, PETROLEO? }. Uma seção ausente simplesmente não aparece; se o modelo repetir a mesma
// seção, vale a primeira.
function parsearBoletim(texto) {
  const secoes = {};
  for (const { match, corpo } of fatiar(String(texto || ""), REGEX_SECAO)) {
    const ativo = semAcentoMaiusculo(match[1]);
    if (!secoes[ativo]) secoes[ativo] = parsearSecao(corpo);
  }
  return secoes;
}

module.exports = { parsearBoletim, parsearFontes, extrairCampos, vocabulario, tipo, NIVEIS, GRAUS, PRESSOES };
