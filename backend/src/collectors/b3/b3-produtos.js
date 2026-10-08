"use strict";

// Futuros da B3 coletados por vencimento. Um produto novo é uma entrada aqui (e o símbolo em
// shared/utils/b3-contrato.js): o arquivo diário do Up2Data tem o mesmo layout para todos os produtos,
// de qualquer segmento, e o Boletim Diário (BDI) o mesmo para os do segmento AGRIBUSINESS (conferido em
// 2026-09-28 para o CCM e o ICF).
//
//   simbolo          prefixo do ticker (CCMF27, ICFZ26, GLDZ26)
//   segmento         coluna SgmtNm do arquivo do Up2Data (AGRIBUSINESS, FINANCIAL)
//   prefixoSerie     séries `<prefixoSerie>.<TICKER>.<CAMPO>` em `observation`
//   unidadePreco     unidade dos campos de preço (o volume financeiro é sempre em R$, nos dois arquivos)
//   codigoColetorBdi coletor do BDI (só nos produtos com BDI)
//   tituloBdi        título da tabela do produto no BDI (a linha seguinte tem de ser "Mercado Futuro")
//   resumoBdi        o que o BDI mostra no layout novo (desde 2025-12-12), sem a tabela por vencimento
//
// CCM (milho): ADRs 0009 e 0020. ICF (café arábica): ADR 0028. GLD (ouro em dólar, segmento FINANCIAL):
// ADR 0044 - sem BDI, porque estreou em 2025-07-21, dentro da janela do Up2Data, que cobre o histórico inteiro.
// SJC (soja com liquidação financeira pelo minicontrato de soja da CME, US$/saca): ADR 0109 - o BDI tem a tabela
// por vencimento de 2022-03-21 a 2025-12-11, no mesmo layout do CCM e do ICF (conferido em 2026-10-08).
const PRODUTOS = {
  ccm: {
    simbolo: "CCM",
    nome: "milho",
    segmento: "AGRIBUSINESS",
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
    segmento: "AGRIBUSINESS",
    prefixoSerie: "B3.ICF",
    unidadePreco: "USD/saca",
    codigoColetor: "b3-icf-futuro",
    codigoColetorBdi: "b3-icf-bdi",
    tituloBdi: /^ICF: Café Arábica/i,
    resumoBdi: /^ICF: CAF[EÉ]/
  },
  gld: {
    simbolo: "GLD",
    nome: "ouro",
    segmento: "FINANCIAL",
    prefixoSerie: "B3.GLD",
    unidadePreco: "USD/oz",
    codigoColetor: "b3-gld-futuro"
  },
  sjc: {
    simbolo: "SJC",
    nome: "soja",
    segmento: "AGRIBUSINESS",
    prefixoSerie: "B3.SJC",
    unidadePreco: "USD/saca",
    codigoColetor: "b3-sjc-futuro",
    codigoColetorBdi: "b3-sjc-bdi",
    tituloBdi: /^SJC: Soja com Liquida/i,
    resumoBdi: /^SJC: SOJA/
  }
};

function produtoB3(chave) {
  const produto = PRODUTOS[chave];
  if (!produto) throw new Error(`Produto B3 desconhecido: ${chave} (conhecidos: ${Object.keys(PRODUTOS).join(", ")}).`);
  return produto;
}

module.exports = { PRODUTOS, produtoB3 };
