"use strict";

// A REGRA FIXA da trilha Determinística (ADR 0127, §6; decisão do usuário, 2026-10-13), sobre as leituras de tendência
// do dia (as de `analise_diaria`, congeladas na rodada). Sem chamada à IA; as leituras, porém, são da IA: a diferença
// entre a trilha IA e esta mede o valor da recomendação, não o da IA inteira. Mudar a regra é versão nova (VERSAO), que
// abre um segmento novo de medição.
//
//   Sem posição: entrar comprado se o MEDIO está em ALTA com confiança MEDIA ou ALTA e o CURTO não está em BAIXA;
//                entrar vendido no simétrico; senão, não entrar.
//   Com posição: zerar se o MEDIO virou para o lado oposto; reduzir (uma vez por operação) se o MEDIO está LATERAL ou
//                INSUFICIENTE, ou com confiança BAIXA; senão, manter.
//   Prioridade:  a confiança do MEDIO, a faixa FORTE antes da LEVE, a ordem dos ativos na carteira.
//   Sem leitura: não entrar, ou manter.
const VERSAO = 1;

const CONFIANCA_PESO = Object.freeze({ ALTA: 2, MEDIA: 1, BAIXA: 0 });

function leituraDo(leituras, horizonte) {
  return (leituras || []).find((l) => l?.horizonte === horizonte) || null;
}

// `leituras`: as do ativo no dia ([{ horizonte, tendencia, faixa, confianca }]) ou null (sem leitura).
// `posicao`: null ou { lado: "COMPRADO" | "VENDIDO", reduzida }. -> { acao, motivo }.
function acaoDeterministica(leituras, posicao) {
  const medio = leituraDo(leituras, "MEDIO");
  const curto = leituraDo(leituras, "CURTO");
  if (!medio) return posicao ? { acao: "MANTER", motivo: "SEM_LEITURA" } : { acao: "NAO_ENTRAR", motivo: "SEM_LEITURA" };

  if (!posicao) {
    const firme = medio.confianca === "ALTA" || medio.confianca === "MEDIA";
    if (firme && medio.tendencia === "ALTA" && curto?.tendencia !== "BAIXA") return { acao: "ENTRAR_COMPRADO", motivo: "MEDIO_ALTA" };
    if (firme && medio.tendencia === "BAIXA" && curto?.tendencia !== "ALTA") return { acao: "ENTRAR_VENDIDO", motivo: "MEDIO_BAIXA" };
    return { acao: "NAO_ENTRAR", motivo: "SEM_SINAL" };
  }

  const oposta = posicao.lado === "COMPRADO" ? "BAIXA" : "ALTA";
  if (medio.tendencia === oposta) return { acao: "ZERAR", motivo: "MEDIO_INVERTEU" };
  const fraca = medio.tendencia === "LATERAL" || medio.tendencia === "INSUFICIENTE" || medio.confianca === "BAIXA";
  if (fraca && !posicao.reduzida) return { acao: "REDUZIR", motivo: "MEDIO_ENFRAQUECEU" };
  return { acao: "MANTER", motivo: fraca ? "JA_REDUZIDA" : "MEDIO_CONFIRMA" };
}

// As intenções da trilha num dia. `ativos`: na ordem da carteira; `leiturasPorAtivo`: { ATIVO: leituras | null };
// `posicoes`: { ATIVO: posição | null }. -> as intenções, com a prioridade de 1 a n.
function intencoesDeterministicas({ ativos, leiturasPorAtivo, posicoes = {} }) {
  const chave = (ativo, i) => {
    const medio = leituraDo(leiturasPorAtivo[ativo], "MEDIO");
    return [-(CONFIANCA_PESO[medio?.confianca] ?? -1), String(medio?.faixa || "").endsWith("_FORTE") ? 0 : 1, i];
  };
  const ordem = ativos
    .map((ativo, i) => ({ ativo, k: chave(ativo, i) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2])
    .map((x) => x.ativo);
  return ativos.map((ativo) => {
    const { acao, motivo } = acaoDeterministica(leiturasPorAtivo[ativo], posicoes[ativo] || null);
    return {
      trilha: "DETERMINISTICA",
      ativo,
      acao,
      prioridade: ordem.indexOf(ativo) + 1,
      origem: "REGRA",
      referencia: { versaoRegra: VERSAO, motivo },
      plano: null
    };
  });
}

module.exports = { VERSAO, acaoDeterministica, intencoesDeterministicas };
