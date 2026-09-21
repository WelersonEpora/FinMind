"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { exportarHistoricoCsv, LIMITE_LINHAS_EXPORTACAO } = require("./observaveis-exportacao.service");

const registroMarketQuote = (dataReferencia, valor) => ({
  instrumento: "USD_BRL",
  valor,
  unidade: "BRL",
  modalidade: "venda",
  dataReferencia,
  fonte: "Banco Central do Brasil - SGS (série 1, câmbio livre venda)",
  atualizadoEm: new Date("2026-07-16T13:45:10Z")
});

test("exportarHistoricoCsv percorre todas as páginas, em ordem crescente, e gera o CSV", async () => {
  const chamadas = [];
  const paginas = {
    1: { historico: [registroMarketQuote("2026-07-14", 5.1), registroMarketQuote("2026-07-15", 5.25)], paginacao: { total: 3, totalPaginas: 2 } },
    2: { historico: [registroMarketQuote("2026-07-16", 5.3)], paginacao: { total: 3, totalPaginas: 2 } }
  };
  const obterHistorico = async (codigo, filtros) => {
    chamadas.push({ codigo, ...filtros });
    return paginas[filtros.pagina];
  };

  const { nomeArquivo, conteudo, totalLinhas } = await exportarHistoricoCsv("USD_BRL", { modality: "venda" }, { obterHistorico });

  assert.equal(chamadas.length, 2);
  assert.deepEqual(chamadas.map((c) => c.pagina), [1, 2]);
  assert.ok(chamadas.every((c) => c.ordenarPor === "referenceDate" && c.ordem === "ASC" && c.modality === "venda"));
  assert.match(nomeArquivo, /^USD_BRL_\d{4}-\d{2}-\d{2}\.csv$/);
  assert.equal(totalLinhas, 3);

  const linhas = conteudo.replace(/^﻿/, "").trimEnd().split("\r\n");
  assert.equal(linhas[0], "Data de referência;Valor;Unidade;Modalidade;Fonte;Coletado em (UTC)");
  assert.equal(linhas.length, 4);
  // vírgula decimal, valor sem arredondar, sem colunas de publicação (market_quote)
  assert.equal(linhas[2], "2026-07-15;5,25;BRL;venda;Banco Central do Brasil - SGS (série 1, câmbio livre venda);2026-07-16 13:45:10");
});

test("exportarHistoricoCsv inclui as colunas de publicação para observáveis point-in-time", async () => {
  const obterHistorico = async () => ({
    historico: [
      {
        valor: 2350.5,
        unidade: "USD/oz",
        modalidade: "usd",
        dataReferencia: "2026-07-15",
        fonte: "LBMA",
        atualizadoEm: new Date("2026-07-16T10:00:00Z"),
        publicadoEm: new Date("2026-07-15T15:00:00Z"),
        publicadoEmEstimado: true
      }
    ],
    paginacao: { total: 1, totalPaginas: 1 }
  });
  const { conteudo } = await exportarHistoricoCsv("OURO_LBMA", {}, { obterHistorico });
  const [cabecalho, linha] = conteudo.replace(/^﻿/, "").trimEnd().split("\r\n");

  assert.match(cabecalho, /Disponível desde \(UTC\);Publicação estimada;Coletado em \(UTC\)$/);
  assert.match(linha, /2026-07-15 15:00:00;sim;2026-07-16 10:00:00$/);
});

test("exportarHistoricoCsv lança NotFoundError para código fora do catálogo", async () => {
  await assert.rejects(() => exportarHistoricoCsv("EUR_BRL", {}, { obterHistorico: async () => ({}) }), /não encontrado/);
});

test("exportarHistoricoCsv recusa seleção acima do limite sem buscar as demais páginas", async () => {
  let chamadas = 0;
  const obterHistorico = async () => {
    chamadas += 1;
    return { historico: [], paginacao: { total: LIMITE_LINHAS_EXPORTACAO + 1, totalPaginas: 9999 } };
  };

  await assert.rejects(() => exportarHistoricoCsv("USD_BRL", {}, { obterHistorico }), /limite de exportação/);
  assert.equal(chamadas, 1);
});

test("exportarHistoricoCsv de card com seletor inclui a coluna Métrica (e o nome do arquivo a traz)", async () => {
  const registro = { valor: 17021, unidade: "milhões de bushels", modalidade: "valor", dataReferencia: "2025-09-01", fonte: "USDA - WASDE", atualizadoEm: new Date("2026-09-21T10:00:00Z"), publicadoEm: new Date("2026-09-12T23:59:59Z"), publicadoEmEstimado: false };
  const obterHistorico = async () => ({ historico: [registro], paginacao: { total: 1, totalPaginas: 1 } });

  const producao = await exportarHistoricoCsv("WASDE_MILHO_EUA", { campo: "PRODUCTION" }, { obterHistorico });
  const padrao = await exportarHistoricoCsv("WASDE_MILHO_EUA", {}, { obterHistorico });
  const [cabecalho, linha] = producao.conteudo.replace(/^\uFEFF/, "").trimEnd().split("\r\n");

  assert.match(cabecalho, /^Data de referência;Valor;Unidade;Métrica;Modalidade;/);
  assert.match(linha, /^2025-09-01;17021;milhões de bushels;Produção;valor;/);
  assert.match(padrao.conteudo, /;Estoque final;/, "sem campo pedido, a métrica é a principal");
  assert.match(producao.nomeArquivo, /^WASDE_MILHO_EUA_PRODUCTION_\d{4}-\d{2}-\d{2}\.csv$/);
});
