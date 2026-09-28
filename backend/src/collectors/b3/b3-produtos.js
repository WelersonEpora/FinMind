"use strict";

// Futuros agrícolas da B3 coletados por vencimento. Um produto novo é uma entrada aqui (e o símbolo em
// shared/utils/b3-contrato.js): o arquivo diário do Up2Data e o Boletim Diário (BDI) têm o mesmo layout
// para todos os produtos do segmento AGRIBUSINESS (conferido em 2026-09-28 para o CCM e o ICF).
//
//   simbolo         prefixo do ticker (CCMF27, ICFZ26)
//   prefixoSerie    séries `<prefixoSerie>.<TICKER>.<CAMPO>` em `observation`
//   unidadePreco    unidade dos campos de preço (o volume financeiro é sempre em R$, nos dois arquivos)
//   tituloBdi       título da tabela do produto no BDI (a linha seguinte tem de ser "Mercado Futuro")
//   resumoBdi       o que o BDI mostra no layout novo (desde 2025-12-12), sem a tabela por vencimento
//
// CCM (milho): ADRs 0009 e 0020. ICF (café arábica): ADR 0028.
const PRODUTOS = {
  ccm: {
    simbolo: "CCM",
    nome: "milho",
    prefixoSerie: "B3.CCM",
    unidadePreco: "BRL/saca",
    codigoColetor: "b3-ccm-futuro",
    codigoColetorBdi: "b3-ccm-bdi",
    tituloBdi: /^CCM: Milho com Liquida/i,
    resumoBdi: /^CCM: MILHO$/
  },
  icf: {
    simbolo: "ICF",
    nome: "café arábica",
    prefixoSerie: "B3.ICF",
    unidadePreco: "USD/saca",
    codigoColetor: "b3-icf-futuro",
    codigoColetorBdi: "b3-icf-bdi",
    tituloBdi: /^ICF: Café Arábica/i,
    resumoBdi: /^ICF: CAF[EÉ]/
  }
};

function produtoB3(chave) {
  const produto = PRODUTOS[chave];
  if (!produto) throw new Error(`Produto B3 desconhecido: ${chave} (conhecidos: ${Object.keys(PRODUTOS).join(", ")}).`);
  return produto;
}

module.exports = { PRODUTOS, produtoB3 };
