"use strict";

const { CODIGOS_FAIXA, TENDENCIA_DA_FAIXA, criarClassificador } = require("./analise-diaria-base");

// Configuração do prompt diário de análise do ouro (ADR 0054), no molde da do petróleo (analise-diaria-petroleo.js,
// ADR 0051): o que a metodologia define e o prompt só MOSTRA. Nada daqui é escrito à mão no texto do prompt
// (ai/prompts/ouro-analise-diaria.md). Mudar um valor = versão nova desta configuração (VERSAO), gravada com cada leitura.

// v1 (2026-10-04): a primeira, já com os horizontes contados da data da análise (como a v2 do petróleo).
// v2 (2026-10-07): os horizontes contam do último preço que a IA recebeu, e o IMEDIATO é o próximo pregão depois
// dele (DATA_DO_PRECO_RECEBIDO, ADR 0106); com o preço defasado, da data da análise. Faixas e horizontes não mudam.
const VERSAO = 2;

// Os mesmos quatro horizontes do petróleo, cada um analisado separadamente.
const HORIZONTES = Object.freeze([
  { codigo: "IMEDIATO", rotulo: "Imediato", dias: 1, variacao: "d1" },
  { codigo: "CURTO", rotulo: "Curto", dias: 7, variacao: "d7" },
  { codigo: "MEDIO", rotulo: "Médio", dias: 30, variacao: "d30" },
  { codigo: "LONGO", rotulo: "Longo", dias: 90, variacao: "d90" }
]);

// As faixas de variação do ouro, em %, por horizonte. PROVISÓRIAS (2026-10-04), pelo critério do petróleo: T1 e T2 são
// os percentis 40 e 80 da variação absoluta do ouro da LBMA (PM, em US$) de 2010 a 2026-09-28 (4.196 pregões, banco de
// dev), arredondados, com a regra de variação do Centro de Decisão: |1 dia| 0,40 / 1,15%; |7 dias| 1,04 / 2,68%;
// |30 dias| 2,18 / 5,81%; |90 dias| 4,25 / 10,04%. A LBMA, e não o GLD, porque o GLD só existe desde 2025-07 (ADR 0044)
// e liquida pelo próprio LBMA: as variações das duas séries andam juntas. O ouro varia menos que o petróleo (cerca de
// metade), por isso as faixas são mais estreitas. A metodologia ajusta.
const FAIXAS = Object.freeze({
  IMEDIATO: { t1: 0.4, t2: 1.2 },
  CURTO: { t1: 1, t2: 2.5 },
  MEDIO: { t1: 2, t2: 6 },
  LONGO: { t1: 4, t2: 10 }
});

// Da data da análise, como no petróleo desde o adendo do ADR 0052.
// De onde os horizontes contam (analise-diaria-base.js::REFERENCIA_HORIZONTES; ADR 0106).
const REFERENCIA_HORIZONTES = "DATA_DO_PRECO_RECEBIDO";

// O preço de referência (decisão do David, 2026-10-03, ADR 0054): o futuro GLD da B3, o vencimento mais próximo
// negociado (centro-decisao.service.js::lerFuturo), sem emendar contratos; a LBMA, que fechou o feed em 2026-09-30, fica
// só como histórico (validação dos fatores). O preço também em reais, pela PTAX de venda do mesmo dia, como referência.
const PRECO = Object.freeze({
  serie: "GLD",
  pregoesNoHistorico: 10,
  rotulo: "ouro (GLD)",
  unidadeHistorico: "US$/onça",
  descricaoFaixas: "ouro no futuro GLD da B3 (o vencimento mais próximo negociado)",
  avisos: Object.freeze([
    "Aviso: o GLD é o futuro de ouro em dólar da B3 (US$ por onça troy), liquidado pelo LBMA Gold Price; fica em média ~0,8% acima do preço à vista (custo de carregamento).",
    "Aviso: cada vencimento é uma série própria e nada é emendado: as variações usam só o histórico do contrato atual. Um contrato com pouco histórico, ou que não negociou na data de comparação, deixa a variação SEM DADO."
  ]),
  emReais: true
});

// Sem curva no ouro: o futuro do ouro é o preço à vista mais os juros e não traz expectativa de mercado
// (STATUS_DO_PROJETO.md, §5; ADR 0054). O prompt do ouro não tem o bloco da curva e a falta dela não é lacuna.
const CURVA = Object.freeze({ aplica: false, fonte: null, semDado: null, lacuna: null });

const NOME = "analise-diaria-ouro";
const ARQUIVO_PROMPT = "ouro-analise-diaria.md";
const COLETOR = "ouro-analise-ia-diario";

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
