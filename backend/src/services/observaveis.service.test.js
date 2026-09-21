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

// Os observáveis de `observation` também passam pela listagem: um fake que
// nunca abre o banco (nenhum teste daqui conecta).
const observationRepositoryVazio = { buscarMaisRecente: async () => null, resumirSeries: async () => [], listarVencimentos: async () => [] };

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
  const deps = { marketQuoteRepository: { buscarMaisRecente: async () => registroFake(isoHaDias(1)) }, observationRepository: observationRepositoryVazio };

  const { observaveis } = await observaveisService.listarObservaveis(deps);

  assert.equal(observaveis.length, 17, "USD_BRL e SELIC (market_quote) + 15 de observation (5 fixos + 2 do USDA + 2 do Comex Stat + 4 do WASDE + 2 cards do CCM)");
  assert.equal(observaveis[0].codigo, "USD_BRL");
  assert.equal(observaveis[0].situacao, "EM_DIA");
  assert.equal(observaveis[0].valor, 5.1);
});

test("listarObservaveis marca situação ATRASADA quando a última observação é antiga", async () => {
  const deps = { marketQuoteRepository: { buscarMaisRecente: async () => registroFake(isoHaDias(30)) }, observationRepository: observationRepositoryVazio };

  const { observaveis } = await observaveisService.listarObservaveis(deps);

  assert.equal(observaveis[0].situacao, "ATRASADA");
});

test("listarObservaveis marca situação SEM_COLETA quando nunca coletou", async () => {
  const deps = { marketQuoteRepository: { buscarMaisRecente: async () => null }, observationRepository: observationRepositoryVazio };

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

// --- observáveis point-in-time (origem: observation) ---

const linhaObservation = (seriesCode, observedAt, value, extra = {}) => ({
  series_code: seriesCode,
  observed_at: observedAt,
  value: String(value),
  unit: "x",
  published_at: new Date("2026-09-18T19:30:07Z"),
  published_at_is_estimated: 0,
  collected_at: new Date("2026-09-20T20:00:00Z"),
  ...extra
});

test("a listagem mostra os observáveis de observation, com casas decimais próprias e o valor da série principal", async () => {
  const consultadas = [];
  const deps = {
    marketQuoteRepository: { buscarMaisRecente: async () => null },
    observationRepository: {
      listarVencimentos: async () => [],
      buscarMaisRecente: async (seriesCode) => {
        consultadas.push(seriesCode);
        return linhaObservation(seriesCode, isoHaDias(1), 2.61);
      }
    }
  };

  const { observaveis } = await observaveisService.listarObservaveis(deps);
  const treasury = observaveis.find((o) => o.codigo === "TREASURY_10A");

  assert.equal(treasury.valor, 2.61);
  assert.equal(treasury.unidade, "% a.a.");
  assert.equal(treasury.casasDecimais, 2);
  assert.equal(treasury.situacao, "EM_DIA");
  assert.ok(consultadas.includes("FRED.DFII10"), "o card mostra o juro real (DFII10), não o nominal");
  assert.ok(!consultadas.includes("FRED.DGS10"));
  assert.equal(observaveis.find((o) => o.codigo === "COT_OURO").casasDecimais, 0);
  assert.equal(observaveis.find((o) => o.codigo === "USD_BRL").casasDecimais, 4, "os antigos mantêm 4 casas");
});

test("série semanal/divulgada em lote tolera mais dias que a diária antes de ficar ATRASADA", async () => {
  const deps = {
    marketQuoteRepository: { buscarMaisRecente: async () => null },
    observationRepository: { listarVencimentos: async () => [], buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, isoHaDias(8), 1) }
  };

  const { observaveis } = await observaveisService.listarObservaveis(deps);
  const situacao = (codigo) => observaveis.find((o) => o.codigo === codigo).situacao;

  assert.equal(situacao("OURO_LBMA"), "ATRASADA", "diária com 8 dias");
  assert.equal(situacao("COT_OURO"), "EM_DIA", "semanal com 8 dias");
  assert.equal(situacao("DOLAR_AMPLO_FED"), "EM_DIA", "divulgada em lote semanal");
});

test("FRED tolera o atraso de fim de semana: Treasury até 5 dias, índice do dólar até 12", async () => {
  const situacaoCom = async (dias) => {
    const deps = {
      marketQuoteRepository: { buscarMaisRecente: async () => null },
      observationRepository: { listarVencimentos: async () => [], buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, isoHaDias(dias), 1) }
    };
    const { observaveis } = await observaveisService.listarObservaveis(deps);
    return (codigo) => observaveis.find((o) => o.codigo === codigo).situacao;
  };

  // Segunda de manhã: Treasury com última data na quinta (~4,5 dias), dólar na sexta anterior (~10,5).
  assert.equal((await situacaoCom(4))("TREASURY_10A"), "EM_DIA");
  assert.equal((await situacaoCom(11))("DOLAR_AMPLO_FED"), "EM_DIA");
  assert.equal((await situacaoCom(6))("TREASURY_10A"), "ATRASADA");
  assert.equal((await situacaoCom(13))("DOLAR_AMPLO_FED"), "ATRASADA");
});

test("obterDetalheObservavel de um observável point-in-time agrega cobertura e informa quanto da publicação é estimada", async () => {
  const deps = {
    observationRepository: {
      buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, isoHaDias(2), 409899),
      resumirSeries: async () => [
        { series_code: "CFTC.GOLD.OPEN_INTEREST", total_versoes: "1058", total_observacoes: "1058", primeira_data: "2006-06-13", ultima_data: "2026-09-15", versoes_estimadas: "842" },
        { series_code: "CFTC.GOLD.MM_LONG", total_versoes: "1058", total_observacoes: "1058", primeira_data: "2006-06-13", ultima_data: "2026-09-15", versoes_estimadas: "842" }
      ]
    },
    collectionExecutionRepository: { buscarUltimaPorColetor: async (codigo) => ({ status: "success", codigo, started_at: new Date(), finished_at: new Date() }) }
  };

  const { observavel } = await observaveisService.obterDetalheObservavel("COT_OURO", deps);

  assert.equal(observavel.totalObservacoes, 2116);
  assert.deepEqual(observavel.cobertura, { primeiraData: "2006-06-13", ultimaData: "2026-09-15" });
  assert.deepEqual(observavel.publicacao, { totalVersoes: 2116, versoesEstimadas: 1684, percentualEstimado: 79.6 });
  assert.equal(observavel.cotacaoAtual.publicadoEmEstimado, false);
  assert.ok(observavel.fonteDetalhe.metodologia.includes("ESTIMADA"), "a tela precisa ser honesta sobre a data de publicação");
});

test("observáveis de market_quote não trazem bloco de publicação (não têm published_at)", async () => {
  const deps = {
    marketQuoteRepository: { buscarMaisRecente: async () => registroFake(isoHaDias(1)), buscarEstatisticas: async () => ({ primeiraData: "2026-07-16", ultimaData: isoHaDias(1), totalObservacoes: 41 }) },
    collectionExecutionRepository: { buscarUltimaPorColetor: async () => null }
  };

  const { observavel } = await observaveisService.obterDetalheObservavel("USD_BRL", deps);

  assert.equal(observavel.publicacao, null);
});

test("obterHistoricoObservavel despacha pela origem: observation lê do repository point-in-time, o resto de market_quote", async () => {
  let chamadaObservation = null;
  const deps = {
    observationRepository: {
      buscarHistoricoAtual: async (params) => {
        chamadaObservation = params;
        return { registros: [linhaObservation("FRED.DFII10", "2026-09-17", 2.61, { published_at_is_estimated: 1 })], total: 5932 };
      }
    },
    marketQuoteRepository: { buscarHistorico: async () => ({ registros: [], total: 0 }) }
  };

  const doTreasury = await observaveisService.obterHistoricoObservavel("TREASURY_10A", { modality: "real", tamanhoPagina: "20", pagina: "2", ordenarPor: "value", ordem: "asc" }, deps);

  assert.deepEqual(chamadaObservation.seriesCodes, ["FRED.DFII10"], "o filtro de modalidade escolhe a série");
  assert.equal(chamadaObservation.limite, 20);
  assert.equal(chamadaObservation.deslocamento, 20);
  assert.equal(chamadaObservation.ordenarPor, "value");
  assert.equal(chamadaObservation.ordem, "ASC");
  assert.equal(doTreasury.historico[0].modalidade, "real");
  assert.equal(doTreasury.historico[0].publicadoEmEstimado, true);
  assert.equal(doTreasury.paginacao.total, 5932);

  chamadaObservation = null;
  const doDolar = await observaveisService.obterHistoricoObservavel("USD_BRL", {}, deps);
  assert.equal(chamadaObservation, null, "USD_BRL nunca toca a camada point-in-time");
  assert.deepEqual(doDolar.historico, []);
});

test("obterHistoricoObservavel sem filtro de modalidade consulta todas as séries do grupo; modalidade inválida é rejeitada", async () => {
  let series = null;
  const deps = { observationRepository: { buscarHistoricoAtual: async (p) => { series = p.seriesCodes; return { registros: [], total: 0 }; } } };

  await observaveisService.obterHistoricoObservavel("TREASURY_10A", {}, deps);
  assert.deepEqual(series, ["FRED.DGS10", "FRED.DFII10", "FRED.T10YIE"]);

  await assert.rejects(() => observaveisService.obterHistoricoObservavel("TREASURY_10A", { modality: "inexistente" }, deps), /modality/);
  await assert.rejects(() => observaveisService.obterHistoricoObservavel("OURO_LBMA", { dataInicio: "2026-02-01", dataFim: "2026-01-01" }, deps), /posterior/);
});

// --- futuro de milho da B3 (CCM): dois cards por vencimento ---

// Entrada fora de ordem, de propósito. CCMU26 já venceu (último pregão em 09-15);
// os outros ainda negociaram no último pregão (09-18).
const vencimentosDoBanco = [
  { ticker: "CCMF27", primeira_data: "2025-07-17", ultima_data: "2026-09-18", pregoes: "295" },
  { ticker: "CCMU26", primeira_data: "2025-06-10", ultima_data: "2026-09-15", pregoes: "318" },
  { ticker: "CCMX26", primeira_data: "2025-07-17", ultima_data: "2026-09-18", pregoes: "295" },
  { ticker: "OUTRO1", primeira_data: "2025-07-17", ultima_data: "2026-09-18", pregoes: "1" }
];

function repoCcm(extra = {}) {
  return {
    listarVencimentos: async () => vencimentosDoBanco,
    buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, isoHaDias(1), 76.36),
    buscarHistoricoAtual: async () => ({ registros: [], total: 0 }),
    resumirSeries: async () => [],
    ...extra
  };
}

test("CCM: vencimentos ordenados do mais próximo ao mais distante; só ativo quem negociou no último pregão; vencidos continuam listados", async () => {
  const { observavel } = await observaveisService.obterDetalheObservavel("CCM_PRECOS", {
    observationRepository: repoCcm(),
    collectionExecutionRepository: { buscarUltimaPorColetor: async () => null }
  });

  assert.deepEqual(observavel.vencimentos.map((v) => [v.ticker, v.ativo]), [["CCMU26", false], ["CCMX26", true], ["CCMF27", true]], "ticker que não é um futuro CCM é ignorado");
  assert.equal(observavel.vencimentos[1].rotulo, "CCMX26 (nov/2026)");
  assert.equal(observavel.vencimentoPrincipal, "CCMX26", "o destaque é o vencimento ativo mais próximo, e vem identificado");
  assert.deepEqual(observavel.campos.map((c) => c.codigo), ["SETTLE", "LAST", "HIGH", "LOW", "AVG", "OSCN_PCT"]);
  assert.equal(observavel.campoPrincipal, "SETTLE");
  assert.equal(observavel.rotuloModalidade, "Vencimento");
});

test("CCM: a lista mostra o valor de UM vencimento, dizendo qual (não sugere série contínua)", async () => {
  const deps = { marketQuoteRepository: { buscarMaisRecente: async () => null }, observationRepository: repoCcm() };

  const { observaveis } = await observaveisService.listarObservaveis(deps);
  const precos = observaveis.find((o) => o.codigo === "CCM_PRECOS");
  const liquidez = observaveis.find((o) => o.codigo === "CCM_LIQUIDEZ");

  assert.equal(precos.unidade, "R$/saca (CCMX26)");
  assert.equal(precos.casasDecimais, 2);
  assert.equal(liquidez.unidade, "contratos (CCMX26)");
  assert.equal(liquidez.casasDecimais, 0);
});

test("CCM: sem escolha, o histórico traz o SETTLE dos vencimentos ATIVOS, uma linha por vencimento", async () => {
  let pedido = null;
  const deps = { observationRepository: repoCcm({ buscarHistoricoAtual: async (p) => { pedido = p; return { registros: [linhaObservation("B3.CCM.CCMX26.SETTLE", "2026-09-18", 76.36)], total: 1 }; } }) };

  const r = await observaveisService.obterHistoricoObservavel("CCM_PRECOS", {}, deps);

  assert.deepEqual(pedido.seriesCodes, ["B3.CCM.CCMX26.SETTLE", "B3.CCM.CCMF27.SETTLE"], "vencido (CCMU26) fica de fora por padrão");
  assert.equal(r.historico[0].modalidade, "CCMX26", "a modalidade é o vencimento");
  assert.equal(r.historico[0].unidade, "R$/saca");
});

test("CCM: vencimentos vencidos e outro campo continuam disponíveis para seleção", async () => {
  let pedido = null;
  const deps = { observationRepository: repoCcm({ buscarHistoricoAtual: async (p) => { pedido = p; return { registros: [], total: 0 }; } }) };

  await observaveisService.obterHistoricoObservavel("CCM_PRECOS", { vencimentos: "CCMU26,CCMX26", campo: "HIGH" }, deps);

  assert.deepEqual(pedido.seriesCodes, ["B3.CCM.CCMU26.HIGH", "B3.CCM.CCMX26.HIGH"]);
});

test("CCM: o card de liquidez usa contratos por padrão e cada campo tem a sua unidade", async () => {
  const chamadas = [];
  const deps = { observationRepository: repoCcm({ buscarHistoricoAtual: async (p) => { chamadas.push(p.seriesCodes[0]); return { registros: [linhaObservation(p.seriesCodes[0], "2026-09-18", 185731785)], total: 1 }; } }) };

  const padrao = await observaveisService.obterHistoricoObservavel("CCM_LIQUIDEZ", { vencimentos: "CCMX26" }, deps);
  const volume = await observaveisService.obterHistoricoObservavel("CCM_LIQUIDEZ", { vencimentos: "CCMX26", campo: "VOLUME_BRL" }, deps);

  assert.deepEqual(chamadas, ["B3.CCM.CCMX26.CONTRACTS", "B3.CCM.CCMX26.VOLUME_BRL"]);
  assert.equal(padrao.historico[0].unidade, "contratos");
  assert.equal(volume.historico[0].unidade, "R$");
});

test("CCM: campo de outro card, campo inexistente ou vencimento desconhecido são rejeitados", async () => {
  const deps = { observationRepository: repoCcm() };

  await assert.rejects(() => observaveisService.obterHistoricoObservavel("CCM_PRECOS", { campo: "TRADES" }, deps), /campo/);
  await assert.rejects(() => observaveisService.obterHistoricoObservavel("CCM_LIQUIDEZ", { campo: "SETTLE" }, deps), /campo/);
  await assert.rejects(() => observaveisService.obterHistoricoObservavel("CCM_PRECOS", { vencimentos: "CCMZ99" }, deps), /desconhecido/);
});

test("CCM: sem nenhum vencimento ativo o histórico vem vazio (não quebra)", async () => {
  const deps = { observationRepository: repoCcm({ listarVencimentos: async () => [] }) };

  const r = await observaveisService.obterHistoricoObservavel("CCM_PRECOS", {}, deps);

  assert.deepEqual(r.historico, []);
  assert.equal(r.paginacao.total, 0);
});
