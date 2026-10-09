"use strict";

// Os 34 fatores do FEL 1 (`docs/Docs_David/controle_fatores.xlsx`, aba "Controle de Fatores"), na ordem e com o nome
// da planilha. É a única lista de fatores do FinMind: os eventos de mercado (ADR 0049) usam estes códigos no campo
// `fator`, e um evento que não se encaixa em nenhum fica com NAO_SE_APLICA. Não é lugar de criar fator: um fator novo
// entra primeiro na planilha (decisão do David e do Comitê). A exceção é a soja, que não está no FEL 1: os fatores dela
// vêm da proposta aprovada pelo Comitê, com o David (ADR 0116), marcados com a `origem`; o peso também é do Comitê.
//
// O código é só um identificador estável do fator da planilha (ativo + nome abreviado).

const NAO_SE_APLICA = "NAO_SE_APLICA";

const FATORES = [
  { codigo: "CAFE_CLIMA", ativo: "CAFE", nome: "Clima e eventos meteorológicos (geadas, secas, chuvas)", peso: "Alto" },
  { codigo: "CAFE_SAFRA_BRASIL", ativo: "CAFE", nome: "Safra brasileira (bienalidade do café)", peso: "Alto" },
  { codigo: "CAFE_ESTOQUES", ativo: "CAFE", nome: "Estoque global e certificado (ICE)", peso: "Alto" },
  { codigo: "CAFE_DOLAR", ativo: "CAFE", nome: "Dólar (USDBRL)", peso: "Médio" },
  { codigo: "CAFE_CUSTO_PRECO_MINIMO", ativo: "CAFE", nome: "Custo de produção e preço mínimo", peso: "Médio" },
  { codigo: "CAFE_DEMANDA", ativo: "CAFE", nome: "Demanda global e consumo", peso: "Médio" },
  { codigo: "CAFE_FUNDOS", ativo: "CAFE", nome: "Especulação e posicionamento de fundos", peso: "Médio" },
  { codigo: "CAFE_JUROS", ativo: "CAFE", nome: "Política monetária e juros globais", peso: "Baixo" },

  { codigo: "MILHO_CLIMA_SAFRA_EUA", ativo: "MILHO", nome: "Clima e safra nos EUA (Crop Progress)", peso: "Alto" },
  { codigo: "MILHO_SAFRINHA", ativo: "MILHO", nome: "Safrinha brasileira (2ª safra)", peso: "Alto" },
  { codigo: "MILHO_ESTOQUES_WASDE", ativo: "MILHO", nome: "Estoques globais e balanço oferta/demanda (WASDE)", peso: "Alto" },
  { codigo: "MILHO_DOLAR_PARIDADE", ativo: "MILHO", nome: "Dólar (USDBRL) e paridade de exportação", peso: "Médio" },
  { codigo: "MILHO_ETANOL", ativo: "MILHO", nome: "Demanda de etanol e biocombustível", peso: "Médio" },
  { codigo: "MILHO_INSUMOS", ativo: "MILHO", nome: "Custo de insumos (fertilizantes, diesel)", peso: "Médio" },
  { codigo: "MILHO_FUNDOS", ativo: "MILHO", nome: "Especulação e posicionamento de fundos", peso: "Médio" },
  { codigo: "MILHO_POLITICA_COMERCIAL", ativo: "MILHO", nome: "Política comercial e exportações (China, tarifas)", peso: "Médio" },

  { codigo: "OURO_JUROS_REAIS", ativo: "OURO", nome: "Juros reais (Fed) e rendimento dos títulos", peso: "Alto" },
  { codigo: "OURO_DOLAR", ativo: "OURO", nome: "Dólar (índice DXY)", peso: "Alto" },
  { codigo: "OURO_INFLACAO", ativo: "OURO", nome: "Inflação e expectativas inflacionárias", peso: "Alto" },
  { codigo: "OURO_GEOPOLITICA", ativo: "OURO", nome: "Geopolítica e risco sistêmico", peso: "Alto" },
  { codigo: "OURO_BANCOS_CENTRAIS", ativo: "OURO", nome: "Demanda de bancos centrais (reservas)", peso: "Alto" },
  { codigo: "OURO_ETFS", ativo: "OURO", nome: "Fluxo de ETFs de ouro", peso: "Médio" },
  { codigo: "OURO_FUNDOS", ativo: "OURO", nome: "Posicionamento de fundos (COT)", peso: "Médio" },
  { codigo: "OURO_MINERACAO", ativo: "OURO", nome: "Produção e oferta de mineração", peso: "Baixo" },

  { codigo: "PETROLEO_OPEP", ativo: "PETROLEO", nome: "Decisões da OPEP+ (cotas de produção)", peso: "Alto" },
  { codigo: "PETROLEO_ESTOQUES_EIA", ativo: "PETROLEO", nome: "Estoques de petróleo dos EUA (EIA)", peso: "Alto" },
  { codigo: "PETROLEO_GEOPOLITICA", ativo: "PETROLEO", nome: "Geopolítica e conflitos (Oriente Médio, Rússia)", peso: "Alto" },
  { codigo: "PETROLEO_DEMANDA", ativo: "PETROLEO", nome: "Demanda global e atividade econômica", peso: "Alto" },
  { codigo: "PETROLEO_DOLAR", ativo: "PETROLEO", nome: "Dólar (índice DXY)", peso: "Médio" },
  { codigo: "PETROLEO_PRODUCAO_EUA", ativo: "PETROLEO", nome: "Produção dos EUA (shale) e rig count", peso: "Médio" },
  { codigo: "PETROLEO_JUROS", ativo: "PETROLEO", nome: "Juros e expectativas macro", peso: "Médio" },
  { codigo: "PETROLEO_FUNDOS", ativo: "PETROLEO", nome: "Especulação e posicionamento de fundos (COT)", peso: "Médio" },
  { codigo: "PETROLEO_REFINO", ativo: "PETROLEO", nome: "Refino e margens (crack spreads)", peso: "Médio" },
  { codigo: "PETROLEO_OFERTA_NAO_OPEP", ativo: "PETROLEO", nome: "Oferta não-OPEP (Brasil, Guiana, Noruega)", peso: "Médio" },

  // A soja NÃO está no FEL 1: os quatro fatores são os da proposta da soja (docs/proposta-ativo-soja.md, v2.2), aprovada
  // pelo Comitê, com o David, em 2026-10-08 (ADR 0116). O peso é fixo por fator, na escala do FEL 1, aprovado pelo Comitê
  // na mesma data (3 = Alto, 2 = Médio, 1 = Baixo); a relevância por horizonte é outra coisa (metodologia-soja.js).
  { codigo: "SOJA_OFERTA_EUA", ativo: "SOJA", nome: "Oferta dos EUA (a safra em formação)", peso: "Alto", origem: "ADR 0116" },
  { codigo: "SOJA_OFERTA_AMERICA_SUL", ativo: "SOJA", nome: "Oferta da América do Sul (a safra concorrente)", peso: "Alto", origem: "ADR 0116" },
  { codigo: "SOJA_DEMANDA_EUA", ativo: "SOJA", nome: "Demanda pela soja dos EUA (exportação e esmagamento)", peso: "Médio", origem: "ADR 0116" },
  { codigo: "SOJA_POLITICA", ativo: "SOJA", nome: "Política (comércio e biocombustíveis)", peso: "Baixo", origem: "ADR 0116" },

  // O dólar (USD/BRL) também NÃO está no FEL 1: os oito fatores são os blocos do relatório do Comitê de 2026-10-08, pela
  // proposta do dólar (docs/proposta-ativo-dolar.md), decidida pelo usuário em 2026-10-09 (ADR 0117, adendo) e aprovada
  // no ADR 0126. O peso é por categoria, na escala do FEL 1, a partir dos pontos do relatório que sobram em cada bloco.
  { codigo: "DOLAR_FLUXO", ativo: "DOLAR", nome: "Fluxo cambial (o financeiro, contratado no BCB)", peso: "Baixo", origem: "ADR 0126" },
  { codigo: "DOLAR_GLOBAL", ativo: "DOLAR", nome: "Dólar global (contra os emergentes)", peso: "Alto", origem: "ADR 0126" },
  { codigo: "DOLAR_JUROS_EUA", ativo: "DOLAR", nome: "Juros dos EUA (Treasury de 2 anos)", peso: "Alto", origem: "ADR 0126" },
  { codigo: "DOLAR_JUROS_BRASIL", ativo: "DOLAR", nome: "Juros do Brasil (a curva do DI)", peso: "Baixo", origem: "ADR 0126" },
  { codigo: "DOLAR_AVERSAO_RISCO", ativo: "DOLAR", nome: "Aversão a risco global (VIX)", peso: "Médio", origem: "ADR 0126" },
  { codigo: "DOLAR_COMMODITIES", ativo: "DOLAR", nome: "Commodities (Brent, café e soja)", peso: "Médio", origem: "ADR 0126" },
  { codigo: "DOLAR_EXPECTATIVAS", ativo: "DOLAR", nome: "Expectativas (o IPCA do Focus)", peso: "Baixo", origem: "ADR 0126" },
  { codigo: "DOLAR_EVENTOS", ativo: "DOLAR", nome: "Eventos domésticos e de política", peso: "Médio", origem: "ADR 0126" }
];

function fatoresDoAtivo(ativo) {
  return FATORES.filter((fator) => fator.ativo === ativo);
}

// O fator de código `codigo`, se for do ativo (um fator do milho não vale para o café); senão null.
function fatorDoAtivo(codigo, ativo) {
  return FATORES.find((fator) => fator.codigo === codigo && fator.ativo === ativo) || null;
}

// Nome para exibição: o da planilha; NAO_SE_APLICA -> "Não se aplica"; desconhecido ou null -> null.
function nomeDoFator(codigo) {
  if (codigo === NAO_SE_APLICA) return "Não se aplica";
  return FATORES.find((fator) => fator.codigo === codigo)?.nome ?? null;
}

module.exports = { FATORES, NAO_SE_APLICA, fatoresDoAtivo, fatorDoAtivo, nomeDoFator };
