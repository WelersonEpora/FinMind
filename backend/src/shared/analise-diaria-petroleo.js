"use strict";

const { CODIGOS_FAIXA, TENDENCIA_DA_FAIXA, criarClassificador } = require("./analise-diaria-base");

// Configuração do prompt diário de análise do petróleo (ADR 0051): o que a metodologia define e o prompt só MOSTRA.
// Nada daqui é escrito à mão no texto do prompt (ai/prompts/petroleo-analise-diaria.md): o serviço monta as tabelas
// a partir destes valores. Mudar um valor = versão nova desta configuração (VERSAO), registrada em cada prompt gerado.
//
// Parâmetros do PROMPT (horizontes, faixas, preço de referência, histórico) e de VALIDAÇÃO (referência dos horizontes,
// classificação do realizado). Os parâmetros dos FATORES ficam em cada fator e na tabela fator_parametro (ADR 0050).

// v1 (2026-10-03): horizontes contados da data do último preço. v2 (2026-10-03): da data da análise (REFERENCIA_HORIZONTES).
const VERSAO = 2;

// Os quatro horizontes, cada um analisado separadamente (decisão do usuário, 2026-10-03). `variacao`: a janela do
// Centro de Decisão com o mesmo prazo (centro-decisao.service.js::VARIACOES), a que o bloco de preço mostra.
const HORIZONTES = Object.freeze([
  { codigo: "IMEDIATO", rotulo: "Imediato", dias: 1, variacao: "d1" },
  { codigo: "CURTO", rotulo: "Curto", dias: 7, variacao: "d7" },
  { codigo: "MEDIO", rotulo: "Médio", dias: 30, variacao: "d30" },
  { codigo: "LONGO", rotulo: "Longo", dias: 90, variacao: "d90" }
]);

// As faixas de variação do WTI, em %, por horizonte. PROVISÓRIAS (2026-10-03): T1 e T2 são os percentis 40 e 80 da
// variação absoluta do WTI à vista de 2010 a 2026 (banco de dev), arredondados, com a mesma regra de variação do
// Centro de Decisão: |1 dia| 0,93 / 2,59%; |7 dias| 2,15 / 5,78%; |30 dias| 5,00 / 12,00%; |90 dias| 7,77 / 20,25%.
// Assim, ~40% dos casos históricos caem em LATERAL e ~20% em FORTE, nos quatro horizontes. O mesmo critério dos
// limiares dos fatores (percentis ~40 e ~80); a metodologia ajusta.
const FAIXAS = Object.freeze({
  IMEDIATO: { t1: 1, t2: 2.5 },
  CURTO: { t1: 2, t2: 6 },
  MEDIO: { t1: 5, t2: 12 },
  LONGO: { t1: 8, t2: 20 }
});

// De onde os horizontes são contados (ADR 0052, adendo de 2026-10-03): da DATA DA ANÁLISE. A v1 contava da data do
// último preço do WTI na BASE, mas a EIA publica os preços diários uma vez por semana e a leitura já usa eventos
// posteriores a esse preço: o horizonte de 1 dia caía num dia que já tinha passado, com notícias de depois dele. Agora
// a IA lê para frente a partir do dia da leitura e sabe que o preço entre o último pregão da BASE e esse dia é
// desconhecido. Para comparar com o realizado, a base é o preço do último pregão até a data da análise (conhecido
// depois) e o fim é o do último pregão até a data da análise + os dias do horizonte.
// As leituras gravadas com a v1 continuam com "DATA_DO_ULTIMO_PRECO" na entrada, e a tela respeita o que foi gravado.
const REFERENCIA_HORIZONTES = "DATA_DA_ANALISE";

// O preço de referência: a série do Centro de Decisão (centro-decisao.service.js::ATIVOS), quantos pregões o histórico
// do bloco de preço lista e os textos do bloco que dependem do ativo (o nome curto, a unidade da lista de pregões, o
// que a tabela 2.4 mede e os avisos da fonte). `emReais`: uma linha com o preço convertido pela PTAX (só no ouro).
const PRECO = Object.freeze({
  serie: "WTI",
  pregoesNoHistorico: 10,
  rotulo: "WTI",
  unidadeHistorico: "US$/barril",
  descricaoFaixas: "WTI à vista",
  avisos: Object.freeze(["Aviso: a EIA publica os preços diários uma vez por semana; o último preço pode não refletir fatos posteriores a ele."]),
  emReais: false
});

// A curva futura do WTI: sem fonte (o futuro é pago e a EIA deixou de publicar a NYMEX em 2024-04, ADR 0040). Quando
// houver, `fonte` diz qual é e o serviço passa a lê-la; até lá, o prompt diz SEM DADO e a resposta registra a lacuna.
// `aplica: false` num ativo em que a curva não entra no prompt (o ouro, ADR 0054).
const CURVA = Object.freeze({
  aplica: true,
  fonte: null,
  semDado: "SEM DADO: não há fonte da curva futura do WTI na base (o futuro é pago; a EIA deixou de publicar os vencimentos da NYMEX em 2024).",
  lacuna: "Curva futura do WTI sem fonte na base"
});

// O texto fixo do prompt (ai/prompts/), o coletor que o envia à IA uma vez por dia (ADR 0052) e o nome desta
// configuração (vai com a versão em cada prompt).
const NOME = "analise-diaria-petroleo";
const ARQUIVO_PROMPT = "petroleo-analise-diaria.md";
const COLETOR = "petroleo-analise-ia-diario";

// A faixa de uma variação realizada (%), para comparar depois com a faixa da leitura (analise-diaria-base.js).
const classificarVariacao = criarClassificador(FAIXAS);

module.exports = {
  VERSAO,
  NOME,
  ARQUIVO_PROMPT,
  COLETOR,
  HORIZONTES,
  FAIXAS,
  CODIGOS_FAIXA,
  TENDENCIA_DA_FAIXA,
  REFERENCIA_HORIZONTES,
  PRECO,
  CURVA,
  classificarVariacao
};
