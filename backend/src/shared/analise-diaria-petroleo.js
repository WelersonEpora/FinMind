"use strict";

const { CODIGOS_FAIXA, TENDENCIA_DA_FAIXA, criarClassificador } = require("./analise-diaria-base");

// Configuração do prompt diário de análise do petróleo (ADR 0051): o que a metodologia define e o prompt só MOSTRA.
// Nada daqui é escrito à mão no texto do prompt (ai/prompts/petroleo-analise-diaria.md): o serviço monta as tabelas
// a partir destes valores. Mudar um valor = versão nova desta configuração (VERSAO), registrada em cada prompt gerado.
//
// Parâmetros do PROMPT (horizontes, faixas, preço de referência, histórico) e de VALIDAÇÃO (referência dos horizontes,
// classificação do realizado). Os parâmetros dos FATORES ficam em cada fator e na tabela fator_parametro (ADR 0050).

// v1 (2026-10-03): horizontes contados da data do último preço. v2 (2026-10-03): da data da análise (REFERENCIA_HORIZONTES).
// v3 (2026-10-04): o preço de referência passa do WTI ao Brent, o instrumento que o Comitê opera (decisão do David,
// ADR 0052, adendo), com as faixas recalibradas no Brent.
// v4 (2026-10-07): o preço passa do Brent à vista (EIA, o físico, publicado uma vez por semana) ao Brent FUTURO (NYMEX BZ,
// pelo Yahoo, ADR 0096), o instrumento operado; cada horizonte no vencimento que ainda vale depois da data-alvo, a curva no
// prompt e as faixas recalibradas no futuro (decisão do usuário, ADR 0052, adendo de 2026-10-07).
const VERSAO = 4;

// Os quatro horizontes, cada um analisado separadamente (decisão do usuário, 2026-10-03). `variacao`: a janela do
// Centro de Decisão com o mesmo prazo (centro-decisao.service.js::VARIACOES), a que o bloco de preço mostra.
const HORIZONTES = Object.freeze([
  { codigo: "IMEDIATO", rotulo: "Imediato", dias: 1, variacao: "d1" },
  { codigo: "CURTO", rotulo: "Curto", dias: 7, variacao: "d7" },
  { codigo: "MEDIO", rotulo: "Médio", dias: 30, variacao: "d30" },
  { codigo: "LONGO", rotulo: "Longo", dias: 90, variacao: "d90" }
]);

// As faixas de variação do Brent, em %, por horizonte. PROVISÓRIAS. v4 (2026-10-07): T1 e T2 são os percentis 40 e 80 da
// variação absoluta do Brent FUTURO, o preço que a leitura mede: o 1º vencimento contínuo do Yahoo (BZ=F) de 2010 a
// 2026-10-06 (banco de dev), SEM o retorno do 1º pregão de cada mês (o dia em que a série troca de contrato: mediana de
// 1,5% de salto, 90% abaixo de 4,8%), arredondados, com a regra de variação do Centro de Decisão: |1 dia| 0,75 / 2,30%;
// |7 dias| 1,81 / 5,12%; |30 dias| 4,07 / 10,89%; |90 dias| 6,15 / 19,23%. Com o salto da rolagem: 0,82 / 2,42; 1,88 /
// 5,39; 4,56 / 11,16; 6,87 / 20,16. O mesmo cálculo no Brent à vista reproduz as faixas da v3.
// Assim, ~40% dos casos históricos caem em LATERAL e ~20% em FORTE, nos quatro horizontes. O mesmo critério dos
// limiares dos fatores (percentis ~40 e ~80); a metodologia ajusta.
//
// v3 (2026-10-04), para registro: os percentis do Brent à vista de 2010 a 2026-09-29: 1 / 2,5%; 2 / 6%; 5 / 12%; 7 / 21%.
// As leituras da v3 continuam medidas por essa régua, gravada com elas (ADR 0064).
const FAIXAS = Object.freeze({
  IMEDIATO: { t1: 0.8, t2: 2.3 },
  CURTO: { t1: 1.8, t2: 5 },
  MEDIO: { t1: 4, t2: 11 },
  LONGO: { t1: 6, t2: 19 }
});

// De onde os horizontes são contados (ADR 0052, adendo de 2026-10-03): da DATA DA ANÁLISE. A v1 contava da data do
// último preço na BASE, mas a EIA publica os preços diários uma vez por semana e a leitura já usa eventos
// posteriores a esse preço: o horizonte de 1 dia caía num dia que já tinha passado, com notícias de depois dele. Agora
// a IA lê para frente a partir do dia da leitura e sabe que o preço entre o último pregão da BASE e esse dia é
// desconhecido. Para comparar com o realizado, a base é o preço do último pregão até a data da análise (conhecido
// depois) e o fim é o do último pregão até a data da análise + os dias do horizonte.
// As leituras gravadas com a v1 continuam com "DATA_DO_ULTIMO_PRECO" na entrada, e a tela respeita o que foi gravado.
const REFERENCIA_HORIZONTES = "DATA_DA_ANALISE";

// O preço de referência: o Brent FUTURO (NYMEX BZ, pelo Yahoo, ADR 0096), o vencimento mais próximo negociado (v4; na
// v3, o Brent à vista da EIA; até a v2, o WTI). A série do Centro de Decisão (centro-decisao.service.js::ATIVOS), quantos
// pregões o histórico do bloco de preço lista e os textos do bloco que dependem do ativo (o nome curto, a unidade da
// lista de pregões, o que a tabela 2.4 mede e os avisos da fonte). `emReais`: uma linha com o preço convertido pela
// PTAX (só no ouro).
const PRECO = Object.freeze({
  serie: "BRENT_FUTURO",
  pregoesNoHistorico: 10,
  rotulo: "Brent",
  unidadeHistorico: "US$/barril",
  descricaoFaixas: "Brent futuro, no vencimento de cada horizonte (a linha \"Contrato\" de cada um)",
  avisos: Object.freeze([
    "Aviso: o preço é o ajuste do Brent futuro da NYMEX (BZ), liquidado pelo ICE Brent, de fonte não oficial (Yahoo Finance). O Brent à vista (físico, publicado pela EIA uma vez por semana) não está neste bloco: em mercado apertado, ele fica acima do futuro.",
    "Aviso: cada vencimento é uma série própria e nada é emendado: as variações usam só o histórico do contrato atual. O Brent vence no último dia útil do 2º mês anterior ao do contrato (o de dezembro, no fim de outubro)."
  ]),
  emReais: false
});

// A curva do Brent e o vencimento de cada horizonte (v4, como no milho e no café, ADR 0078): cada horizonte usa o
// vencimento mais próximo que ainda vale depois da data-alvo (centro-decisao.service.js::lerFuturo, `vencimentoApos`), e a
// leitura e a avaliação dele usam esse contrato; a curva inteira (o ajuste de cada vencimento) vai ao bloco 2.2. Sem
// liquidez mínima (`liquidezMinima: null`): o volume do Yahoo não é gravado (ADR 0096), e os primeiros vencimentos do
// Brent são dos contratos mais negociados do mundo.
// `aplica: false` num ativo em que a curva não entra no prompt (o ouro, ADR 0054).
const CURVA = Object.freeze({
  aplica: true,
  porHorizonte: true,
  fonte: "Yahoo Finance, não oficial (ajuste de cada vencimento do Brent futuro da NYMEX, BZ)",
  liquidezMinima: null,
  semDado: "SEM DADO: nenhum vencimento do Brent futuro com ajuste até a data.",
  lacuna: "Curva do Brent futuro sem dado na data"
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
