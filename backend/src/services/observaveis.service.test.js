"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const observaveisService = require("./observaveis.service");

function isoHaDias(dias) {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

const registroFake = (dataReferencia) => ({
  instrument_code: "USD_BRL",
  source_code: "BCB_SGS_1",
  modality: "venda",
  reference_date: dataReferencia,
  value: "5.10",
  unit: "BRL",
  updated_at: new Date().toISOString()
});

test("listarObservaveis marca situação EM_DIA quando a última observação é recente", async () => {
  const deps = { marketQuoteRepository: { buscarMaisRecente: async () => registroFake(isoHaDias(1)) } };

  const { observaveis } = await observaveisService.listarObservaveis(deps);

  assert.equal(observaveis.length, 1);
  assert.equal(observaveis[0].codigo, "USD_BRL");
  assert.equal(observaveis[0].situacao, "EM_DIA");
  assert.equal(observaveis[0].valor, 5.1);
});

test("listarObservaveis marca situação ATRASADA quando a última observação é antiga", async () => {
  const deps = { marketQuoteRepository: { buscarMaisRecente: async () => registroFake(isoHaDias(30)) } };

  const { observaveis } = await observaveisService.listarObservaveis(deps);

  assert.equal(observaveis[0].situacao, "ATRASADA");
});

test("listarObservaveis marca situação SEM_COLETA quando nunca coletou", async () => {
  const deps = { marketQuoteRepository: { buscarMaisRecente: async () => null } };

  const { observaveis } = await observaveisService.listarObservaveis(deps);

  assert.equal(observaveis[0].situacao, "SEM_COLETA");
  assert.equal(observaveis[0].valor, null);
});

test("obterDetalheObservavel lança NotFoundError para código fora do catálogo", async () => {
  await assert.rejects(() => observaveisService.obterDetalheObservavel("EUR_BRL", {}), /não encontrado/);
});

test("obterDetalheObservavel retorna cotação, cobertura e última coleta", async () => {
  const deps = {
    marketQuoteRepository: {
      buscarMaisRecente: async () => registroFake(isoHaDias(1)),
      buscarEstatisticas: async () => ({ primeiraData: "2026-07-16", ultimaData: isoHaDias(1), totalObservacoes: 41 })
    },
    collectionExecutionRepository: {
      buscarUltimaPorColetor: async () => ({ status: "success", started_at: new Date(), finished_at: new Date() })
    }
  };

  const { observavel } = await observaveisService.obterDetalheObservavel("USD_BRL", deps);

  assert.equal(observavel.codigo, "USD_BRL");
  assert.equal(observavel.totalObservacoes, 41);
  assert.equal(observavel.cobertura.primeiraData, "2026-07-16");
  assert.equal(observavel.ultimaColeta.status, "success");
  assert.equal(observavel.situacao, "EM_DIA");
  assert.ok(observavel.fonteDetalhe.descricao);
  assert.ok(observavel.fonteDetalhe.urlOficial.startsWith("https://api.bcb.gov.br/"));
});
