"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const marketDataService = require("./market-data.service");

const registroFake = {
  instrument_code: "USD_BRL",
  source_code: "BCB_SGS_1",
  modality: "venda",
  reference_date: "2026-09-11",
  value: "5.0918",
  unit: "BRL",
  updated_at: "2026-09-12T10:00:00.000Z"
};

test("obterCotacaoAtual retorna cotacao=null e mensagem quando não há dado coletado", async () => {
  const deps = { marketQuoteRepository: { buscarMaisRecente: async () => null } };
  const resultado = await marketDataService.obterCotacaoAtual("USD_BRL", undefined, deps);

  assert.equal(resultado.cotacao, null);
  assert.match(resultado.mensagem, /Nenhuma cotação/);
});

test("obterCotacaoAtual mapeia o registro mais recente, marcando periodicidade diária e não tempo real", async () => {
  const deps = { marketQuoteRepository: { buscarMaisRecente: async () => registroFake } };
  const { cotacao } = await marketDataService.obterCotacaoAtual("USD_BRL", undefined, deps);

  assert.equal(cotacao.valor, 5.0918);
  assert.equal(cotacao.dataReferencia, "2026-09-11");
  assert.equal(cotacao.periodicidade, "diaria");
  assert.equal(cotacao.tempoReal, false);
});

test("obterHistorico rejeita dataInicio em formato inválido", async () => {
  const deps = { marketQuoteRepository: { buscarHistorico: async () => ({ registros: [], total: 0 }) } };

  await assert.rejects(() => marketDataService.obterHistorico("USD_BRL", { dataInicio: "11/09/2026" }, deps), /AAAA-MM-DD/);
});

test("obterHistorico rejeita dataInicio posterior a dataFim", async () => {
  const deps = { marketQuoteRepository: { buscarHistorico: async () => ({ registros: [], total: 0 }) } };

  await assert.rejects(
    () => marketDataService.obterHistorico("USD_BRL", { dataInicio: "2026-09-20", dataFim: "2026-09-01" }, deps),
    /não pode ser posterior/
  );
});

test("obterHistorico rejeita tamanhoPagina fora do intervalo permitido", async () => {
  const deps = { marketQuoteRepository: { buscarHistorico: async () => ({ registros: [], total: 0 }) } };

  await assert.rejects(() => marketDataService.obterHistorico("USD_BRL", { tamanhoPagina: 1000 }, deps), /tamanhoPagina/);
});

test("obterHistorico retorna histórico mapeado e paginação", async () => {
  const deps = {
    marketQuoteRepository: {
      buscarHistorico: async () => ({ registros: [registroFake], total: 1 })
    }
  };

  const resultado = await marketDataService.obterHistorico("USD_BRL", { pagina: 1, tamanhoPagina: 30 }, deps);

  assert.equal(resultado.historico.length, 1);
  assert.equal(resultado.historico[0].valor, 5.0918);
  assert.deepEqual(resultado.paginacao, { pagina: 1, tamanhoPagina: 30, total: 1, totalPaginas: 1 });
});

test("obterHistorico rejeita ordenarPor fora da lista permitida", async () => {
  const deps = { marketQuoteRepository: { buscarHistorico: async () => ({ registros: [], total: 0 }) } };

  await assert.rejects(() => marketDataService.obterHistorico("USD_BRL", { ordenarPor: "fonte" }, deps), /ordenarPor/);
});

test("obterHistorico repassa ordenarPor/ordem validados pro repository", async () => {
  let chamadaCom;
  const deps = {
    marketQuoteRepository: {
      buscarHistorico: async (args) => {
        chamadaCom = args;
        return { registros: [], total: 0 };
      }
    }
  };

  await marketDataService.obterHistorico("USD_BRL", { ordenarPor: "value", ordem: "asc" }, deps);

  assert.equal(chamadaCom.ordenarPor, "value");
  assert.equal(chamadaCom.ordem, "ASC");
});

test("obterHistorico repassa modality pro repository quando informado", async () => {
  let chamadaCom;
  const deps = {
    marketQuoteRepository: {
      buscarHistorico: async (args) => {
        chamadaCom = args;
        return { registros: [], total: 0 };
      }
    }
  };

  await marketDataService.obterHistorico("SELIC", { modality: "meta" }, deps);

  assert.equal(chamadaCom.modality, "meta");
});
