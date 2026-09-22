"use strict";

const { slug } = require("./imea-comum");

// Linhas das planilhas de custo de produção do milho do IMEA (ADR 0018), como aparecem na coluna A de cada aba,
// na ordem da planilha. O código de cada item é derivado do rótulo (`codigoDoItem`): a tabela guarda só o rótulo
// da fonte e o nome de exibição, então os dois nunca divergem.
//
// Serve ao catálogo (seletor de métrica do card) e a um teste que confere o parser contra estas linhas. O coletor
// NÃO depende dela: uma linha nova que o IMEA passe a publicar é gravada do mesmo jeito e só não aparece no seletor
// do card até entrar aqui.

// A planilha declara "Unidade: R$/ha." e o parser confere; estas duas linhas são a exceção (unidade no próprio rótulo).
const UNIDADE_PADRAO = "R$/ha";
const UNIDADE_POR_ITEM = { PRODUTIVIDADE_MODAL: "sc/ha", DOLAR_COMPRA: "R$/US$" };

// Tira a fórmula/observação entre parênteses: "A. CUSTEIO (1+2...+6)" -> "A. CUSTEIO".
function codigoDoItem(rotulo) {
  return slug(String(rotulo).replace(/\([^)]*\)/g, " "));
}

function unidadeDoItem(codigo) {
  return UNIDADE_POR_ITEM[codigo] ?? UNIDADE_PADRAO;
}

// [rótulo da fonte, nome de exibição]
const LINHAS = [
  ["A. CUSTEIO (1+2...+6)", "A. Custeio"],
  ["1. SEMENTES", "1. Sementes"],
  ["Semente de Milho", "Semente de milho"],
  ["Semente de Cobertura", "Semente de cobertura"],
  ["2. FERTILIZANTES E CORRETIVOS", "2. Fertilizantes e corretivos"],
  ["Corretivo de Solo", "Corretivo de solo"],
  ["Macronutriente", "Macronutriente"],
  ["Micronutriente", "Micronutriente"],
  ["3. DEFENSIVOS", "3. Defensivos"],
  ["Fungicida", "Fungicida"],
  ["Herbicida", "Herbicida"],
  ["Inseticida", "Inseticida"],
  ["Adjuvante/Outros", "Adjuvante e outros"],
  ["4. OPERAÇÕES MECANIZADAS (óleo diesel e lubrificantes)", "4. Operações mecanizadas"],
  ["Manejo Pré Plantio", "Manejo pré-plantio"],
  ["Adubação e Plantio", "Adubação e plantio"],
  ["Aplicações com Máquinas", "Aplicações com máquinas"],
  ["Aplicações com Avião", "Aplicações com avião"],
  ["Colheita", "Colheita"],
  ["Manejo Pós Colheita", "Manejo pós-colheita"],
  ["5. SERVIÇOS TERCEIRIZADOS", "5. Serviços terceirizados"],
  ["Serviços Terceirizados", "Serviços terceirizados"],
  ["6. MÃO DE OBRA", "6. Mão de obra"],
  ["Permanente", "Mão de obra permanente"],
  ["Temporária", "Mão de obra temporária"],
  ["B. MANUTENÇÃO", "B. Manutenção"],
  ["Manutenção Máq. Equip. Utilit.", "Manutenção de máquinas, equipamentos e utilitários"],
  ["Manutenção Benfeitorias", "Manutenção de benfeitorias"],
  ["C. IMPOSTOS E TAXAS", "C. Impostos e taxas"],
  ["Funrural", "Funrural"],
  ["Fethab I", "Fethab I"],
  ["ITR", "ITR"],
  ["Outros Impostos e Taxas", "Outros impostos e taxas"],
  ["D. FINANCEIRAS", "D. Financeiras"],
  ["Financiamentos", "Financiamentos"],
  ["Seguro da Produção", "Seguro da produção"],
  ["Seguro Máq. Equip. Utilit.", "Seguro de máquinas, equipamentos e utilitários"],
  ["E. PÓS-PRODUÇÃO", "E. Pós-produção"],
  ["Classificação e Beneficiamento", "Classificação e beneficiamento"],
  ["Armazenagem", "Armazenagem"],
  ["Transporte da Produção", "Transporte da produção"],
  ["F. OUTROS CUSTOS", "F. Outros custos"],
  ["Assistência Técnica", "Assistência técnica"],
  ["Combustível Utilitários", "Combustível de utilitários"],
  ["Despesas Gerais", "Despesas gerais"],
  ["G. ARRENDAMENTO", "G. Arrendamento"],
  ["Arrendamento", "Arrendamento"],
  ["COE (A + B + ... + F + G)", "COE - custo operacional efetivo (A a G)"],
  ["H. DEPRECIAÇÕES", "H. Depreciações"],
  ["Depreciação Máquinas", "Depreciação de máquinas"],
  ["Depreciação Implementos", "Depreciação de implementos"],
  ["Depreciação Equipamentos", "Depreciação de equipamentos"],
  ["Depreciação Utilitários", "Depreciação de utilitários"],
  ["Depreciação Benfeitorias", "Depreciação de benfeitorias"],
  ["I. MÃO-DE-OBRA FAMILIAR", "I. Mão de obra familiar"],
  ["Pró-Labore", "Pró-labore"],
  ["COT (COE + H + I)", "COT - custo operacional total (COE + H + I)"],
  ["J. CUSTO DE OPORTUNIDADE", "J. Custo de oportunidade"],
  ["Custo de Oportunidade da Terra", "Custo de oportunidade da terra"],
  ["Capital Circulante", "Capital circulante"],
  ["Máquinas, Implem., Equip. e Utilit.", "Máquinas, implementos, equipamentos e utilitários"],
  ["Benfeitorias", "Benfeitorias"],
  ["CT (COT + J)", "CT - custo total (COT + J)"],
  ["Produtividade Modal (Sc/ha)**", "Produtividade modal"],
  ["Dólar compra (R$/US$)", "Dólar compra (usado pelo IMEA)"]
];

const ITENS_CUSTO = LINHAS.map(([rotulo, nome]) => {
  const codigo = codigoDoItem(rotulo);
  return { codigo, rotulo, nome, unidade: unidadeDoItem(codigo) };
});

module.exports = { ITENS_CUSTO, UNIDADE_PADRAO, UNIDADE_POR_ITEM, codigoDoItem, unidadeDoItem };
