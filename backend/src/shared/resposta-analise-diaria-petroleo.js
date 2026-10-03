"use strict";

const { HORIZONTES, CODIGOS_FAIXA, TENDENCIA_DA_FAIXA } = require("./analise-diaria-petroleo");

// Validação da resposta da leitura diária de tendência do petróleo (ADR 0052), no formato do bloco 6 do prompt
// (ai/prompts/petroleo-analise-diaria.md). Determinística: ou a resposta inteira passa, ou nada é gravado (a execução
// falha com os motivos). É estrita no que a tela e a comparação futura com o realizado usam (horizonte, tendência,
// faixa, confiança e a coerência entre elas), no que não pode ser inventado (o código de um fator, a referência a uma
// evidência) e nos textos que a leitura precisa ter (tese, condição que a invalida). Listas vazias são aceitas: dizer
// que nenhum fator pesa contra é uma leitura válida.

const TENDENCIAS = Object.freeze(["ALTA", "BAIXA", "LATERAL", "INSUFICIENTE"]);
const CONFIANCAS = Object.freeze(["ALTA", "MEDIA", "BAIXA"]);
const PAPEIS_COT = Object.freeze(["CONFIRMA", "EXCESSO", "RISCO_DE_REVERSAO", "ENFRAQUECE", "SEM_PAPEL", "SEM_DADO"]);
const ORIGENS_EVIDENCIA = Object.freeze(["FATOR", "EVENTO", "PRECO", "CURVA"]);
const SITUACOES_LACUNA = Object.freeze(["SEM_DADO", "DEFASADO", "ESTIMADO", "SEM_LEITURA", "CURVA_SEM_DADO", "OUTRO"]);

const textoPreenchido = (valor) => typeof valor === "string" && valor.trim() !== "";

// O texto da IA -> o objeto JSON. Tolera a resposta embrulhada em ```json ... ``` (acontece mesmo com o tipo JSON pedido).
function lerJson(texto) {
  const limpo = String(texto ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(limpo);
  } catch (err) {
    return { erroDeLeitura: `A resposta não é um JSON válido: ${err.message}` };
  }
}

function validarListaDeFatores(lista, campo, prefixo, { codigosFator, idsEvidencia }, erros) {
  if (lista === undefined) return;
  if (!Array.isArray(lista)) {
    erros.push(`${prefixo}: "${campo}" deve ser uma lista.`);
    return;
  }
  lista.forEach((item, i) => {
    const onde = `${prefixo}.${campo}[${i}]`;
    if (!item || !codigosFator.has(item.fator)) erros.push(`${onde}: fator "${item?.fator}" não está entre os fatores do prompt.`);
    for (const id of item?.evidencias || []) {
      if (!idsEvidencia.has(id)) erros.push(`${onde}: cita a evidência "${id}", que não está em "evidencias".`);
    }
  });
}

function validarLeitura(leitura, horizonteEsperado, codigosFator, erros) {
  const prefixo = `leituras[${horizonteEsperado}]`;
  if (!leitura || typeof leitura !== "object") {
    erros.push(`${prefixo}: ausente.`);
    return;
  }
  if (leitura.horizonte !== horizonteEsperado) {
    erros.push(`${prefixo}: horizonte "${leitura.horizonte}" fora da ordem (esperado ${horizonteEsperado}).`);
  }
  const { tendencia, faixa, confianca } = leitura;
  if (!TENDENCIAS.includes(tendencia)) erros.push(`${prefixo}: tendência "${tendencia}" fora da escala.`);

  if (tendencia === "INSUFICIENTE") {
    if (faixa !== null) erros.push(`${prefixo}: com tendência INSUFICIENTE, "faixa" deve ser null.`);
    if (confianca !== null) erros.push(`${prefixo}: com tendência INSUFICIENTE, "confianca" deve ser null.`);
    if (!Array.isArray(leitura.lacunas) || leitura.lacunas.length === 0) {
      erros.push(`${prefixo}: com tendência INSUFICIENTE, "lacunas" não pode ser vazio.`);
    }
  } else if (TENDENCIAS.includes(tendencia)) {
    if (!CODIGOS_FAIXA.includes(faixa)) erros.push(`${prefixo}: faixa "${faixa}" fora da escala.`);
    else if (TENDENCIA_DA_FAIXA[faixa] !== tendencia) erros.push(`${prefixo}: faixa ${faixa} não combina com a tendência ${tendencia}.`);
    if (!CONFIANCAS.includes(confianca)) erros.push(`${prefixo}: confiança "${confianca}" fora da escala.`);
  }

  for (const campo of ["tese", "invalidaSe"]) {
    if (!textoPreenchido(leitura[campo])) erros.push(`${prefixo}: "${campo}" vazio.`);
  }

  const evidencias = Array.isArray(leitura.evidencias) ? leitura.evidencias : [];
  if (leitura.evidencias !== undefined && !Array.isArray(leitura.evidencias)) erros.push(`${prefixo}: "evidencias" deve ser uma lista.`);
  const idsEvidencia = new Set();
  evidencias.forEach((evidencia, i) => {
    const onde = `${prefixo}.evidencias[${i}]`;
    if (!textoPreenchido(evidencia?.id)) erros.push(`${onde}: sem "id".`);
    else if (idsEvidencia.has(evidencia.id)) erros.push(`${onde}: id "${evidencia.id}" repetido.`);
    else idsEvidencia.add(evidencia.id);
    if (!ORIGENS_EVIDENCIA.includes(evidencia?.origem)) erros.push(`${onde}: origem "${evidencia?.origem}" fora da lista.`);
    if (evidencia?.fator != null && !codigosFator.has(evidencia.fator)) {
      erros.push(`${onde}: fator "${evidencia.fator}" não está entre os fatores do prompt.`);
    }
  });

  const contexto = { codigosFator, idsEvidencia };
  validarListaDeFatores(leitura.fatoresAFavor, "fatoresAFavor", prefixo, contexto, erros);
  validarListaDeFatores(leitura.fatoresContra, "fatoresContra", prefixo, contexto, erros);
  validarListaDeFatores(leitura.fatoresPoucoRelevantes, "fatoresPoucoRelevantes", prefixo, contexto, erros);

  if (leitura.posicionamentoCot != null && !PAPEIS_COT.includes(leitura.posicionamentoCot.papel)) {
    erros.push(`${prefixo}: papel do COT "${leitura.posicionamentoCot.papel}" fora da lista.`);
  }
  for (const [i, lacuna] of (Array.isArray(leitura.lacunas) ? leitura.lacunas : []).entries()) {
    if (!SITUACOES_LACUNA.includes(lacuna?.situacao)) erros.push(`${prefixo}.lacunas[${i}]: situação "${lacuna?.situacao}" fora da lista.`);
    if (lacuna?.fator != null && !codigosFator.has(lacuna.fator)) {
      erros.push(`${prefixo}.lacunas[${i}]: fator "${lacuna.fator}" não está entre os fatores do prompt.`);
    }
  }
}

// `texto`: a resposta da IA. `codigosFator`: os códigos dos fatores que foram no prompt. -> { leituras, erros }: com
// algum erro, `leituras` é null.
function validarRespostaAnalise(texto, { codigosFator }) {
  const json = lerJson(texto);
  if (json.erroDeLeitura) return { leituras: null, erros: [json.erroDeLeitura] };

  const erros = [];
  const codigos = new Set(codigosFator);
  if (!Array.isArray(json.leituras)) return { leituras: null, erros: ['A resposta não tem a lista "leituras".'] };
  if (json.leituras.length !== HORIZONTES.length) {
    erros.push(`São ${HORIZONTES.length} leituras, uma por horizonte; vieram ${json.leituras.length}.`);
  }
  HORIZONTES.forEach((horizonte, i) => validarLeitura(json.leituras[i], horizonte.codigo, codigos, erros));
  return erros.length > 0 ? { leituras: null, erros } : { leituras: json.leituras, erros };
}

module.exports = { validarRespostaAnalise, lerJson, TENDENCIAS, CONFIANCAS, PAPEIS_COT, ORIGENS_EVIDENCIA, SITUACOES_LACUNA };
