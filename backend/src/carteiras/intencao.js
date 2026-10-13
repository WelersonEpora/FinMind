"use strict";

// O contrato comum das três trilhas (ADR 0127): cada uma produz, por ativo e dia, uma INTENÇÃO; o motor (motor.js) a
// confere contra os parâmetros e as travas e a transforma em ordem, ou a bloqueia com motivo. A IA e a regra fixa
// nunca dão preço, stop nem quantidade: só o operador traz um plano (`plano`).
//
//   { trilha, ativo, acao, prioridade, origem, referencia, plano }
//
// A ação depende do estado da trilha no ativo: sem posição, entrar ou não; com posição, manter, reduzir ou zerar.

// A Persistência é uma referência calculada, mas decide pelo mesmo contrato (carteiras/referencias.js).
const TRILHAS = Object.freeze(["OPERADOR", "IA", "DETERMINISTICA", "PERSISTENCIA"]);
const ACOES_SEM_POSICAO = Object.freeze(["ENTRAR_COMPRADO", "ENTRAR_VENDIDO", "NAO_ENTRAR"]);
const ACOES_COM_POSICAO = Object.freeze(["MANTER", "REDUZIR", "ZERAR"]);
const ORIGENS = Object.freeze(["RECOMENDACAO", "REGRA", "FALLBACK", "OPERADOR"]);

const LADO_DA_ENTRADA = Object.freeze({ ENTRAR_COMPRADO: "COMPRADO", ENTRAR_VENDIDO: "VENDIDO" });

// -> lista de erros. `comPosicao`: a trilha tem posição no ativo.
function validarIntencao(intencao, { comPosicao }) {
  const erros = [];
  if (!TRILHAS.includes(intencao?.trilha)) erros.push(`trilha "${intencao?.trilha}" desconhecida.`);
  if (!intencao?.ativo) erros.push("sem ativo.");
  const acoes = comPosicao ? ACOES_COM_POSICAO : ACOES_SEM_POSICAO;
  if (!acoes.includes(intencao?.acao)) {
    erros.push(`ação "${intencao?.acao}" não vale ${comPosicao ? "com" : "sem"} posição (${acoes.join(", ")}).`);
  }
  if (!ORIGENS.includes(intencao?.origem)) erros.push(`origem "${intencao?.origem}" desconhecida.`);
  if (!(Number.isInteger(intencao?.prioridade) && intencao.prioridade >= 1)) erros.push("prioridade: inteiro, 1 ou mais.");
  if (intencao?.plano != null && intencao.trilha !== "OPERADOR") erros.push("só o operador traz plano (preço e stop).");
  return erros;
}

module.exports = { TRILHAS, ACOES_SEM_POSICAO, ACOES_COM_POSICAO, ORIGENS, LADO_DA_ENTRADA, validarIntencao };
