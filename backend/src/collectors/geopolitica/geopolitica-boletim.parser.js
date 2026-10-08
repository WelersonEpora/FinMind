"use strict";

const { ATIVOS, TIPOS, CODIGOS_TIPO } = require("../../shared/eventos-mercado");
const { NAO_SE_APLICA, fatorDoAtivo } = require("../../shared/fatores-fel1");

// Parser da leitura diária de eventos de mercado (ADRs 0047 e 0049): decompõe o texto do Gemini (formato em
// ai/prompts/geopolitica-diaria.md, v7) nas quatro seções de ativo (nível e resumo) e na lista de eventos, cada um com
// os ativos afetados e, por ativo, o fator e a pressão. Funções puras, sem I/O. Mesmo critério do parser do AgroMind
// (ADR 0027 de lá): rótulos fixos no início da linha, tolerando as variações de markdown que o modelo às vezes usa
// (**Rótulo:**, ### EVENTO 1). Nunca corrige o texto da IA: um valor fora do vocabulário vira null e quem decide o que
// fazer é o normalize do coletor.

const NIVEIS = ["NORMAL", "ATENCAO", "RELEVANTE", "EXCEPCIONAL"];
const GRAUS = ["BAIXA", "MEDIA", "ALTA"];
// Pressão do fato sobre o preço (prompt v2): para que lado o fato, sozinho, empurra o preço. Não é previsão.
const PRESSOES = ["ALTA", "BAIXA", "AMBIGUA"];

const ROTULOS_SECAO = [
  { chave: "nivel", padrao: "N[ií]vel" },
  { chave: "resumo", padrao: "Resumo" }
];

const ROTULOS_EVENTO = [
  { chave: "titulo", padrao: "T[ií]tulo" },
  { chave: "tipo", padrao: "Tipo" },
  { chave: "ativos", padrao: "Ativos?(?: afetados)?" },
  { chave: "fator", padrao: "Fator(?:es)?" },
  { chave: "resumo", padrao: "Resumo" },
  { chave: "canal", padrao: "Canal de transmiss[aã]o" },
  { chave: "pressao", padrao: "Press[aã]o sobre o pre[cç]o" },
  { chave: "intensidade", padrao: "Intensidade" },
  { chave: "confianca", padrao: "Confian[cç]a" },
  { chave: "fontes", padrao: "Fontes" }
];

// Linha só com o nome da seção, aceitando "# OURO", "**PETRÓLEO**", "GEOPOLÍTICA — OURO" e dois-pontos no fim.
const REGEX_SECAO =
  /^[ \t]*#{0,6}[ \t]*\**[ \t]*(?:GEOPOL[IÍ]TICA[ \t]*[—–-][ \t]*)?(OURO|PETR[OÓ]LEO|MILHO|CAF[EÉ]|SOJA|EVENTOS)[ \t]*\**[ \t]*:?[ \t]*\**[ \t]*$/gim;
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

// Código do ativo de um texto ("PETRÓLEO", "Café", "petroleo") ou null.
function ativo(texto) {
  const normalizado = semAcentoMaiusculo(String(texto || "")).replace(/[^A-Z]/g, "");
  return ATIVOS.includes(normalizado) ? normalizado : null;
}

// Tipo do evento: o código ("POLITICA_COMERCIAL") ou o rótulo ("Política comercial"). Fora da lista, null.
function tipo(valor) {
  if (!valor) return null;
  const normalizado = semAcentoMaiusculo(limpar(valor)).replace(/[^A-Z]+/g, "_").replace(/^_+|_+$/g, "");
  if (CODIGOS_TIPO.includes(normalizado)) return normalizado;
  const porRotulo = TIPOS.find((t) => semAcentoMaiusculo(t.rotulo).replace(/[^A-Z]+/g, "_") === normalizado);
  return porRotulo ? porRotulo.codigo : null;
}

// "PETROLEO, OURO" -> ["PETROLEO", "OURO"], sem repetição e ignorando o que não é ativo.
function listaDeAtivos(valor) {
  if (!valor) return [];
  return [...new Set(String(valor).split(/[,;/\n]|\s+e\s+/i).map(ativo).filter(Boolean))];
}

// Valor por ativo: "PETROLEO=alta; OURO=ambígua" (também "PETRÓLEO: alta") -> { PETROLEO: "alta", OURO: "ambígua" }.
// Um valor sem ativo ("alta") vale para todos: { "*": "alta" }.
function valoresPorAtivo(valor) {
  if (!valor) return {};
  const pares = {};
  for (const parte of String(valor).split(/[;\n]/).map((p) => p.trim()).filter(Boolean)) {
    const m = parte.match(/^[-*\s]*([A-Za-zÀ-ÿ]+)\s*[=:]\s*(.+)$/);
    const codigo = m && ativo(m[1]);
    if (codigo) pares[codigo] = limpar(m[2]);
  }
  return Object.keys(pares).length > 0 ? pares : { "*": limpar(String(valor)) };
}

// Texto livre por ativo (o canal de transmissão, prompt v9): "PETROLEO=frete e seguro sobem; o risco de...; OURO=..."
// -> { PETROLEO: "...", OURO: "..." }. Corta só no "ATIVO=" (o texto pode ter ";" e ":"). Sem nenhum "ATIVO=", o texto
// inteiro vale para todos: { "*": texto } (formato da v7/v8).
const REGEX_ROTULO_ATIVO = /(?:^|[;\n]\s*|\s)[-*]?\s*(OURO|PETR[OÓ]LEO|MILHO|CAF[EÉ]|SOJA)\s*=\s*/gi;

function textoPorAtivo(valor) {
  if (!valor) return {};
  const texto = String(valor);
  const rotulos = [...texto.matchAll(REGEX_ROTULO_ATIVO)];
  if (rotulos.length === 0) return { "*": limpar(texto) };
  const pares = {};
  rotulos.forEach((m, i) => {
    const fim = i + 1 < rotulos.length ? rotulos[i + 1].index : texto.length;
    const trecho = texto.slice(m.index + m[0].length, fim).replace(/[;\s]+$/, "");
    pares[ativo(m[1])] = limpar(trecho);
  });
  return pares;
}

function valorDoAtivo(porAtivo, codigoAtivo) {
  return porAtivo[codigoAtivo] ?? porAtivo["*"] ?? null;
}

// Fator do ativo: um código dos 34 fatores do FEL 1 que seja DAQUELE ativo, ou NAO_SE_APLICA. Outro valor, null.
function fator(valor, codigoAtivo) {
  if (!valor) return null;
  const codigo = semAcentoMaiusculo(limpar(valor)).split(/[^A-Z_]+/).find(Boolean);
  if (codigo === NAO_SE_APLICA) return NAO_SE_APLICA;
  return fatorDoAtivo(codigo, codigoAtivo) ? codigo : null;
}

// "Fontes:" -> [{ nome, url }], uma por linha (ou separadas por ";"). Aceita "Nome - URL", "Nome (URL)" e
// "[Nome](URL)". Sem URL, fica só o nome.
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

// Um bloco "EVENTO N". `ativoDaSecao`: o bloco veio dentro da seção de um ativo (formato antigo, sem a seção
// EVENTOS) e não trouxe "Ativos:" - vale esse ativo.
function parsearEvento({ match, corpo }, ordem, ativoDaSecao) {
  const c = extrairCampos(corpo, ROTULOS_EVENTO);
  const ativos = listaDeAtivos(c.ativos);
  if (ativos.length === 0 && ativoDaSecao) ativos.push(ativoDaSecao);
  const fatores = valoresPorAtivo(c.fator);
  const pressoes = valoresPorAtivo(c.pressao);
  const intensidades = valoresPorAtivo(c.intensidade);
  const canais = textoPorAtivo(c.canal);
  return {
    ordem,
    // O bloco inteiro como veio (cabeçalho + corpo): é contra ele que se cruzam os trechos do grounding.
    trecho: match[0] + corpo,
    titulo: c.titulo || null,
    tipoTexto: c.tipo || null,
    tipo: tipo(c.tipo),
    ativos,
    // Por ativo afetado: o fator do FEL 1 (ou NAO_SE_APLICA), a pressão, a intensidade e o canal de transmissão daquele
    // ativo (prompt v9: o ouro afetado de forma indireta não herda o canal nem a intensidade do petróleo); fora do
    // vocabulário, null.
    porAtivo: Object.fromEntries(
      ativos.map((codigo) => [
        codigo,
        {
          fator: fator(valorDoAtivo(fatores, codigo), codigo),
          pressao: vocabulario(valorDoAtivo(pressoes, codigo), PRESSOES),
          intensidade: vocabulario(valorDoAtivo(intensidades, codigo), GRAUS),
          canal: valorDoAtivo(canais, codigo)
        }
      ])
    ),
    resumo: c.resumo || null,
    confianca: vocabulario(c.confianca, GRAUS),
    fontes: parsearFontes(c.fontes)
  };
}

// Texto inteiro -> { ativos: { OURO?: { nivel, nivelTexto, resumo }, ... }, eventos: [...] }. Uma seção ausente
// simplesmente não aparece; se o modelo repetir a mesma seção, vale a primeira. Os eventos vêm da seção EVENTOS e,
// se o modelo os puser dentro da seção de um ativo, também de lá.
function parsearBoletim(texto) {
  const ativos = {};
  const blocos = [];
  for (const { match, corpo } of fatiar(String(texto || ""), REGEX_SECAO)) {
    const nome = semAcentoMaiusculo(match[1]);
    const eventosDaSecao = fatiar(corpo, REGEX_EVENTO);
    if (nome === "EVENTOS") {
      blocos.push(...eventosDaSecao.map((bloco) => ({ bloco, ativoDaSecao: null })));
      continue;
    }
    const codigo = ativo(nome);
    if (ativos[codigo]) continue;
    const cabecalho = eventosDaSecao.length > 0 ? corpo.slice(0, eventosDaSecao[0].match.index) : corpo;
    const campos = extrairCampos(cabecalho, ROTULOS_SECAO);
    ativos[codigo] = { nivelTexto: campos.nivel || null, nivel: vocabulario(campos.nivel, NIVEIS), resumo: campos.resumo || null };
    blocos.push(...eventosDaSecao.map((bloco) => ({ bloco, ativoDaSecao: codigo })));
  }
  return { ativos, eventos: blocos.map(({ bloco, ativoDaSecao }, i) => parsearEvento(bloco, i + 1, ativoDaSecao)) };
}

module.exports = { parsearBoletim, parsearFontes, extrairCampos, vocabulario, tipo, listaDeAtivos, valoresPorAtivo, textoPorAtivo, fator, NIVEIS, GRAUS, PRESSOES };
