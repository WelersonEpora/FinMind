"use strict";

const { NotFoundError } = require("./errors");

// Os ativos com leitura diária de tendência da IA aprovada (petróleo, ADR 0052; ouro, ADR 0054; milho, ADR 0058; café,
// ADR 0062; soja, ADR 0116) e a configuração de cada um. Um ativo novo é uma configuração `analise-diaria-<ativo>.js`, um prompt em
// ai/prompts/ e uma linha aqui, depois da aprovação dele registrada num ADR (CLAUDE.md, restrições permanentes).
const CONFIGURACOES = Object.freeze({
  PETROLEO: require("./analise-diaria-petroleo"),
  OURO: require("./analise-diaria-ouro"),
  MILHO: require("./analise-diaria-milho"),
  CAFE: require("./analise-diaria-cafe"),
  SOJA: require("./analise-diaria-soja")
});

const ATIVOS_COM_ANALISE_DIARIA = Object.freeze(Object.keys(CONFIGURACOES));

// A configuração do ativo, ou 404 (ativo sem leitura diária).
function configuracaoDoAtivo(ativo) {
  const config = CONFIGURACOES[String(ativo || "").trim().toUpperCase()];
  if (!config) throw new NotFoundError("Não há prompt diário para este ativo.");
  return config;
}

module.exports = { CONFIGURACOES, ATIVOS_COM_ANALISE_DIARIA, configuracaoDoAtivo };
