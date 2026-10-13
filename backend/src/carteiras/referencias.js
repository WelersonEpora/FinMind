"use strict";

const { acaoDeterministica } = require("./regras-deterministicas");
const { truncar } = require("./risco");

// As referências calculadas das carteiras (ADR 0127, §2), sem decisão de ninguém, pelo mesmo motor:
//
//   CAIXA              só o rendimento da Selic (nenhuma intenção).
//   PERSISTENCIA       a direção da variação de 30 dias do próprio preço (o contrato operado, sem emendar), com a faixa
//                      LATERAL do horizonte MEDIO do ativo (o benchmark do ADR 0064). A única referência sem nenhuma IA.
//                      Passa pela regra da Determinística com essa direção no lugar do MEDIO (confiança MEDIA): entra a
//                      favor, zera na inversão, reduz uma vez quando fica lateral. Stop, alvos, vagas e travas do motor.
//   COMPRAR_E_SEGURAR  comprado em cada ativo da carteira, com exposição de 1/n do patrimônio (sem alavancagem), sem stop
//                      nem alvo; sai no vencimento (o motor) e volta no pregão seguinte, no próximo contrato. Proposta do
//                      FinMind: a Cartilha não define a referência.
const VERSAO = 1;

// A direção da variação de 30 dias pela faixa LATERAL do ativo. -> "ALTA" | "BAIXA" | "LATERAL" | null (sem variação).
function direcaoDaPersistencia(variacaoPct, t1) {
  if (variacaoPct == null || !Number.isFinite(variacaoPct)) return null;
  if (Math.abs(variacaoPct) < t1) return "LATERAL";
  return variacaoPct > 0 ? "ALTA" : "BAIXA";
}

// `variacoes`: { ATIVO: % em 30 dias | null }; `t1PorAtivo`: { ATIVO: limite LATERAL do MEDIO, em % }.
function intencoesPersistencia({ ativos, variacoes, t1PorAtivo, posicoes = {} }) {
  const direcoes = Object.fromEntries(ativos.map((a) => [a, direcaoDaPersistencia(variacoes[a], t1PorAtivo[a])]));
  // Prioridade: a variação maior em relação à faixa primeiro; depois a ordem da carteira.
  const forca = (a) => (variacoes[a] == null || !t1PorAtivo[a] ? -1 : Math.abs(variacoes[a]) / t1PorAtivo[a]);
  const ordem = ativos.map((a, i) => ({ a, f: forca(a), i })).sort((x, y) => y.f - x.f || x.i - y.i).map((x) => x.a);
  return ativos.map((ativo) => {
    const tendencia = direcoes[ativo];
    const leituras = tendencia ? [{ horizonte: "MEDIO", tendencia, confianca: "MEDIA" }] : null;
    const { acao, motivo } = acaoDeterministica(leituras, posicoes[ativo] || null);
    return {
      trilha: "PERSISTENCIA",
      ativo,
      acao,
      prioridade: ordem.indexOf(ativo) + 1,
      origem: "REGRA",
      referencia: { versaoReferencia: VERSAO, variacao30dPct: variacoes[ativo] ?? null, t1: t1PorAtivo[ativo] ?? null, direcao: tendencia, motivo },
      plano: null
    };
  });
}

// As entradas do comprar e segurar no dia: cada ativo da carteira sem posição, com o contrato e o ajuste de D−1 do
// mercado. As saídas por vencimento vêm do motor (decidir). -> ordens de ENTRADA sem stop.
function entradasComprarESegurar({ ativos, estado, mercado }) {
  const comPosicao = new Set((estado.posicoes || []).map((p) => p.ativo));
  const parte = estado.patrimonio / ativos.length;
  const ordens = [];
  for (const ativo of ativos) {
    const m = mercado[ativo];
    if (comPosicao.has(ativo) || !m?.contrato || !(m.ajuste > 0) || !(m.valorDoPonto > 0)) continue;
    const quantidade = truncar(parte / (m.ajuste * m.valorDoPonto));
    if (!(quantidade > 0)) continue;
    ordens.push({ tipo: "ENTRADA", motivo: "REFERENCIA", ativo, lado: "COMPRADO", contrato: m.contrato, quantidade, semStop: true, origem: "REGRA" });
  }
  return ordens;
}

module.exports = { VERSAO, direcaoDaPersistencia, intencoesPersistencia, entradasComprarESegurar };
