"use strict";

// Atuações do BCB no mercado de câmbio (ADR 0122): cada par "Instrumento / Modalidade" do CSV do BCB vira um item, com
// o código das séries `BCB.ATUACAO_CAMBIO.<ITEM>.<CAMPO>`. A lista é a da fonte em 2026-10-09 (13 pares, de 1999 a
// 2026-08); um par novo não é adivinhado: o coletor o marca como inválido, para alguém incluí-lo aqui.
const COMBINACOES = [
  { instrumento: "Swap Cambial", modalidade: "Tradicional", codigo: "SWAP_TRADICIONAL", rotulo: "Swap cambial tradicional" },
  { instrumento: "Swap Cambial", modalidade: "Reverso", codigo: "SWAP_REVERSO", rotulo: "Swap cambial reverso" },
  { instrumento: "Venda a Vista", modalidade: "Mercado", codigo: "VENDA_VISTA", rotulo: "Venda à vista" },
  { instrumento: "Venda a Vista", modalidade: "PTAX", codigo: "VENDA_VISTA_PTAX", rotulo: "Venda à vista pela PTAX" },
  { instrumento: "Venda a Vista", modalidade: "ACC/ACE", codigo: "VENDA_VISTA_ACC_ACE", rotulo: "Venda à vista (ACC/ACE)" },
  { instrumento: "Venda com Recompra", modalidade: "Pré-fixado", codigo: "LINHA_PREFIXADA", rotulo: "Linha (venda com recompra), pré-fixada" },
  { instrumento: "Venda com Recompra", modalidade: "Pós-fixado Selic", codigo: "LINHA_POS_SELIC", rotulo: "Linha (venda com recompra), pós-fixada na Selic" },
  { instrumento: "Compra a Vista", modalidade: "Mercado", codigo: "COMPRA_VISTA", rotulo: "Compra à vista" },
  { instrumento: "Compra a Termo", modalidade: "Mercado", codigo: "COMPRA_TERMO", rotulo: "Compra a termo" },
  { instrumento: "Empréstimo", modalidade: "ACC/ACE", codigo: "EMPRESTIMO_ACC_ACE", rotulo: "Empréstimo (ACC/ACE)" },
  { instrumento: "Empréstimo", modalidade: "Sem Direcionamento", codigo: "EMPRESTIMO_SEM_DIRECIONAMENTO", rotulo: "Empréstimo sem direcionamento" },
  {
    instrumento: "Empréstimo",
    modalidade: "Títulos Soberanos (Global Bonds)",
    codigo: "EMPRESTIMO_GLOBAL_BONDS",
    rotulo: "Empréstimo com garantia em títulos soberanos (Global Bonds)"
  },
  {
    instrumento: "Operação Compromissada",
    modalidade: "Títulos Soberanos (Global Bonds)",
    codigo: "COMPROMISSADA_GLOBAL_BONDS",
    rotulo: "Compromissada em títulos soberanos (Global Bonds)"
  }
];

function combinacaoDe(instrumento, modalidade) {
  return COMBINACOES.find((c) => c.instrumento === instrumento && c.modalidade === modalidade) ?? null;
}

// Para a tela (dimensão de itens): { rotulo } ou null se o código não for de uma atuação.
function descreverAtuacaoCambio(codigo) {
  const combinacao = COMBINACOES.find((c) => c.codigo === codigo);
  return combinacao ? { rotulo: combinacao.rotulo, agregado: false } : null;
}

module.exports = { COMBINACOES, combinacaoDe, descreverAtuacaoCambio };
