"use strict";

// Vocabulário dos eventos de mercado (ADR 0049): os ativos e os tipos de evento. Usado pelo model, pelo parser, pelo
// coletor e pelo serviço; a migration repete os mesmos valores nos CHECKs (mudou aqui, mude lá numa migration nova).

// SOJA desde 2026-10-08 (ADR 0115): leitura própria; com a soja aprovada (ADR 0116), os eventos de política marcam o F4
// (SOJA_POLITICA) e vão ao prompt diário da soja.
const ATIVOS = ["OURO", "PETROLEO", "MILHO", "CAFE", "SOJA"];
const NOME_ATIVO = { OURO: "ouro", PETROLEO: "petróleo", MILHO: "milho", CAFE: "café", SOJA: "soja" };
// Como o ativo aparece no texto da IA (seções e listas): com acento e em maiúsculas.
const ROTULO_ATIVO = { OURO: "OURO", PETROLEO: "PETRÓLEO", MILHO: "MILHO", CAFE: "CAFÉ", SOJA: "SOJA" };

// Tipo = classificação do evento. A geopolítica é um tipo entre outros.
const TIPOS = [
  { codigo: "GEOPOLITICA", rotulo: "Geopolítica", descricao: "conflito militar, ataque, ameaça, sanção ou ruptura diplomática entre Estados" },
  { codigo: "POLITICA_COMERCIAL", rotulo: "Política comercial", descricao: "tarifa, embargo, cota, acordo, abertura ou fechamento de mercado" },
  { codigo: "CLIMA_EXTREMO", rotulo: "Clima extremo", descricao: "geada, onda de frio, seca ou chuva excepcional em região produtora" },
  { codigo: "REGULACAO", rotulo: "Regulação", descricao: "regra nova de governo ou de bolsa que muda o acesso, o uso ou a negociação do produto" },
  { codigo: "CHOQUE_LOGISTICO", rotulo: "Choque logístico", descricao: "interrupção extraordinária de transporte, porto, rio ou rota, sem causa geopolítica" },
  { codigo: "SANIDADE", rotulo: "Sanidade", descricao: "praga, doença ou problema fitossanitário com efeito sobre oferta ou comércio" },
  { codigo: "POLITICA_OFERTA", rotulo: "Política de oferta", descricao: "toda decisão de produção da OPEP+, inclusive a que mantém as cotas; ou decisão de outro grande produtor que corta ou aumenta a oferta de forma extraordinária" }
];
const CODIGOS_TIPO = TIPOS.map((tipo) => tipo.codigo);

// A leitura diária é feita em DUAS chamadas à IA (ADR 0049, item 12), uma por frente: cada uma decide o nível dos seus
// ativos e só lista eventos deles, com as fontes que os cobrem. Numa chamada só, com as 11 fontes, a cobertura do milho e
// do café ficou abaixo do mínimo em 4 de 5 leituras.
const FRENTES = [
  { codigo: "OURO_PETROLEO", nome: "Ouro e petróleo", ativos: ["OURO", "PETROLEO"] },
  { codigo: "MILHO_CAFE", nome: "Milho e café", ativos: ["MILHO", "CAFE"] }
];

// A soja tem leitura PRÓPRIA (ADR 0115): outra linha por dia (`frente` = SOJA), outra chamada e outro prompt, para que
// uma falha ou uma nova leitura da soja nunca toque na leitura dos quatro ativos validados (ADR 0108). LEITURAS: a
// frente gravada na leitura (coluna `frente`) e as frentes de chamada de cada uma.
const FRENTE_SOJA = { codigo: "SOJA", nome: "Soja", ativos: ["SOJA"] };
const LEITURAS = {
  PRINCIPAL: { codigo: "PRINCIPAL", frentes: FRENTES },
  SOJA: { codigo: "SOJA", frentes: [FRENTE_SOJA] }
};
const TODAS_AS_FRENTES = [...FRENTES, FRENTE_SOJA];

function frenteDoAtivo(ativo) {
  return TODAS_AS_FRENTES.find((frente) => frente.ativos.includes(ativo)) || null;
}

// A leitura (coluna `frente`) em que o ativo é lido.
function leituraDoAtivo(ativo) {
  return ativo === "SOJA" ? "SOJA" : "PRINCIPAL";
}

module.exports = { ATIVOS, NOME_ATIVO, ROTULO_ATIVO, TIPOS, CODIGOS_TIPO, FRENTES, FRENTE_SOJA, LEITURAS, TODAS_AS_FRENTES, frenteDoAtivo, leituraDoAtivo };
