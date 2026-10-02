"use strict";

// Os 34 fatores do FEL 1 (`docs/Docs_David/controle_fatores.xlsx`, aba "Controle de Fatores"), na ordem e com o nome
// da planilha. É a única lista de fatores do FinMind: os eventos de mercado (ADR 0049) usam estes códigos no campo
// `fator`, e um evento que não se encaixa em nenhum fica com NAO_SE_APLICA. Não é lugar de criar fator: um fator novo
// entra primeiro na planilha (decisão do David e do Comitê).
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
  { codigo: "PETROLEO_OFERTA_NAO_OPEP", ativo: "PETROLEO", nome: "Oferta não-OPEP (Brasil, Guiana, Noruega)", peso: "Médio" }
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
