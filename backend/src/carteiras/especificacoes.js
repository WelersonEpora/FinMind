"use strict";

// O que é do SISTEMA nas carteiras virtuais (ADR 0127, §8), igual para todas e mudado só por ADR: as contas e, por
// ativo, a conta dele, a série de preço (a mesma do realizado, realizado-analise.service.js::SERIES_DE_REFERENCIA), a
// moeda do preço, o multiplicador (o que 1 unidade de quantidade vale por 1 ponto de preço) e o tick.
//
// Quantidade (D1, fracionária): na B3, em contratos; na conta internacional, em onças e barris (a unidade do CFD da
// Cartilha, Cap. 5). Com quantidade fracionária, o multiplicador só muda a quantidade, não o resultado em R nem em %.
//
// Fonte dos números: a Tabela 1 da Cartilha v1.0 (a conferir nas páginas da B3, Cap. 10, item 1). O café diverge na
// própria Cartilha: a tabela diz 100 sacas e a nota, ~458 (27.500 kg); fica 100 até a conferência.
const VERSAO = 1;

const CONTAS = Object.freeze({
  B3: Object.freeze({ moeda: "BRL", rotulo: "B3" }),
  INTERNACIONAL: Object.freeze({ moeda: "USD", rotulo: "Internacional" })
});

const ESPECIFICACOES = Object.freeze({
  MILHO: Object.freeze({ conta: "B3", serie: "CCM", moedaPreco: "BRL", multiplicador: 450, tick: 0.01, unidade: "contrato de 450 sacas" }),
  CAFE: Object.freeze({ conta: "B3", serie: "ICF", moedaPreco: "USD", multiplicador: 100, tick: 0.05, unidade: "contrato de 100 sacas" }),
  SOJA: Object.freeze({ conta: "B3", serie: "SJC", moedaPreco: "USD", multiplicador: 450, tick: 0.01, unidade: "contrato de 450 sacas" }),
  OURO: Object.freeze({ conta: "INTERNACIONAL", serie: "GLD", moedaPreco: "USD", multiplicador: 1, tick: 0.01, unidade: "onça" }),
  PETROLEO: Object.freeze({ conta: "INTERNACIONAL", serie: "BRENT_FUTURO", moedaPreco: "USD", multiplicador: 1, tick: 0.01, unidade: "barril" })
});

// Quanto 1 ponto de preço vale, por unidade de quantidade, na moeda da conta. Um preço em dólar numa conta em reais
// (o café e a soja da B3) converte pelo câmbio do dia (a PTAX); sem ele, não há valor.
function valorDoPonto(ativo, conta, cambio = null) {
  const espec = ESPECIFICACOES[ativo];
  if (!espec) throw new Error(`Ativo sem especificação: ${ativo}`);
  const moedaConta = CONTAS[conta]?.moeda;
  if (!moedaConta) throw new Error(`Conta desconhecida: ${conta}`);
  if (espec.moedaPreco === moedaConta) return espec.multiplicador;
  if (espec.moedaPreco !== "USD" || moedaConta !== "BRL") throw new Error(`Conversão de ${espec.moedaPreco} para ${moedaConta} não prevista`);
  if (!(cambio > 0)) return null;
  return espec.multiplicador * cambio;
}

module.exports = { VERSAO, CONTAS, ESPECIFICACOES, valorDoPonto };
