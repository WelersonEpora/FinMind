"use strict";

// CSV pensado para abrir direto no Excel em pt-BR: separador `;`, vírgula
// decimal, quebra de linha CRLF e BOM UTF-8 (sem ele os acentos quebram).
const SEPARADOR = ";";
const QUEBRA_DE_LINHA = "\r\n";
const BOM_UTF8 = String.fromCharCode(0xfeff);

function escaparCampo(valor) {
  const texto = String(valor);
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// Número com vírgula decimal e SEM arredondar - quem confere o dado precisa
// do valor exatamente como está gravado.
function formatarNumero(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "";
  return String(valor).replace(".", ",");
}

// `YYYY-MM-DD HH:MM:SS` em UTC. Aceita Date ou texto já formatado pelo driver.
function formatarDataHoraUtc(valor) {
  if (!valor) return "";
  if (valor instanceof Date) return valor.toISOString().slice(0, 19).replace("T", " ");
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? String(valor) : data.toISOString().slice(0, 19).replace("T", " ");
}

function montarLinha(campos) {
  return campos.map((campo) => escaparCampo(campo ?? "")).join(SEPARADOR);
}

function montarCsv(cabecalho, linhas) {
  return BOM_UTF8 + [montarLinha(cabecalho), ...linhas.map(montarLinha)].join(QUEBRA_DE_LINHA) + QUEBRA_DE_LINHA;
}

module.exports = { montarCsv, formatarNumero, formatarDataHoraUtc };
