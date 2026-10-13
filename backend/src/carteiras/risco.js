"use strict";

// O dimensionamento e a conferência de uma entrada (Cartilha v1.0, Cap. 6 e Tabela 2; ADR 0127, §5 e §7):
//
//   risco máximo = patrimônio × risco% do ativo × fator overnight
//   quantidade   = risco máximo ÷ (distância do stop × valor do ponto)       (fracionária, D1)
//   alvo 1 e 2   = entrada ± alvo1R e alvo2R × distância                     (1R = a distância do stop)
//   R:R          = conferido pelo alvo 2 (D10): alvo2R ≥ R:R mínimo
//
// O piso do stop é piso × ATR(14): nas trilhas automáticas, sem estrutura SMC, o piso É o stop; no operador, o stop
// dele precisa ficar pelo menos a essa distância. "Com contratos inteiros" é só indicador (D1): quantos cabem no risco e
// o capital mínimo para 1.

const LADOS = Object.freeze({ COMPRADO: 1, VENDIDO: -1 });

const QUANTIDADE_CASAS = 6;
// Arredonda a quantidade PARA BAIXO: o risco nunca passa do máximo.
const truncar = (v) => Math.floor(v * 10 ** QUANTIDADE_CASAS + 1e-9) / 10 ** QUANTIDADE_CASAS;

function sinal(lado) {
  const s = LADOS[lado];
  if (!s) throw new Error(`Lado desconhecido: ${lado}`);
  return s;
}

// Os níveis de uma posição a partir do preço de entrada.
function niveis(lado, entrada, distancia, { alvo1R, alvo2R }) {
  const s = sinal(lado);
  return { stop: entrada - s * distancia, alvo1: entrada + s * alvo1R * distancia, alvo2: entrada + s * alvo2R * distancia };
}

// O tamanho para uma distância de stop. `paramAtivo`: os parâmetros do ativo (Tabela 2); `fatorOvernight`: o da carteira.
function dimensionar({ distancia, paramAtivo, patrimonio, valorDoPonto, fatorOvernight = 1 }) {
  const riscoMaximo = patrimonio * (paramAtivo.riscoPct / 100) * fatorOvernight;
  const riscoPorUnidade = distancia * valorDoPonto;
  const quantidade = riscoPorUnidade > 0 ? truncar(riscoMaximo / riscoPorUnidade) : 0;
  return {
    distancia,
    riscoMaximo,
    quantidade,
    risco1R: quantidade * riscoPorUnidade,
    rr: paramAtivo.alvo2R,
    rrOk: paramAtivo.alvo2R >= paramAtivo.rrMinimo,
    contratosInteiros: {
      riscoPorContrato: riscoPorUnidade,
      quantosCabem: riscoPorUnidade > 0 ? Math.floor(riscoMaximo / riscoPorUnidade + 1e-9) : 0,
      cabe: riscoPorUnidade <= riscoMaximo + 1e-9,
      capitalMinimo: riscoPorUnidade / ((paramAtivo.riscoPct / 100) * fatorOvernight)
    }
  };
}

// Trilhas automáticas: o stop é o piso. O preço de entrada (o ajuste de D) só existe na liquidação; os níveis saem dele.
function planejarEntradaAutomatica({ atr, paramAtivo, patrimonio, valorDoPonto, fatorOvernight = 1 }) {
  return dimensionar({ distancia: paramAtivo.pisoAtr * atr, paramAtivo, patrimonio, valorDoPonto, fatorOvernight });
}

// Operador: confere o plano dele. -> { aprovado, verificacoes: [{ codigo, ok, detalhe }], plano }. Bloqueiam: o stop do
// lado errado, abaixo do piso, R:R abaixo do mínimo, quantidade nula. Vagas e travas são do motor (motor.js).
function conferirPlanoDoOperador({ lado, entrada, stop, atr, paramAtivo, patrimonio, valorDoPonto, fatorOvernight = 1 }) {
  const s = sinal(lado);
  const distancia = (entrada - stop) * s;
  const piso = atr == null ? null : paramAtivo.pisoAtr * atr;
  const verificacoes = [
    { codigo: "STOP_DO_LADO", ok: distancia > 0, detalhe: `O stop fica ${s > 0 ? "abaixo" : "acima"} da entrada.` },
    {
      codigo: "PISO_ATR",
      ok: piso != null && distancia >= piso - 1e-9,
      detalhe: piso == null ? "Sem ATR(14) do contrato." : `Distância ${distancia.toFixed(4)}; piso ${piso.toFixed(4)} (${paramAtivo.pisoAtr}× ATR).`
    }
  ];
  const plano = distancia > 0 ? { ...dimensionar({ distancia, paramAtivo, patrimonio, valorDoPonto, fatorOvernight }), ...niveis(lado, entrada, distancia, paramAtivo) } : null;
  verificacoes.push({ codigo: "RR_MINIMO", ok: paramAtivo.alvo2R >= paramAtivo.rrMinimo, detalhe: `Alvo 2 em ${paramAtivo.alvo2R}R; mínimo ${paramAtivo.rrMinimo}.` });
  verificacoes.push({ codigo: "QUANTIDADE", ok: Boolean(plano && plano.quantidade > 0), detalhe: plano ? `Quantidade ${plano.quantidade}.` : "Sem quantidade." });
  return { aprovado: verificacoes.every((v) => v.ok), verificacoes, plano };
}

module.exports = { LADOS, sinal, niveis, dimensionar, planejarEntradaAutomatica, conferirPlanoDoOperador, truncar };
