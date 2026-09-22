"use strict";

// Rótulos de exibição dos itens do IMEA (milho de Mato Grosso), ADR 0018. O código vem do parser
// (`collectors/imea/`): o nome da fonte sem acento, em maiúsculas, com "_". Um código que passe a existir sem constar
// aqui aparece com um rótulo derivado do próprio código, sem quebrar. `agregado` = o estado inteiro (soma as regiões e
// os municípios): escala maior, fica em outra ordem e marcado na tela.

// As 7 regiões em que o IMEA divide Mato Grosso (não são as regiões do IBGE) e o estado.
const REGIOES = {
  MATO_GROSSO: "Mato Grosso",
  CENTRO_SUL: "Centro-Sul",
  MEDIO_NORTE: "Médio-Norte",
  NORDESTE: "Nordeste",
  NOROESTE: "Noroeste",
  NORTE: "Norte",
  OESTE: "Oeste",
  SUDESTE: "Sudeste"
};

// Municípios com planilha de custo de produção. Nomes como o IMEA os grafa nos Índices das planilhas.
const MUNICIPIOS = {
  ALTA_FLORESTA: "Alta Floresta",
  BRASNORTE: "Brasnorte",
  CAMPO_NOVO_DO_PARECIS: "Campo Novo do Parecis",
  CANARANA: "Canarana",
  DIAMANTINO: "Diamantino",
  MARCELANDIA: "Marcelândia",
  MATUPA: "Matupá",
  NOVA_MUTUM: "Nova Mutum",
  PARANATINGA: "Paranatinga",
  PORTO_DOS_GAUCHOS: "Porto dos Gaúchos",
  PRIMAVERA_DO_LESTE: "Primavera do Leste",
  QUERENCIA: "Querência",
  SAPEZAL: "Sapezal",
  SINOP: "Sinop",
  SORRISO: "Sorriso",
  TANGARA_DA_SERRA: "Tangará da Serra"
};

const TECNOLOGIAS = { ALTA: "alta tecnologia", MEDIA: "média tecnologia" };

// "PORTO_XYZ" -> "Porto Xyz" (só para um código que não está nas tabelas).
function rotuloDerivado(codigo) {
  return codigo
    .toLowerCase()
    .split("_")
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(" ");
}

// { rotulo, agregado } de uma região do IMEA (estado ou uma das 7 regiões).
function descreverRegiaoImea(codigo) {
  if (REGIOES[codigo]) return { rotulo: REGIOES[codigo], agregado: codigo === "MATO_GROSSO" };
  return { rotulo: rotuloDerivado(codigo), agregado: false };
}

// O item do card de custo é `<TECNOLOGIA>_<LOCAL>` (ex.: ALTA_SORRISO, MEDIA_MATO_GROSSO): a tecnologia faz parte do
// item para que alta e média possam ser comparadas no mesmo gráfico. Devolve { rotulo, agregado } ou null se o código
// não tem esse formato (é ignorado pela tela).
function descreverLocalCustoImea(codigo) {
  const m = /^(ALTA|MEDIA)_(.+)$/.exec(codigo);
  if (!m) return null;
  const local = m[2];
  const nome = REGIOES[local] ?? MUNICIPIOS[local] ?? rotuloDerivado(local);
  return { rotulo: `${nome} - ${TECNOLOGIAS[m[1]]}`, agregado: local === "MATO_GROSSO" };
}

module.exports = { descreverRegiaoImea, descreverLocalCustoImea, REGIOES, MUNICIPIOS };
