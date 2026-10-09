"use strict";

// Vocabulário dos eventos de mercado (ADR 0049): os ativos e os tipos de evento. Usado pelo model, pelo parser, pelo
// coletor e pelo serviço; a migration repete os mesmos valores nos CHECKs (mudou aqui, mude lá numa migration nova).

// SOJA desde 2026-10-08 (ADR 0115): leitura própria; com a soja aprovada (ADR 0116), os eventos de política marcam o F4
// (SOJA_POLITICA) e vão ao prompt diário da soja. DOLAR desde 2026-10-09 (fase 1 do dólar, só aquisição, ADR 0124):
// leitura própria, como a da soja na fase 1; com o dólar aprovado (ADR 0126), os eventos dos cinco tipos próprios marcam o
// F8 (DOLAR_EVENTOS) e vão ao prompt diário do dólar.
const ATIVOS = ["OURO", "PETROLEO", "MILHO", "CAFE", "SOJA", "DOLAR"];
const NOME_ATIVO = { OURO: "ouro", PETROLEO: "petróleo", MILHO: "milho", CAFE: "café", SOJA: "soja", DOLAR: "dólar" };
// Como o ativo aparece no texto da IA (seções e listas): com acento e em maiúsculas.
const ROTULO_ATIVO = { OURO: "OURO", PETROLEO: "PETRÓLEO", MILHO: "MILHO", CAFE: "CAFÉ", SOJA: "SOJA", DOLAR: "DÓLAR" };

// Tipo = classificação do evento. A geopolítica é um tipo entre outros. Um tipo com `leituras` só vale nessas leituras
// (os do dólar, ADR 0124): o prompt de cada leitura lista só os seus tipos, e o da leitura principal e o da soja ficam
// como eram.
const TIPOS = [
  { codigo: "GEOPOLITICA", rotulo: "Geopolítica", descricao: "conflito militar, ataque, ameaça, sanção ou ruptura diplomática entre Estados" },
  { codigo: "POLITICA_COMERCIAL", rotulo: "Política comercial", descricao: "tarifa, embargo, cota, acordo, abertura ou fechamento de mercado" },
  { codigo: "CLIMA_EXTREMO", rotulo: "Clima extremo", descricao: "geada, onda de frio, seca ou chuva excepcional em região produtora" },
  { codigo: "REGULACAO", rotulo: "Regulação", descricao: "regra nova de governo ou de bolsa que muda o acesso, o uso ou a negociação do produto" },
  { codigo: "CHOQUE_LOGISTICO", rotulo: "Choque logístico", descricao: "interrupção extraordinária de transporte, porto, rio ou rota, sem causa geopolítica" },
  { codigo: "SANIDADE", rotulo: "Sanidade", descricao: "praga, doença ou problema fitossanitário com efeito sobre oferta ou comércio" },
  { codigo: "POLITICA_OFERTA", rotulo: "Política de oferta", descricao: "toda decisão de produção da OPEP+, inclusive a que mantém as cotas; ou decisão de outro grande produtor que corta ou aumenta a oferta de forma extraordinária" },
  {
    codigo: "POLITICA_MONETARIA",
    rotulo: "Política monetária",
    descricao: "decisão, ata ou comunicação oficial de juros do Copom ou do Fed (FOMC) que muda o rumo esperado dos juros",
    leituras: ["DOLAR"]
  },
  {
    codigo: "POLITICA_FISCAL",
    rotulo: "Política fiscal",
    descricao: "mudança na meta ou na regra fiscal, no orçamento ou em gasto e receita relevantes, anunciada ou aprovada pelo governo ou pelo Congresso",
    leituras: ["DOLAR"]
  },
  {
    codigo: "RISCO_INSTITUCIONAL",
    rotulo: "Risco institucional",
    descricao: "crise política ou institucional: conflito entre Poderes, troca no comando da economia ou do Banco Central, decisão judicial ou eleitoral de grande impacto",
    leituras: ["DOLAR"]
  },
  {
    codigo: "INTERVENCAO_CAMBIAL",
    rotulo: "Intervenção cambial",
    descricao: "atuação EXTRAORDINÁRIA do Banco Central no câmbio (leilão de linha, de swap ou à vista fora da rolagem de rotina) ou mudança de regra cambial",
    leituras: ["DOLAR"]
  },
  {
    codigo: "DADO_ECONOMICO",
    rotulo: "Dado econômico",
    descricao: "indicador de alto impacto divulgado muito acima ou abaixo do esperado pelo mercado (inflação, emprego, atividade), no Brasil ou nos EUA",
    leituras: ["DOLAR"]
  }
];
const CODIGOS_TIPO = TIPOS.map((tipo) => tipo.codigo);

// Os tipos de uma leitura: os explícitos dela (DOLAR) ou, nas outras, os comuns (sem `leituras`), os de sempre.
const TIPOS_EXPLICITOS = { DOLAR: ["GEOPOLITICA", "POLITICA_COMERCIAL", "POLITICA_MONETARIA", "POLITICA_FISCAL", "RISCO_INSTITUCIONAL", "INTERVENCAO_CAMBIAL", "DADO_ECONOMICO"] };
function tiposDaLeitura(leitura) {
  const explicitos = TIPOS_EXPLICITOS[leitura];
  return explicitos ? TIPOS.filter((tipo) => explicitos.includes(tipo.codigo)) : TIPOS.filter((tipo) => !tipo.leituras);
}

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
// O dólar (ADR 0124) segue o mesmo desenho: leitura própria, outra linha por dia, outro prompt.
const FRENTE_DOLAR = { codigo: "DOLAR", nome: "Dólar", ativos: ["DOLAR"] };
const LEITURAS = {
  PRINCIPAL: { codigo: "PRINCIPAL", frentes: FRENTES },
  SOJA: { codigo: "SOJA", frentes: [FRENTE_SOJA] },
  DOLAR: { codigo: "DOLAR", frentes: [FRENTE_DOLAR] }
};
const TODAS_AS_FRENTES = [...FRENTES, FRENTE_SOJA, FRENTE_DOLAR];

function frenteDoAtivo(ativo) {
  return TODAS_AS_FRENTES.find((frente) => frente.ativos.includes(ativo)) || null;
}

// A leitura (coluna `frente`) em que o ativo é lido.
function leituraDoAtivo(ativo) {
  return ativo === "SOJA" || ativo === "DOLAR" ? ativo : "PRINCIPAL";
}

module.exports = {
  ATIVOS,
  NOME_ATIVO,
  ROTULO_ATIVO,
  TIPOS,
  CODIGOS_TIPO,
  tiposDaLeitura,
  FRENTES,
  FRENTE_SOJA,
  FRENTE_DOLAR,
  LEITURAS,
  TODAS_AS_FRENTES,
  frenteDoAtivo,
  leituraDoAtivo
};
