"use strict";

const { CODIGOS_FAIXA, TENDENCIA_DA_FAIXA, criarClassificador } = require("./analise-diaria-base");

// Configuração do prompt diário de análise do milho (ADR 0058), no molde da do ouro (analise-diaria-ouro.js, ADR 0054):
// o que a metodologia define e o prompt só MOSTRA. Nada daqui é escrito à mão no texto do prompt
// (ai/prompts/milho-analise-diaria.md). Mudar um valor = versão nova desta configuração (VERSAO), gravada com cada leitura.

// v1 (2026-10-04): a primeira, com a aprovação do Motor do Milho v0 pelo Comitê.
// v2 (2026-10-05): as faixas recalibradas no próprio CCM, o preço que a leitura mede (decisão do usuário, ADR 0058, adendo).
// v3 (2026-10-05): cada horizonte com o vencimento do CCM que ainda vale depois da data-alvo, e a curva no prompt (ADR 0078).
// v4 (2026-10-07): os horizontes contam do último preço que a IA recebeu, e o IMEDIATO é o próximo pregão depois
// dele (DATA_DO_PRECO_RECEBIDO, ADR 0106); com o preço defasado, da data da análise. Faixas e horizontes não mudam.
const VERSAO = 4;

// Os mesmos quatro horizontes do petróleo e do ouro, que são também os do prompt do David (Motor do Milho v0, §6).
const HORIZONTES = Object.freeze([
  { codigo: "IMEDIATO", rotulo: "Imediato", dias: 1, variacao: "d1" },
  { codigo: "CURTO", rotulo: "Curto", dias: 7, variacao: "d7" },
  { codigo: "MEDIO", rotulo: "Médio", dias: 30, variacao: "d30" },
  { codigo: "LONGO", rotulo: "Longo", dias: 90, variacao: "d90" }
]);

// As faixas de variação do milho, em %, por horizonte. PROVISÓRIAS. v2 (2026-10-05): T1 e T2 são os percentis 40 e 80 da
// variação absoluta do próprio CCM, o preço que a leitura mede e a Qualidade da IA avalia (ADR 0064): todos os
// vencimentos, cada um sem emendar, de 2022-03-21 a 2026-10-02 (banco de dev), arredondados, com a regra de variação do
// Centro de Decisão: |1 dia| 0,31 / 1,03%; |7 dias| 0,81 / 2,44%; |30 dias| 1,94 / 5,07%; |90 dias| 2,82 / 7,65%. As da
// v1 saíam do ESALQ e eram largas demais para o CCM (90 dias: 6 / 19%, contra 2,82 / 7,65% no próprio CCM). Ressalva: o
// CCM tem histórico curto (desde 2022, com um buraco em 2023) e calmo; se a volatilidade voltar, as faixas ficam
// apertadas. O prompt do David (§6) classifica a variação em 1, 3, 5, 7 e 10%, iguais para todos os horizontes: segue como
// alternativa para o Comitê.
//
// v1 (2026-10-04), para registro: os percentis 40 e 80 do Indicador CEPEA/ESALQ (2018-06-08 a 2026-09-25), arredondados:
// 0,3 / 1%; 1 / 3%; 3 / 9%; 6 / 19%. As leituras da v1 continuam medidas por essa régua, gravada com elas (ADR 0064).
const FAIXAS = Object.freeze({
  IMEDIATO: { t1: 0.3, t2: 1 },
  CURTO: { t1: 0.8, t2: 2.5 },
  MEDIO: { t1: 2, t2: 5 },
  LONGO: { t1: 3, t2: 8 }
});

// Da data da análise, como no petróleo e no ouro.
// De onde os horizontes contam (analise-diaria-base.js::REFERENCIA_HORIZONTES; ADR 0106).
const REFERENCIA_HORIZONTES = "DATA_DO_PRECO_RECEBIDO";

// O preço de referência (aprovação do Comitê, 2026-10-04, ADR 0058): o futuro CCM da B3, o vencimento mais próximo
// negociado (centro-decisao.service.js::lerFuturo), sem emendar contratos. O Indicador ESALQ fica como contexto (é o
// preço interno dos fatores F4 e F6). Já em reais: sem a conversão pela PTAX.
const PRECO = Object.freeze({
  serie: "CCM",
  moeda: "R$",
  pregoesNoHistorico: 10,
  rotulo: "milho (CCM)",
  unidadeHistorico: "R$/saca",
  descricaoFaixas: "milho no futuro CCM da B3, no vencimento de cada horizonte (a linha \"Contrato\" de cada um)",
  avisos: Object.freeze([
    "Aviso: o CCM é o futuro de milho da B3 (R$ por saca de 60 kg), liquidado pelo Indicador CEPEA/ESALQ (Campinas); perto do vencimento ele converge para o indicador.",
    "Aviso: cada vencimento é uma série própria e nada é emendado: as variações usam só o histórico do contrato atual. Um contrato com pouco histórico, ou que não negociou na data de comparação, deixa a variação SEM DADO."
  ]),
  emReais: false
});

// A curva do CCM e o vencimento de cada horizonte (decisão do usuário, 2026-10-05, ADR 0078): cada horizonte usa o
// vencimento mais próximo que ainda vale depois da data-alvo (centro-decisao.service.js::lerFuturo, `vencimentoApos`), e a
// leitura e a avaliação dele usam esse contrato; a curva inteira (ajuste e contratos negociados de cada vencimento) vai
// ao bloco 2.2. Com o mais próximo para todos, o horizonte de 90 dias nunca era avaliável (o contrato vencia antes).
// Abaixo de `liquidezMinima` contratos negociados no dia, o contrato é o mesmo, com aviso (número do FinMind).
const CURVA = Object.freeze({
  aplica: true,
  porHorizonte: true,
  fonte: "B3 (ajuste e contratos negociados de cada vencimento do CCM)",
  liquidezMinima: 100,
  semDado: "SEM DADO: nenhum vencimento do CCM negociou até a data.",
  lacuna: "Curva do CCM sem dado na data"
});

const NOME = "analise-diaria-milho";
const ARQUIVO_PROMPT = "milho-analise-diaria.md";
const COLETOR = "milho-analise-ia-diario";

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
