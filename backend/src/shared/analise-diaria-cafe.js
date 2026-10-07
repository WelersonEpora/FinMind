"use strict";

const { CODIGOS_FAIXA, TENDENCIA_DA_FAIXA, criarClassificador } = require("./analise-diaria-base");

// Configuração do prompt diário de análise do café (ADR 0062), no molde da do milho (analise-diaria-milho.js, ADR 0058):
// o que a metodologia define e o prompt só MOSTRA. Nada daqui é escrito à mão no texto do prompt
// (ai/prompts/cafe-analise-diaria.md). Mudar um valor = versão nova desta configuração (VERSAO), gravada com cada leitura.

// v1 (2026-10-05): a primeira, com a aprovação do Motor do Café v1 pelo Comitê.
// v2 (2026-10-05): a leitura agregada do motor (AGREGACAO, ADR 0066) vai ao prompt, no bloco 3B. Horizontes e faixas não
// mudam; a versão separa, na Qualidade da IA, as leituras com e sem a agregação.
// v3 (2026-10-05): cada horizonte com o vencimento do ICF que ainda vale depois da data-alvo, e a curva no prompt (ADR 0078).
// v4 (2026-10-07): a agregação em código sai do prompt e do Centro de Decisão (ADR 0066, adendo de 2026-10-07): no
// histórico do ICF, não supera os benchmarks. Fica na tela de metodologia, como no milho (ADR 0081).
// v5 (2026-10-07): os horizontes contam do último preço que a IA recebeu, e o IMEDIATO é o próximo pregão depois
// dele (DATA_DO_PRECO_RECEBIDO, ADR 0106); com o preço defasado, da data da análise. Faixas e horizontes não mudam.
const VERSAO = 5;

// Os mesmos quatro horizontes do petróleo, do ouro e do milho, em dias corridos contados da data da análise. O estudo do
// David conta em pregões (1, 7, 30 e 90): os dias corridos mantêm a régua dos outros ativos e a variação do Centro de
// Decisão (pergunta do ativo, metodologia-cafe.js).
const HORIZONTES = Object.freeze([
  { codigo: "IMEDIATO", rotulo: "Imediato", dias: 1, variacao: "d1" },
  { codigo: "CURTO", rotulo: "Curto", dias: 7, variacao: "d7" },
  { codigo: "MEDIO", rotulo: "Médio", dias: 30, variacao: "d30" },
  { codigo: "LONGO", rotulo: "Longo", dias: 90, variacao: "d90" }
]);

// As faixas de variação do café, em %, por horizonte. PROVISÓRIAS (2026-10-05), pelo critério dos outros ativos: T1 e
// T2 são os percentis 40 e 80 da variação absoluta do ICF da B3 (US$/saca) no vencimento mais próximo negociado de cada
// data, de 2022-03-21 a 2026-10-02 (948 pregões, banco de dev), arredondados, com a regra de variação do Centro de
// Decisão: |1 dia| 1,07 / 2,74%; |7 dias| 2,43 / 6,27%; |30 dias| 4,76 / 14,25%; |90 dias| 10,87 / 24,79%. Com todos os
// vencimentos, quase o mesmo (30 dias: 4,61 / 13,32%; 90 dias: 10,37 / 23,27%). O ICF, e não uma série longa, porque o
// café não tem preço diário longo na base: o do FMI é a média mensal (1992 em diante: 1 mês 3,23 / 8,29%; 3 meses 6,47 /
// 16,13%), mais suave por ser média. O período do ICF inclui a alta de 2024 e 2025, então as faixas são largas: o café
// varia cerca do dobro do milho. A metodologia ajusta.
const FAIXAS = Object.freeze({
  IMEDIATO: { t1: 1, t2: 2.7 },
  CURTO: { t1: 2.5, t2: 6 },
  MEDIO: { t1: 5, t2: 14 },
  LONGO: { t1: 11, t2: 25 }
});

// Da data da análise, como nos outros ativos.
// De onde os horizontes contam (analise-diaria-base.js::REFERENCIA_HORIZONTES; ADR 0106).
const REFERENCIA_HORIZONTES = "DATA_DO_PRECO_RECEBIDO";

// O preço de referência (aprovação do Comitê, 2026-10-05, ADR 0062): o futuro ICF da B3 (café arábica, US$/saca), o
// vencimento mais próximo negociado (centro-decisao.service.js::lerFuturo), sem emendar contratos. O KC da ICE (Nova
// York), que o estudo cita como referência, é pago: entra só pelo que os fatores trazem de lá (o COT e os estoques
// certificados). O preço também em reais, pela PTAX de venda do mesmo dia, como referência (como o GLD do ouro).
const PRECO = Object.freeze({
  serie: "ICF",
  moeda: "US$",
  pregoesNoHistorico: 10,
  rotulo: "café arábica (ICF)",
  unidadeHistorico: "US$/saca",
  unidadeEmReais: "por saca",
  descricaoFaixas: "café arábica no futuro ICF da B3, no vencimento de cada horizonte (a linha \"Contrato\" de cada um)",
  avisos: Object.freeze([
    "Aviso: o ICF é o futuro de café arábica da B3 (US$ por saca de 60 kg). O KC da ICE (Nova York, centavos de US$ por libra-peso) não está na BASE: o COT e os estoques certificados dos fatores são de Nova York.",
    "Aviso: cada vencimento é uma série própria e nada é emendado: as variações usam só o histórico do contrato atual. Um contrato com pouco histórico, ou que não negociou na data de comparação, deixa a variação SEM DADO."
  ]),
  emReais: true
});

// A curva do ICF e o vencimento de cada horizonte (decisão do usuário, 2026-10-05, ADR 0078), como no milho: cada
// horizonte usa o vencimento mais próximo que ainda vale depois da data-alvo, e a curva vai ao bloco 2.2. Com o mais
// próximo para todos, o contrato vencia antes da data-alvo em 78% dos dias no horizonte de 90 dias. O ICF é pouco
// líquido: o aviso de menos de 100 contratos no dia sai em cerca de um quarto dos dias.
const CURVA = Object.freeze({
  aplica: true,
  porHorizonte: true,
  fonte: "B3 (ajuste e contratos negociados de cada vencimento do ICF)",
  liquidezMinima: 100,
  semDado: "SEM DADO: nenhum vencimento do ICF negociou até a data.",
  lacuna: "Curva do ICF sem dado na data"
});

const NOME = "analise-diaria-cafe";
const ARQUIVO_PROMPT = "cafe-analise-diaria.md";
const COLETOR = "cafe-analise-ia-diario";

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
