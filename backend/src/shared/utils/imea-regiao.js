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
const TIPOS_CUSTO = { MENSAL: "mensal", PONDERADO: "ponderado" };

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

// Item do card de custo POR MÊS: `<TIPO>_<TECNOLOGIA>_<LOCAL>` (ex.: PONDERADO_ALTA_SORRISO) - o tipo (Mensal/
// Ponderado) faz parte do item porque os dois arquivos trazem o MESMO mês com valores diferentes (ADR 0018), sem
// série única possível. Item do card de custo POR SAFRA: `<TECNOLOGIA>_<LOCAL>` (ex.: ALTA_SORRISO) - só existe no
// Ponderado, sem ambiguidade de tipo. Tecnologia sempre no item para que alta e média convivam no mesmo gráfico.
// Devolve { rotulo, agregado } ou null se o código não tem nenhum dos dois formatos (é ignorado pela tela).
function descreverLocalCustoImea(codigo) {
  const comTipo = /^(MENSAL|PONDERADO)_(ALTA|MEDIA)_(.+)$/.exec(codigo);
  if (comTipo) {
    const [, tipo, tecnologia, local] = comTipo;
    const nome = REGIOES[local] ?? MUNICIPIOS[local] ?? rotuloDerivado(local);
    return { rotulo: `${nome} - ${TECNOLOGIAS[tecnologia]} (${TIPOS_CUSTO[tipo]})`, agregado: local === "MATO_GROSSO" };
  }
  const semTipo = /^(ALTA|MEDIA)_(.+)$/.exec(codigo);
  if (!semTipo) return null;
  const [, tecnologia, local] = semTipo;
  const nome = REGIOES[local] ?? MUNICIPIOS[local] ?? rotuloDerivado(local);
  return { rotulo: `${nome} - ${TECNOLOGIAS[tecnologia]}`, agregado: local === "MATO_GROSSO" };
}

module.exports = { descreverRegiaoImea, descreverLocalCustoImea, REGIOES, MUNICIPIOS };
