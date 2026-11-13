"use strict";

// Importação ÚNICA das chaves do Gemini do .env para o banco (ADR 0156): desde então, as chaves são cadastradas pelo
// admin na tela Configuração e o .env não é mais lido para elas. Copia GEMINI_API_KEY_FREE (gratuita) e GEMINI_API_KEY
// (paga), cifradas, só para o tipo que ainda não tem chave no banco: nunca sobrescreve uma cadastrada na tela.
// Depois de importar, as duas variáveis podem sair do .env.
//
// Uso: npm run importar:chaves-gemini   (precisa de CONFIG_ENCRYPTION_KEY no .env). Reexecutar é seguro.

require("../src/config/env"); // carrega o .env
const { sequelize } = require("../src/models");
const configuracaoIaService = require("../src/services/configuracao-ia.service");

const ORIGEM = { gratuita: "GEMINI_API_KEY_FREE", paga: "GEMINI_API_KEY" };

async function main() {
  const { chaves } = await configuracaoIaService.obterSituacao();
  for (const [tipo, variavel] of Object.entries(ORIGEM)) {
    const valor = (process.env[variavel] || "").trim();
    if (chaves[tipo].configurada) {
      console.log(`${tipo}: já cadastrada no banco (final ${chaves[tipo].final}); nada importado.`);
    } else if (!valor) {
      console.log(`${tipo}: ${variavel} vazia no .env; nada importado.`);
    } else {
      await configuracaoIaService.salvarChave(tipo, valor, null, { testar: false });
      console.log(`${tipo}: importada de ${variavel} (final ${valor.slice(-4)}).`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
