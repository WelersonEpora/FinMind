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
const observationRepositoryVazio = { buscarMaisRecente: async () => null, resumirSeries: async () => [], listarItens: async () => [] };

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

  assert.equal(
    observaveis.length,
    22,
    "USD_BRL e SELIC (market_quote) + 20 de observation (5 fixos + 2 do USDA + 2 do Comex Stat + 2 do WASDE (EUA e por país) + 2 da Conab (por UF e balanço) + 4 do IMEA (safra + custo por mês + custo por safra + balanço de oferta e demanda) + indicador CEPEA/ESALQ do milho + 2 cards do CCM)"
  );
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
      listarItens: async () => [],
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
    observationRepository: { listarItens: async () => [], buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, isoHaDias(8), 1) }
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
      observationRepository: { listarItens: async () => [], buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, isoHaDias(dias), 1) }
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
  { codigo: "CCMF27", primeira_data: "2025-07-17", ultima_data: "2026-09-18", pregoes: "295" },
  { codigo: "CCMU26", primeira_data: "2025-06-10", ultima_data: "2026-09-15", pregoes: "318" },
  { codigo: "CCMX26", primeira_data: "2025-07-17", ultima_data: "2026-09-18", pregoes: "295" },
  { codigo: "OUTRO1", primeira_data: "2025-07-17", ultima_data: "2026-09-18", pregoes: "1" }
];

function repoCcm(extra = {}) {
  return {
    listarItens: async () => vencimentosDoBanco,
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

  assert.deepEqual(observavel.itens.map((v) => [v.codigo, v.ativo]), [["CCMU26", false], ["CCMX26", true], ["CCMF27", true]], "ticker que não é um futuro CCM é ignorado");
  assert.equal(observavel.itens[1].rotulo, "CCMX26 (nov/2026)");
  assert.equal(observavel.itemPrincipal, "CCMX26", "o destaque é o vencimento ativo mais próximo, e vem identificado");
  assert.deepEqual(observavel.campos.map((c) => c.codigo), ["SETTLE", "LAST", "HIGH", "LOW", "AVG", "OPEN", "OSCN_PCT"]);
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

  await observaveisService.obterHistoricoObservavel("CCM_PRECOS", { itens: "CCMU26,CCMX26", campo: "HIGH" }, deps);

  assert.deepEqual(pedido.seriesCodes, ["B3.CCM.CCMU26.HIGH", "B3.CCM.CCMX26.HIGH"]);
});

test("CCM: o card de liquidez usa contratos por padrão e cada campo tem a sua unidade", async () => {
  const chamadas = [];
  const deps = { observationRepository: repoCcm({ buscarHistoricoAtual: async (p) => { chamadas.push(p.seriesCodes[0]); return { registros: [linhaObservation(p.seriesCodes[0], "2026-09-18", 185731785)], total: 1 }; } }) };

  const padrao = await observaveisService.obterHistoricoObservavel("CCM_LIQUIDEZ", { itens: "CCMX26" }, deps);
  const volume = await observaveisService.obterHistoricoObservavel("CCM_LIQUIDEZ", { itens: "CCMX26", campo: "VOLUME_BRL" }, deps);

  assert.deepEqual(chamadas, ["B3.CCM.CCMX26.CONTRACTS", "B3.CCM.CCMX26.VOLUME_BRL"]);
  assert.equal(padrao.historico[0].unidade, "contratos");
  assert.equal(volume.historico[0].unidade, "R$");
});

test("CCM: campo de outro card, campo inexistente ou vencimento desconhecido são rejeitados", async () => {
  const deps = { observationRepository: repoCcm() };

  await assert.rejects(() => observaveisService.obterHistoricoObservavel("CCM_PRECOS", { campo: "TRADES" }, deps), /campo/);
  await assert.rejects(() => observaveisService.obterHistoricoObservavel("CCM_LIQUIDEZ", { campo: "SETTLE" }, deps), /campo/);
  await assert.rejects(() => observaveisService.obterHistoricoObservavel("CCM_PRECOS", { itens: "CCMZ99" }, deps), /desconhecido/);
});

test("CCM: sem nenhum vencimento ativo o histórico vem vazio (não quebra)", async () => {
  const deps = { observationRepository: repoCcm({ listarItens: async () => [] }) };

  const r = await observaveisService.obterHistoricoObservavel("CCM_PRECOS", {}, deps);

  assert.deepEqual(r.historico, []);
  assert.equal(r.paginacao.total, 0);
});

test("cada card do WASDE tem o seu escopo: o dos EUA cobre só os EUA, o por país lista a seleção do WASDE", async () => {
  const { observaveis } = await observaveisService.listarObservaveis({
    marketQuoteRepository: { buscarMaisRecente: async () => null },
    observationRepository: observationRepositoryVazio
  });
  const wasde = observaveis.filter((o) => o.codigo.startsWith("WASDE_MILHO_"));

  assert.equal(wasde.length, 2, "um card dos EUA (bushels, seletor de métrica) + o card por país (toneladas)");

  const escopoDe = async (codigo) =>
    (
      await observaveisService.obterDetalheObservavel(codigo, {
        observationRepository: observationRepositoryVazio,
        collectionExecutionRepository: { buscarUltimaPorColetor: async () => null }
      })
    ).observavel.fonteDetalhe.escopo;

  const eua = await escopoDe("WASDE_MILHO_EUA");
  assert.match(eua, /só os Estados Unidos/);
  assert.match(eua, /Milho por país/, "aponta onde estão os demais países");
  assert.doesNotMatch(eua, /seleção de países/, "o aviso de seleção de países não se aplica ao card dos EUA");

  const paises = await escopoDe("WASDE_MILHO_PAISES");
  assert.match(paises, /seleção de países/);
  for (const pais of ["Argentina", "Brasil", "China", "Estados Unidos", "Rússia", "União Europeia"]) assert.match(paises, new RegExp(pais), `lista ${pais}`);
  assert.match(paises, /Índia/, "cita países que NÃO são cobertos");

  for (const escopo of [eua, paises]) assert.match(escopo, /PSD.*não foi implementada/);
});

// --- WASDE por país: mesmo modelo do CCM, com a região no lugar do vencimento ---

// Entrada fora de ordem, de propósito. EU_27 e FSU_12 pararam de ser publicadas;
// as demais têm a safra mais recente (2026).
const regioesDoBanco = [
  { codigo: "WORLD", primeira_data: "2008-09-01", ultima_data: "2026-09-01", pregoes: "19" },
  { codigo: "UNITED_STATES", primeira_data: "2008-09-01", ultima_data: "2026-09-01", pregoes: "19" },
  { codigo: "FSU_12", primeira_data: "2008-09-01", ultima_data: "2018-09-01", pregoes: "11" },
  { codigo: "BRAZIL", primeira_data: "2008-09-01", ultima_data: "2026-09-01", pregoes: "19" },
  { codigo: "EU_27", primeira_data: "2008-09-01", ultima_data: "2013-09-01", pregoes: "6" },
  { codigo: "CHINA", primeira_data: "2008-09-01", ultima_data: "2026-09-01", pregoes: "19" },
  { codigo: "NOVA_REGIAO", primeira_data: "2026-09-01", ultima_data: "2026-09-01", pregoes: "1" }
];

function repoWasdePaises(extra = {}) {
  return {
    listarItens: async () => regioesDoBanco,
    buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, "2026-09-01", 300),
    buscarHistoricoAtual: async () => ({ registros: [], total: 0 }),
    resumirSeries: async () => [],
    ...extra
  };
}

test("WASDE por país: países antes de agregados, cada grupo em ordem alfabética; região fora do mapa aparece com o código", async () => {
  const { observavel } = await observaveisService.obterDetalheObservavel("WASDE_MILHO_PAISES", {
    observationRepository: repoWasdePaises(),
    collectionExecutionRepository: { buscarUltimaPorColetor: async () => null }
  });

  assert.deepEqual(
    observavel.itens.map((i) => i.codigo),
    ["BRAZIL", "CHINA", "UNITED_STATES", "NOVA_REGIAO", "EU_27", "FSU_12", "WORLD"],
    "países por rótulo (Brasil, China, Estados Unidos, código sem rótulo, União Europeia) e depois os agregados (ex-URSS, mundo)"
  );
  const porCodigo = Object.fromEntries(observavel.itens.map((i) => [i.codigo, i]));
  assert.equal(porCodigo.BRAZIL.rotulo, "Brasil");
  assert.equal(porCodigo.NOVA_REGIAO.rotulo, "NOVA_REGIAO");
  assert.equal(porCodigo.WORLD.agregado, true);
  assert.equal(porCodigo.BRAZIL.agregado, false);
  assert.equal(porCodigo.EU_27.ativo, false, "série que parou de ser publicada fica como descontinuada");
  assert.equal(porCodigo.FSU_12.ativo, false);
  assert.equal(porCodigo.CHINA.ativo, true);
  assert.equal(observavel.rotuloModalidade, "Região");
  assert.equal(observavel.selecao.inativo, "descontinuada");
  assert.deepEqual(observavel.itensPadrao, ["BRAZIL", "UNITED_STATES", "CHINA"], "padrão do catálogo (Argentina não está neste banco de teste): só o que existe");
  assert.equal(observavel.itemPrincipal, "Mundo", "o destaque do card é a região configurada, identificada");
  assert.deepEqual(observavel.campos.map((c) => c.codigo), ["ENDING_STOCKS", "PRODUCTION", "BEGINNING_STOCKS", "IMPORTS", "EXPORTS", "DOMESTIC_TOTAL", "DOMESTIC_FEED"]);
});

test("WASDE por país: a lista mostra o valor de UMA região, dizendo qual", async () => {
  const { observaveis } = await observaveisService.listarObservaveis({
    marketQuoteRepository: { buscarMaisRecente: async () => null },
    observationRepository: repoWasdePaises()
  });

  assert.equal(observaveis.find((o) => o.codigo === "WASDE_MILHO_PAISES").unidade, "milhões de t (Mundo)");
});

test("WASDE por país: sem escolha, o histórico traz as regiões padrão; com escolha, as regiões e a métrica pedidas", async () => {
  const pedidos = [];
  const deps = { observationRepository: repoWasdePaises({ buscarHistoricoAtual: async (p) => { pedidos.push(p.seriesCodes); return { registros: [], total: 0 }; } }) };

  await observaveisService.obterHistoricoObservavel("WASDE_MILHO_PAISES", {}, deps);
  await observaveisService.obterHistoricoObservavel("WASDE_MILHO_PAISES", { itens: "WORLD,FSU_12", campo: "PRODUCTION" }, deps);

  assert.deepEqual(pedidos[0], ["WASDE.MILHO.MUNDO.BRAZIL.ENDING_STOCKS", "WASDE.MILHO.MUNDO.UNITED_STATES.ENDING_STOCKS", "WASDE.MILHO.MUNDO.CHINA.ENDING_STOCKS"]);
  assert.deepEqual(pedidos[1], ["WASDE.MILHO.MUNDO.WORLD.PRODUCTION", "WASDE.MILHO.MUNDO.FSU_12.PRODUCTION"], "séries descontinuadas continuam disponíveis para seleção");
});

test("WASDE por país: cada linha traz a região como modalidade e a unidade da métrica; região desconhecida é rejeitada", async () => {
  const deps = { observationRepository: repoWasdePaises({ buscarHistoricoAtual: async (p) => ({ registros: [linhaObservation(p.seriesCodes[0], "2025-09-01", 62.5)], total: 1 }) }) };

  const r = await observaveisService.obterHistoricoObservavel("WASDE_MILHO_PAISES", { itens: "BRAZIL" }, deps);
  assert.equal(r.historico[0].modalidade, "BRAZIL");
  assert.equal(r.historico[0].unidade, "milhões de t");

  await assert.rejects(() => observaveisService.obterHistoricoObservavel("WASDE_MILHO_PAISES", { itens: "ATLANTIDA" }, deps), /Região\(s\) desconhecido/);
});

// --- WASDE EUA: uma série por métrica, só com o seletor de métrica (sem itens) ---

function repoWasdeEua(extra = {}) {
  return {
    buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, "2026-09-01", 1567),
    buscarHistoricoAtual: async () => ({ registros: [], total: 0 }),
    resumirSeries: async () => [],
    listarItens: async () => [],
    ...extra
  };
}

test("WASDE EUA: o detalhe oferece as 13 métricas (estoque final por padrão) e nenhum seletor de item", async () => {
  const { observavel } = await observaveisService.obterDetalheObservavel("WASDE_MILHO_EUA", {
    observationRepository: repoWasdeEua(),
    collectionExecutionRepository: { buscarUltimaPorColetor: async () => null }
  });

  assert.equal(observavel.campos.length, 13);
  assert.equal(observavel.campoPrincipal, "ENDING_STOCKS");
  assert.equal(observavel.itens, undefined, "sem itens: só o seletor de métrica");
  assert.equal(observavel.cotacaoAtual.valor, 1567);
  assert.equal(observavel.cotacaoAtual.unidade, "milhões de bushels");
  assert.equal(observavel.unidade, "milhões de bushels");
});

test("WASDE EUA: cada métrica consulta a sua série e tem a sua unidade", async () => {
  const pedidos = [];
  const deps = { observationRepository: repoWasdeEua({ buscarHistoricoAtual: async (p) => { pedidos.push(p.seriesCodes); return { registros: [linhaObservation(p.seriesCodes[0], "2026-09-01", 183.1)], total: 1 }; } }) };

  const padrao = await observaveisService.obterHistoricoObservavel("WASDE_MILHO_EUA", {}, deps);
  const produtividade = await observaveisService.obterHistoricoObservavel("WASDE_MILHO_EUA", { campo: "YIELD" }, deps);

  assert.deepEqual(pedidos, [["WASDE.MILHO.EUA.ENDING_STOCKS"], ["WASDE.MILHO.EUA.YIELD"]]);
  assert.equal(padrao.historico[0].unidade, "milhões de bushels");
  assert.equal(produtividade.historico[0].unidade, "bushels/acre");
  assert.equal(produtividade.historico[0].modalidade, "valor");
  await assert.rejects(() => observaveisService.obterHistoricoObservavel("WASDE_MILHO_EUA", { campo: "INEXISTENTE" }, deps), /campo/);
});

test("WASDE EUA: a cobertura soma as séries de todas as métricas", async () => {
  let consultadas = null;
  const deps = {
    observationRepository: repoWasdeEua({ resumirSeries: async (codigos) => { consultadas = codigos; return []; } }),
    collectionExecutionRepository: { buscarUltimaPorColetor: async () => null }
  };

  await observaveisService.obterDetalheObservavel("WASDE_MILHO_EUA", deps);

  assert.equal(consultadas.length, 13);
  assert.ok(consultadas.every((c) => c.startsWith("WASDE.MILHO.EUA.")));
});

// --- Indicador do Milho CEPEA/ESALQ: origem B3, seletor de métrica R$ / US$ (ADR 0021) ---

test("Milho CEPEA/ESALQ: o card diz que a origem é a B3; R$ por padrão e US$ como segunda métrica", async () => {
  const pedidos = [];
  const deps = {
    observationRepository: repoWasdeEua({
      buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, "2026-09-22", 69.74),
      buscarHistoricoAtual: async (p) => {
        pedidos.push(p.seriesCodes);
        return { registros: [linhaObservation(p.seriesCodes[0], "2026-09-22", 13.65)], total: 1 };
      }
    }),
    collectionExecutionRepository: { buscarUltimaPorColetor: async () => null }
  };

  const { observavel } = await observaveisService.obterDetalheObservavel("MILHO_CEPEA_ESALQ", deps);
  assert.match(observavel.cotacaoAtual.fonte, /^B3/);
  assert.match(observavel.fonteDetalhe.descricao, /obtém da B3/);
  assert.match(observavel.nome, /CEPEA\/ESALQ/);
  assert.equal(observavel.cotacaoAtual.valor, 69.74);
  assert.equal(observavel.cotacaoAtual.unidade, "R$/saca");

  const usd = await observaveisService.obterHistoricoObservavel("MILHO_CEPEA_ESALQ", { campo: "AVISTA_USD" }, deps);
  assert.deepEqual(pedidos, [["B3.MILHO_ESALQ.AVISTA_USD"]]);
  assert.equal(usd.historico[0].unidade, "US$/saca");
});

// --- Conab: milho por safra e UF (seletor de região) e balanço nacional (seletor de métrica) ---

// Entrada fora de ordem, de propósito.
const regioesConab = [
  { codigo: "BRASIL", primeira_data: "2023-09-01", ultima_data: "2025-09-01", pregoes: "3" },
  { codigo: "MT", primeira_data: "2023-09-01", ultima_data: "2025-09-01", pregoes: "3" },
  { codigo: "NORTE", primeira_data: "2023-09-01", ultima_data: "2025-09-01", pregoes: "3" },
  { codigo: "PR", primeira_data: "2023-09-01", ultima_data: "2025-09-01", pregoes: "3" },
  { codigo: "CENTRO_OESTE", primeira_data: "2023-09-01", ultima_data: "2025-09-01", pregoes: "3" },
  { codigo: "AC", primeira_data: "2023-09-01", ultima_data: "2025-09-01", pregoes: "3" }
];

function repoConab(extra = {}) {
  return {
    listarItens: async () => regioesConab,
    buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, "2025-09-01", 144009.6),
    buscarHistoricoAtual: async () => ({ registros: [], total: 0 }),
    resumirSeries: async () => [],
    ...extra
  };
}

const semExecucao = { buscarUltimaPorColetor: async () => null };

test("Conab por UF: UFs por nome antes dos agregados; rótulos por extenso; destaque é o Brasil", async () => {
  const { observavel } = await observaveisService.obterDetalheObservavel("CONAB_MILHO_SAFRA", {
    observationRepository: repoConab(),
    collectionExecutionRepository: semExecucao
  });

  assert.deepEqual(
    observavel.itens.map((i) => i.codigo),
    ["AC", "MT", "PR", "BRASIL", "CENTRO_OESTE", "NORTE"],
    "UFs em ordem alfabética do nome (Acre, Mato Grosso, Paraná) e depois os agregados (Brasil, Região Centro-Oeste, Região Norte)"
  );
  const porCodigo = Object.fromEntries(observavel.itens.map((i) => [i.codigo, i]));
  assert.equal(porCodigo.MT.rotulo, "Mato Grosso (MT)");
  assert.equal(porCodigo.CENTRO_OESTE.rotulo, "Região Centro-Oeste");
  assert.equal(porCodigo.BRASIL.agregado, true);
  assert.equal(porCodigo.MT.agregado, false);
  assert.equal(observavel.rotuloModalidade, "Região/UF");
  assert.equal(observavel.itemPrincipal, "Brasil");
  assert.deepEqual(observavel.itensPadrao, ["BRASIL", "MT", "PR"], "padrão do catálogo, só com o que existe no banco (GO e MS não estão neste teste)");
  assert.equal(observavel.campoPrincipal, "PRODUCAO_TOTAL");
  assert.equal(observavel.campos.length, 12);
  assert.match(observavel.selecao.nota, /Conab/);
  assert.equal(observavel.cotacaoAtual.valor, 144009.6);
});

test("Conab por UF: a lista mostra o valor do Brasil, dizendo qual", async () => {
  const { observaveis } = await observaveisService.listarObservaveis({
    marketQuoteRepository: { buscarMaisRecente: async () => null },
    observationRepository: repoConab()
  });

  assert.equal(observaveis.find((o) => o.codigo === "CONAB_MILHO_SAFRA").unidade, "mil t (Brasil)");
});

test("Conab por UF: métrica e tipo de safra viram a série; cada métrica tem a sua unidade", async () => {
  const pedidos = [];
  const deps = {
    observationRepository: repoConab({
      buscarHistoricoAtual: async (p) => {
        pedidos.push(p.seriesCodes);
        return { registros: [linhaObservation(p.seriesCodes[0], "2025-09-01", 7681)], total: 1 };
      }
    })
  };

  await observaveisService.obterHistoricoObservavel("CONAB_MILHO_SAFRA", { campo: "PRODUCAO_2A", itens: "BRASIL,MT" }, deps);
  const produtividade = await observaveisService.obterHistoricoObservavel("CONAB_MILHO_SAFRA", { campo: "PRODUTIVIDADE_2A", itens: "MT" }, deps);

  assert.deepEqual(pedidos[0], ["CONAB.MILHO.BRASIL.PRODUCAO_2A", "CONAB.MILHO.MT.PRODUCAO_2A"]);
  assert.deepEqual(pedidos[1], ["CONAB.MILHO.MT.PRODUTIVIDADE_2A"]);
  assert.equal(produtividade.historico[0].unidade, "kg/ha");
  assert.equal(produtividade.historico[0].modalidade, "MT");
  await assert.rejects(() => observaveisService.obterHistoricoObservavel("CONAB_MILHO_SAFRA", { itens: "ATLANTIDA" }, deps), /Região\/UF\(s\) desconhecido/);
  await assert.rejects(() => observaveisService.obterHistoricoObservavel("CONAB_MILHO_SAFRA", { campo: "ESTOQUE_FINAL" }, deps), /campo/, "o estoque é do card de balanço");
});

test("Conab balanço: 8 métricas (estoque final por padrão), série nacional única e nenhum seletor de item", async () => {
  const pedidos = [];
  const deps = {
    observationRepository: repoConab({
      buscarHistoricoAtual: async (p) => {
        pedidos.push(p.seriesCodes);
        return { registros: [linhaObservation(p.seriesCodes[0], "2025-09-01", 15654.04)], total: 1 };
      }
    }),
    collectionExecutionRepository: semExecucao
  };

  const { observavel } = await observaveisService.obterDetalheObservavel("CONAB_MILHO_BALANCO", deps);
  assert.deepEqual(observavel.campos.map((c) => c.codigo), ["ESTOQUE_FINAL", "ESTOQUE_INICIAL", "PRODUCAO", "IMPORTACAO", "SUPRIMENTO", "CONSUMO", "EXPORTACAO", "DEMANDA_TOTAL"]);
  assert.equal(observavel.campoPrincipal, "ESTOQUE_FINAL");
  assert.equal(observavel.itens, undefined);
  assert.equal(observavel.unidade, "mil t");

  const consumo = await observaveisService.obterHistoricoObservavel("CONAB_MILHO_BALANCO", { campo: "CONSUMO" }, deps);
  assert.deepEqual(pedidos.at(-1), ["CONAB.MILHO.BALANCO.CONSUMO"]);
  assert.equal(consumo.historico[0].unidade, "mil t");
});

test("Conab: o escopo de cada card diz o que cobre (só milho; balanço só nacional) e o que não foi carregado", async () => {
  const escopoDe = async (codigo) =>
    (await observaveisService.obterDetalheObservavel(codigo, { observationRepository: repoConab(), collectionExecutionRepository: semExecucao })).observavel.fonteDetalhe.escopo;

  const porUf = await escopoDe("CONAB_MILHO_SAFRA");
  assert.match(porUf, /só milho/);
  assert.match(porUf, /27 UFs/);
  assert.match(porUf, /1976\/77.*não foram carregados/, "o histórico longo e os preços seguem de fora");

  const balanco = await escopoDe("CONAB_MILHO_BALANCO");
  assert.match(balanco, /NACIONAL/);
  assert.match(balanco, /não há estoque nem consumo por UF/);
});

// --- IMEA: milho de MT por safra e região (seletor de região) e 3 cards de custo (seletor de local/tecnologia) ---

// Entrada fora de ordem, de propósito.
const regioesImea = [
  { codigo: "OESTE", primeira_data: "2022-09-01", ultima_data: "2025-09-01", pregoes: "4" },
  { codigo: "MATO_GROSSO", primeira_data: "2022-09-01", ultima_data: "2025-09-01", pregoes: "4" },
  { codigo: "CENTRO_SUL", primeira_data: "2022-09-01", ultima_data: "2025-09-01", pregoes: "4" }
];

function repoImea(extra = {}) {
  return {
    listarItens: async () => regioesImea,
    buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, "2025-09-01", 58036957.95),
    buscarHistoricoAtual: async () => ({ registros: [], total: 0 }),
    resumirSeries: async () => [],
    ...extra
  };
}

test("IMEA por safra: regiões por nome antes do agregado (Mato Grosso); destaque é Mato Grosso", async () => {
  const { observavel } = await observaveisService.obterDetalheObservavel("IMEA_MILHO_SAFRA", {
    observationRepository: repoImea(),
    collectionExecutionRepository: semExecucao
  });

  assert.deepEqual(observavel.itens.map((i) => i.codigo), ["CENTRO_SUL", "OESTE", "MATO_GROSSO"], "regiões em ordem alfabética do rótulo, o estado (agregado) por último");
  const porCodigo = Object.fromEntries(observavel.itens.map((i) => [i.codigo, i]));
  assert.equal(porCodigo.MATO_GROSSO.agregado, true);
  assert.equal(porCodigo.OESTE.agregado, false);
  assert.equal(porCodigo.OESTE.rotulo, "Oeste");
  assert.equal(observavel.rotuloModalidade, "Região");
  assert.equal(observavel.itemPrincipal, "Mato Grosso");
  assert.deepEqual(observavel.itensPadrao, ["MATO_GROSSO"]);
  assert.deepEqual(observavel.campos.map((c) => c.codigo), ["PRODUCAO", "AREA", "PRODUTIVIDADE"]);
  assert.equal(observavel.cotacaoAtual.valor, 58036957.95);
});

test("IMEA por safra: métrica escolhida vira a série, com a unidade certa", async () => {
  const pedidos = [];
  const deps = {
    observationRepository: repoImea({
      buscarHistoricoAtual: async (p) => {
        pedidos.push(p.seriesCodes);
        return { registros: [linhaObservation(p.seriesCodes[0], "2025-09-01", 130.11)], total: 1 };
      }
    })
  };

  const produtividade = await observaveisService.obterHistoricoObservavel("IMEA_MILHO_SAFRA", { campo: "PRODUTIVIDADE", itens: "MATO_GROSSO" }, deps);

  assert.deepEqual(pedidos[0], ["IMEA.MILHO.MATO_GROSSO.PRODUTIVIDADE"]);
  assert.equal(produtividade.historico[0].unidade, "sc/ha");
  await assert.rejects(() => observaveisService.obterHistoricoObservavel("IMEA_MILHO_SAFRA", { itens: "ATLANTIDA" }, deps), /Região\(s\) desconhecido/);
});

// Card de custo POR MÊS: item é tipo x tecnologia x local, séries `IMEA.CUSTO.MILHO.MES.<TIPO>_<TECNOLOGIA>_<LOCAL>.<ITEM>`.
// Mensal e Ponderado convivem como itens distintos do MESMO seletor (ADR 0018: os dois trazem o mesmo mês com
// valores diferentes, sem série única possível).
const locaisCustoMesImea = [
  { codigo: "PONDERADO_ALTA_SORRISO", primeira_data: "2026-06-01", ultima_data: "2026-08-01", pregoes: "3" },
  { codigo: "PONDERADO_ALTA_MATO_GROSSO", primeira_data: "2026-06-01", ultima_data: "2026-08-01", pregoes: "3" },
  { codigo: "MENSAL_ALTA_MATO_GROSSO", primeira_data: "2026-06-01", ultima_data: "2026-08-01", pregoes: "3" },
  { codigo: "PONDERADO_MEDIA_MATO_GROSSO", primeira_data: "2026-06-01", ultima_data: "2026-08-01", pregoes: "3" }
];

function repoCustoMesImea(extra = {}) {
  return {
    listarItens: async () => locaisCustoMesImea,
    buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, "2026-08-01", 3788.94),
    buscarHistoricoAtual: async () => ({ registros: [], total: 0 }),
    resumirSeries: async () => [],
    ...extra
  };
}

// Card de custo POR SAFRA: item é só tecnologia x local (só existe no Ponderado, sem ambiguidade de tipo).
const locaisCustoSafraImea = [
  { codigo: "ALTA_SORRISO", primeira_data: "2021-09-01", ultima_data: "2025-09-01", pregoes: "5" },
  { codigo: "ALTA_MATO_GROSSO", primeira_data: "2021-09-01", ultima_data: "2025-09-01", pregoes: "5" },
  { codigo: "MEDIA_MATO_GROSSO", primeira_data: "2021-09-01", ultima_data: "2025-09-01", pregoes: "5" }
];

function repoCustoSafraImea(extra = {}) {
  return {
    listarItens: async () => locaisCustoSafraImea,
    buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, "2025-09-01", 6748.28),
    buscarHistoricoAtual: async () => ({ registros: [], total: 0 }),
    resumirSeries: async () => [],
    ...extra
  };
}

test("IMEA custo por mês: item é tipo x tecnologia x local; Mensal e Ponderado convivem no mesmo seletor; destaque é Ponderado/Mato Grosso/alta", async () => {
  const { observavel } = await observaveisService.obterDetalheObservavel("IMEA_CUSTO_MILHO_MES", {
    observationRepository: repoCustoMesImea(),
    collectionExecutionRepository: semExecucao
  });

  const porCodigo = Object.fromEntries(observavel.itens.map((i) => [i.codigo, i]));
  assert.equal(porCodigo.PONDERADO_ALTA_SORRISO.rotulo, "Sorriso - alta tecnologia (ponderado)");
  assert.equal(porCodigo.PONDERADO_ALTA_MATO_GROSSO.rotulo, "Mato Grosso - alta tecnologia (ponderado)");
  assert.equal(porCodigo.MENSAL_ALTA_MATO_GROSSO.rotulo, "Mato Grosso - alta tecnologia (mensal)");
  assert.equal(porCodigo.PONDERADO_ALTA_MATO_GROSSO.agregado, true);
  assert.equal(porCodigo.PONDERADO_ALTA_SORRISO.agregado, false);
  assert.equal(observavel.rotuloModalidade, "Local e tecnologia");
  assert.equal(observavel.itemPrincipal, "Mato Grosso - alta tecnologia (ponderado)");
  assert.deepEqual(observavel.itensPadrao, ["PONDERADO_ALTA_MATO_GROSSO", "MENSAL_ALTA_MATO_GROSSO", "PONDERADO_MEDIA_MATO_GROSSO"], "padrão do catálogo, só com o que existe neste banco de teste (falta MENSAL_MEDIA_MATO_GROSSO)");
  assert.equal(observavel.campoPrincipal, "CT");
  assert.ok(observavel.campos.length > 50, "uma métrica por item de custo da planilha");
  assert.equal(observavel.unidade, "R$/ha");
});

test("IMEA custo por safra: item é só tecnologia x local (sem tipo, só existe no Ponderado); destaque é Mato Grosso em alta tecnologia", async () => {
  const { observavel } = await observaveisService.obterDetalheObservavel("IMEA_CUSTO_MILHO_SAFRA", {
    observationRepository: repoCustoSafraImea(),
    collectionExecutionRepository: semExecucao
  });

  const porCodigo = Object.fromEntries(observavel.itens.map((i) => [i.codigo, i]));
  assert.equal(porCodigo.ALTA_SORRISO.rotulo, "Sorriso - alta tecnologia");
  assert.equal(porCodigo.ALTA_MATO_GROSSO.rotulo, "Mato Grosso - alta tecnologia");
  assert.equal(observavel.itemPrincipal, "Mato Grosso - alta tecnologia");
  assert.deepEqual(observavel.itensPadrao, ["ALTA_MATO_GROSSO", "MEDIA_MATO_GROSSO"]);
});

test("IMEA custo: 'Produtividade Modal' e 'Dólar compra' vêm na PRÓPRIA unidade, não em R$/ha", async () => {
  const { observavel } = await observaveisService.obterDetalheObservavel("IMEA_CUSTO_MILHO_MES", {
    observationRepository: repoCustoMesImea(),
    collectionExecutionRepository: semExecucao
  });
  const porCodigo = Object.fromEntries(observavel.campos.map((c) => [c.codigo, c]));
  assert.equal(porCodigo.PRODUTIVIDADE_MODAL.unidade, "sc/ha");
  assert.equal(porCodigo.DOLAR_COMPRA.unidade, "R$/US$");
});

test("IMEA custo por mês x por safra: prefixos de série e frequência diferentes (as duas frequências não cabem no mesmo card)", async () => {
  const { observaveis } = await observaveisService.listarObservaveis({
    marketQuoteRepository: { buscarMaisRecente: async () => null },
    observationRepository: repoCustoMesImea()
  });

  const mes = observaveis.find((o) => o.codigo === "IMEA_CUSTO_MILHO_MES");
  const safra = observaveis.find((o) => o.codigo === "IMEA_CUSTO_MILHO_SAFRA");

  assert.equal(mes.frequencia, "MENSAL");
  assert.equal(safra.frequencia, "ANUAL");

  const pedidos = [];
  const buscarHistoricoAtual = async (p) => {
    pedidos.push(p.seriesCodes);
    return { registros: [], total: 0 };
  };
  await observaveisService.obterHistoricoObservavel(
    "IMEA_CUSTO_MILHO_MES",
    { itens: "PONDERADO_ALTA_MATO_GROSSO" },
    { observationRepository: repoCustoMesImea({ buscarHistoricoAtual }) }
  );
  await observaveisService.obterHistoricoObservavel(
    "IMEA_CUSTO_MILHO_SAFRA",
    { itens: "ALTA_MATO_GROSSO" },
    { observationRepository: repoCustoSafraImea({ buscarHistoricoAtual }) }
  );
  assert.deepEqual(pedidos[0], ["IMEA.CUSTO.MILHO.MES.PONDERADO_ALTA_MATO_GROSSO.CT"]);
  assert.deepEqual(pedidos[1], ["IMEA.CUSTO.MILHO.SAFRA.ALTA_MATO_GROSSO.CT"]);
});

test("IMEA: o escopo de cada card diz o que cobre (só MT; os 3 indicadores identificados; a lacuna de vintage)", async () => {
  const escopoDe = async (codigo, repo) => (await observaveisService.obterDetalheObservavel(codigo, { observationRepository: repo, collectionExecutionRepository: semExecucao })).observavel.fonteDetalhe.escopo;

  const porSafra = await escopoDe("IMEA_MILHO_SAFRA", repoImea());
  assert.match(porSafra, /Mato Grosso e as 7 regiões/);
  assert.match(porSafra, /casando os valores com o relatório/);

  const custo = await escopoDe("IMEA_CUSTO_MILHO_MES", repoCustoMesImea());
  assert.match(custo, /só o milho de Mato Grosso/);
  assert.match(custo, /Nova Mutum/, "cita a lacuna real de abas ausentes no Índice");
});

// --- IMEA: balanço de oferta e demanda (seletor de métrica, sem seletor de item - só Mato Grosso) ---

function repoImeaBalanco(extra = {}) {
  return {
    buscarMaisRecente: async (seriesCode) => linhaObservation(seriesCode, "2025-09-01", 0.64),
    buscarHistoricoAtual: async () => ({ registros: [], total: 0 }),
    resumirSeries: async () => [],
    listarItens: async () => [],
    ...extra
  };
}

test("IMEA balanço: 10 métricas (estoque final por padrão), série única (Mato Grosso) e nenhum seletor de item", async () => {
  const { observavel } = await observaveisService.obterDetalheObservavel("IMEA_MILHO_BALANCO", {
    observationRepository: repoImeaBalanco(),
    collectionExecutionRepository: semExecucao
  });

  assert.deepEqual(observavel.campos.map((c) => c.codigo), [
    "ESTOQUE_FINAL",
    "OFERTA",
    "ESTOQUE_INICIAL",
    "PRODUCAO",
    "IMPORTACAO",
    "DEMANDA",
    "CONSUMO_MT",
    "CONSUMO_INTERESTADUAL",
    "EXPORTACAO",
    "AQUISICOES_PUBLICAS"
  ]);
  assert.equal(observavel.campoPrincipal, "ESTOQUE_FINAL");
  assert.equal(observavel.itens, undefined, "sem itens: o balanço não tem quebra por região, só o seletor de métrica");
  assert.equal(observavel.unidade, "milhões de t");
  assert.equal(observavel.cotacaoAtual.valor, 0.64);
});

test("IMEA balanço: cada métrica consulta a sua própria série IMEA.MILHO.BALANCO.<CAMPO>", async () => {
  const pedidos = [];
  const deps = { observationRepository: repoImeaBalanco({ buscarHistoricoAtual: async (p) => { pedidos.push(p.seriesCodes); return { registros: [linhaObservation(p.seriesCodes[0], "2025-09-01", 58.04)], total: 1 }; } }) };

  const padrao = await observaveisService.obterHistoricoObservavel("IMEA_MILHO_BALANCO", {}, deps);
  const producao = await observaveisService.obterHistoricoObservavel("IMEA_MILHO_BALANCO", { campo: "PRODUCAO" }, deps);

  assert.deepEqual(pedidos, [["IMEA.MILHO.BALANCO.ESTOQUE_FINAL"], ["IMEA.MILHO.BALANCO.PRODUCAO"]]);
  assert.equal(padrao.historico[0].unidade, "milhões de t");
  assert.equal(producao.historico[0].modalidade, "valor");
  await assert.rejects(() => observaveisService.obterHistoricoObservavel("IMEA_MILHO_BALANCO", { campo: "INEXISTENTE" }, deps), /campo/);
});

test("IMEA balanço: a origem é explicitamente o PDF do IMEA (não uma API), e o escopo avisa que não tem quebra regional nem reconcilia Produção com o card de safra", async () => {
  const { observavel } = await observaveisService.obterDetalheObservavel("IMEA_MILHO_BALANCO", {
    observationRepository: repoImeaBalanco(),
    collectionExecutionRepository: semExecucao
  });

  assert.match(observavel.fonteDetalhe.formatoOrigem, /^PDF/);
  assert.match(observavel.fonteDetalhe.formatoOrigem, /extraído do texto do PDF/);
  assert.match(observavel.fonteDetalhe.metodologia, /COORDENADA/);
  assert.match(observavel.fonteDetalhe.escopo, /não tem quebra por região/);
  assert.match(observavel.fonteDetalhe.escopo, /não são reconciliados/);
});

// --- padrão dos cards: a tela decide o período inicial do gráfico pela frequência (frontend/src/utils/periodo-grafico.js) ---

test("todo card do catálogo tem uma frequência que a tela conhece (senão o período inicial do gráfico fica sem regra)", async () => {
  const { observaveis } = await observaveisService.listarObservaveis({
    marketQuoteRepository: { buscarMaisRecente: async () => null },
    observationRepository: observationRepositoryVazio
  });
  const conhecidas = ["DIARIA", "SEMANAL", "MENSAL", "ANUAL"];

  for (const observavel of observaveis) {
    assert.ok(conhecidas.includes(observavel.frequencia), `${observavel.codigo}: frequência "${observavel.frequencia}" não é uma das conhecidas (${conhecidas.join(", ")})`);
  }
});
