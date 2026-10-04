"use strict";

const { CODIGOS_FAIXA, TENDENCIA_DA_FAIXA, criarClassificador } = require("./analise-diaria-base");

// Configuração do prompt diário de análise do milho (ADR 0058), no molde da do ouro (analise-diaria-ouro.js, ADR 0054):
// o que a metodologia define e o prompt só MOSTRA. Nada daqui é escrito à mão no texto do prompt
// (ai/prompts/milho-analise-diaria.md). Mudar um valor = versão nova desta configuração (VERSAO), gravada com cada leitura.

// v1 (2026-10-04): a primeira, com a aprovação do Motor do Milho v0 pelo Comitê.
const VERSAO = 1;

// Os mesmos quatro horizontes do petróleo e do ouro, que são também os do prompt do David (Motor do Milho v0, §6).
const HORIZONTES = Object.freeze([
  { codigo: "IMEDIATO", rotulo: "Imediato", dias: 1, variacao: "d1" },
  { codigo: "CURTO", rotulo: "Curto", dias: 7, variacao: "d7" },
  { codigo: "MEDIO", rotulo: "Médio", dias: 30, variacao: "d30" },
  { codigo: "LONGO", rotulo: "Longo", dias: 90, variacao: "d90" }
]);

// As faixas de variação do milho, em %, por horizonte. PROVISÓRIAS (2026-10-04), pelo critério do petróleo e do ouro: T1
// e T2 são os percentis 40 e 80 da variação absoluta do Indicador CEPEA/ESALQ (R$/saca, Campinas) de 2018-06-08 a
// 2026-09-25 (2.062 pregões, banco de dev), arredondados, com a regra de variação do Centro de Decisão: |1 dia| 0,30 /
// 0,92%; |7 dias| 1,04 / 2,99%; |30 dias| 3,21 / 9,17%; |90 dias| 6,08 / 19,15%. O ESALQ, e não o CCM, como a LBMA no
// ouro: o CCM só tem histórico desde 2022, com um buraco em 2023, e liquida contra o ESALQ. Nos futuros do CCM (todos os
// vencimentos, 2022 a 2026) as faixas saem mais estreitas nos prazos longos (30 dias: 1,94 / 5,07%; 90 dias: 2,82 /
// 7,65%), porque o período é mais calmo e os vencimentos distantes variam menos. O prompt do David (§6) classifica a
// variação em 1, 3, 5, 7 e 10%, iguais para todos os horizontes: fica como alternativa para o Comitê. A metodologia ajusta.
const FAIXAS = Object.freeze({
  IMEDIATO: { t1: 0.3, t2: 1 },
  CURTO: { t1: 1, t2: 3 },
  MEDIO: { t1: 3, t2: 9 },
  LONGO: { t1: 6, t2: 19 }
});

// Da data da análise, como no petróleo e no ouro.
const REFERENCIA_HORIZONTES = "DATA_DA_ANALISE";

// O preço de referência (aprovação do Comitê, 2026-10-04, ADR 0058): o futuro CCM da B3, o vencimento mais próximo
// negociado (centro-decisao.service.js::lerFuturo), sem emendar contratos. O Indicador ESALQ fica como contexto (é o
// preço interno dos fatores F4 e F6). Já em reais: sem a conversão pela PTAX.
const PRECO = Object.freeze({
  serie: "CCM",
  moeda: "R$",
  pregoesNoHistorico: 10,
  rotulo: "milho (CCM)",
  unidadeHistorico: "R$/saca",
  descricaoFaixas: "milho no futuro CCM da B3 (o vencimento mais próximo negociado)",
  avisos: Object.freeze([
    "Aviso: o CCM é o futuro de milho da B3 (R$ por saca de 60 kg), liquidado pelo Indicador CEPEA/ESALQ (Campinas); perto do vencimento ele converge para o indicador.",
    "Aviso: cada vencimento é uma série própria e nada é emendado: as variações usam só o histórico do contrato atual. Um contrato com pouco histórico, ou que não negociou na data de comparação, deixa a variação SEM DADO."
  ]),
  emReais: false
});

// Sem curva nesta versão: quais vencimentos do CCM servem a cada horizonte, com a liquidez mínima, é pergunta do ativo
// ao Comitê (metodologia-milho.js, "Vencimentos do CCM"). A falta da curva não é lacuna.
const CURVA = Object.freeze({ aplica: false, fonte: null, semDado: null, lacuna: null });

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
