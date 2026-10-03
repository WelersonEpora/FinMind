"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { obterCentroDecisao, calcularVariacoes, ATIVOS } = require("./centro-decisao.service");
const { buscarNoCatalogo } = require("./observaveis.service");

// 2026-10-02 12:00 em Brasília.
const AGORA = new Date("2026-10-02T15:00:00Z");

function linha(seriesCode, observedAt, value) {
  return { series_code: seriesCode, observed_at: observedAt, value: String(value), published_at: new Date(`${observedAt}T23:00:00Z`), published_at_is_estimated: true };
}

// Repositório falso: aplica os mesmos filtros do buscarAsOf (séries, published_at <= asOf, janela de observed_at).
function repoCom(linhas, contratos = []) {
  const chamadas = [];
  return {
    chamadas,
    async listarUltimasDatasItens(config) {
      chamadas.push({ listarUltimasDatasItens: config });
      return contratos.map((codigo) => ({ codigo, ultima_data: "2026-10-01" }));
    },
    async buscarAsOf(filtros) {
      chamadas.push({ buscarAsOf: filtros });
      return linhas.filter(
        (l) =>
          filtros.seriesCodes.includes(l.series_code) &&
          l.published_at <= filtros.asOf &&
          (!filtros.observadoDesde || l.observed_at >= filtros.observadoDesde) &&
          (!filtros.observadoAte || l.observed_at <= filtros.observadoAte)
      );
    }
  };
}

function geopoliticaFalsa() {
  const chamadas = [];
  return {
    chamadas,
    async obterGeopoliticaDoDia(ativo, data) {
      chamadas.push({ obterGeopoliticaDoDia: [ativo, data] });
      return data === "2026-10-02"
        ? { disponivel: true, nivel: "ATENCAO", resumo: "Ormuz.", eventos: [] }
        : { disponivel: false, nivel: null, resumo: null, eventos: [] };
    },
    async listarEventos(filtros) {
      chamadas.push({ listarEventos: filtros });
      return { eventos: [{ id: "e1", titulo: "Aviso UKMTO" }], paginacao: { total: 1 } };
    }
  };
}

test("toda série da lista existe no catálogo de observáveis (com a unidade do campo)", () => {
  for (const ativo of ATIVOS) {
    for (const serie of ativo.series) {
      const item = buscarNoCatalogo(serie.observavel);
      assert.ok(item, `${ativo.codigo}/${serie.codigo}: observável ${serie.observavel} não está no catálogo`);
      assert.equal(item.origem, "observation");
      if (serie.futuro) assert.equal(item.porVencimento?.prefixoSerie, serie.futuro.prefixo);
    }
  }
});

test("sem filtros: 1º ativo, hoje em São Paulo e a 1ª série; preço como era conhecido", async () => {
  const repo = repoCom(
    [linha("B3.GLD.GLDZ26.SETTLE", "2026-09-30", 3800), linha("B3.GLD.GLDZ26.SETTLE", "2026-10-01", 3838)],
    ["GLDZ26", "GLDG27"]
  );
  const { centroDecisao } = await obterCentroDecisao({}, { agora: AGORA, observationRepository: repo, geopoliticaService: geopoliticaFalsa() });

  assert.equal(centroDecisao.data, "2026-10-02");
  assert.equal(centroDecisao.ativo.codigo, "OURO");
  assert.equal(centroDecisao.preco.codigo, "GLD");
  assert.equal(centroDecisao.preco.valor, 3838);
  assert.equal(centroDecisao.preco.dataReferencia, "2026-10-01");
  assert.equal(centroDecisao.preco.unidade, "US$/oz");
  assert.equal(centroDecisao.preco.tempoReal, false);
  assert.deepEqual(centroDecisao.preco.contrato, { ticker: "GLDZ26", rotulo: "GLDZ26 (dez/2026)" });
  assert.equal(centroDecisao.preco.variacoes.d1.percentual.toFixed(2), "1.00");
  // hoje: asOf é o agora, não o fim do dia
  const consulta = repo.chamadas.find((c) => c.buscarAsOf).buscarAsOf;
  assert.equal(consulta.asOf.getTime(), AGORA.getTime());
  assert.equal(centroDecisao.geopolitica.nivel, "ATENCAO");
});

test("futuro: o vencimento mais próximo que negociou no último pregão até a data, sem emendar contratos", async () => {
  const repo = repoCom(
    [
      // O contrato de out/26 parou em 29/09 (venceu); o de dez/26 negociou em 30/09.
      linha("B3.GLD.GLDV26.SETTLE", "2026-09-29", 3700),
      linha("B3.GLD.GLDZ26.SETTLE", "2026-09-29", 3790),
      linha("B3.GLD.GLDZ26.SETTLE", "2026-09-30", 3800),
      linha("B3.GLD.GLDG27.SETTLE", "2026-09-30", 3850)
    ],
    ["GLDQ26", "GLDV26", "GLDZ26", "GLDG27"]
  );
  const { centroDecisao } = await obterCentroDecisao(
    { ativo: "OURO", data: "2026-09-30" },
    { agora: AGORA, observationRepository: repo, geopoliticaService: geopoliticaFalsa() }
  );

  assert.equal(centroDecisao.preco.contrato.ticker, "GLDZ26");
  assert.deepEqual(centroDecisao.preco.pontos.map((p) => p.valor), [3790, 3800]);
  // Vencimentos anteriores ao mês da data nem entram na consulta.
  const consulta = repo.chamadas.find((c) => c.buscarAsOf).buscarAsOf;
  assert.ok(!consulta.seriesCodes.includes("B3.GLD.GLDQ26.SETTLE"));
  // Data passada: asOf é o fim do dia em Brasília.
  assert.equal(consulta.asOf.toISOString(), "2026-10-01T02:59:59.999Z");
});

test("data passada: o que foi publicado depois não aparece (point-in-time)", async () => {
  const repo = repoCom([linha("EIA.PETROLEO_PRECOS.WTI", "2026-09-22", 70), { ...linha("EIA.PETROLEO_PRECOS.WTI", "2026-09-23", 71), published_at: new Date("2026-09-30T15:00:00Z") }]);
  const { centroDecisao } = await obterCentroDecisao(
    { ativo: "PETROLEO", data: "2026-09-25" },
    { agora: AGORA, observationRepository: repo, geopoliticaService: geopoliticaFalsa(), analiseDiariaRepository: { buscarAnaliseDoDia: async () => null } }
  );

  assert.equal(centroDecisao.preco.valor, 70);
  assert.equal(centroDecisao.preco.dataReferencia, "2026-09-22");
  assert.equal(centroDecisao.preco.diasSemDado, 3);
  assert.equal(centroDecisao.preco.defasada, false);
  assert.equal(centroDecisao.geopolitica.disponivel, false);
});

test("série sem dado até a data: disponivel false, sem inventar valor", async () => {
  const repo = repoCom([], ["GLDZ26"]);
  const { centroDecisao } = await obterCentroDecisao(
    { ativo: "OURO", data: "2025-01-10" },
    { agora: AGORA, observationRepository: repo, geopoliticaService: geopoliticaFalsa() }
  );
  assert.equal(centroDecisao.preco.disponivel, false);
  assert.equal(centroDecisao.preco.valor, undefined);
});

test("série encerrada: o último valor aparece com o aviso de defasagem e a data de encerramento", async () => {
  const repo = repoCom([linha("LBMA.GOLD_PM.USD", "2026-09-30", 3810)]);
  const { centroDecisao } = await obterCentroDecisao(
    { ativo: "OURO", serie: "LBMA", data: "2026-10-02" },
    { agora: AGORA, observationRepository: repo, geopoliticaService: geopoliticaFalsa() }
  );
  assert.equal(centroDecisao.preco.encerradaEm, "2026-10-01");
  assert.equal(centroDecisao.preco.valor, 3810);
});

test("milho e café também têm a leitura de eventos de mercado (ADR 0049)", async () => {
  const geo = geopoliticaFalsa();
  const repo = repoCom([linha("B3.MILHO_ESALQ.AVISTA_BRL", "2026-10-01", 65.4)]);
  const { centroDecisao } = await obterCentroDecisao({ ativo: "MILHO" }, { agora: AGORA, observationRepository: repo, geopoliticaService: geo });
  assert.equal(centroDecisao.preco.unidade, "R$/saca");
  assert.deepEqual(geo.chamadas.find((c) => c.obterGeopoliticaDoDia).obterGeopoliticaDoDia, ["MILHO", "2026-10-02"]);
  assert.equal(centroDecisao.geopolitica.nivel, "ATENCAO");
});

test("eventos: os aceitos da semana que termina na data, do ativo escolhido", async () => {
  const geo = geopoliticaFalsa();
  await obterCentroDecisao(
    { ativo: "PETROLEO", data: "2026-10-02" },
    { agora: AGORA, observationRepository: repoCom([]), geopoliticaService: geo, analiseDiariaRepository: { buscarAnaliseDoDia: async () => null } }
  );
  const { listarEventos } = geo.chamadas.find((c) => c.listarEventos);
  assert.deepEqual(
    { ativo: listarEventos.ativo, situacao: listarEventos.situacao, dataInicio: listarEventos.dataInicio, dataFim: listarEventos.dataFim },
    { ativo: "PETROLEO", situacao: "aceitos", dataInicio: "2026-09-26", dataFim: "2026-10-02" }
  );
});

test("leitura de tendência da IA (ADR 0052): só no petróleo, a da data escolhida", async () => {
  const pedidas = [];
  const analiseDiariaRepository = {
    buscarAnaliseDoDia: async (ativo, data) => {
      pedidas.push([ativo, data]);
      return data === "2026-10-02"
        ? {
            data_analise: data,
            created_at: "2026-10-02T04:10:00.000Z",
            entrada: {
              precoReferencia: { serie: "WTI", dataReferencia: "2026-09-29", valor: 96.16 },
              horizontes: [{ codigo: "IMEDIATO", dias: 1, t1: 1, t2: 2.5 }]
            },
            leituras: [{ horizonte: "IMEDIATO", tendencia: "ALTA" }],
            modelo: "gemini-x",
            chave: "gratuita",
            tokens: 100,
            versao_prompt: "petroleo-analise-diaria@1",
            versao_metodologia: "petroleo-v1",
            versao_configuracao: 1,
            hash_entrada: "abc"
          }
        : null;
    }
  };
  const deps = { agora: AGORA, observationRepository: repoCom([]), geopoliticaService: geopoliticaFalsa(), analiseDiariaRepository };

  const { centroDecisao: petroleo } = await obterCentroDecisao({ ativo: "PETROLEO", data: "2026-10-02" }, deps);
  assert.equal(petroleo.analise.disponivel, true);
  assert.deepEqual(petroleo.analise.precoReferencia, { serie: "WTI", dataReferencia: "2026-09-29", valor: 96.16 });
  assert.deepEqual(
    petroleo.analise.horizontes.map((h) => [h.codigo, h.t1, h.t2]),
    [["IMEDIATO", 1, 2.5], ["CURTO", null, null], ["MEDIO", null, null], ["LONGO", null, null]]
  );
  assert.equal(petroleo.analise.proveniencia.hashEntrada, "abc");

  // Sem leitura na data: não usa a de outro dia.
  const { centroDecisao: semLeitura } = await obterCentroDecisao({ ativo: "PETROLEO", data: "2026-10-01" }, deps);
  assert.deepEqual(semLeitura.analise, { disponivel: false, data: "2026-10-01" });

  // Ativo sem leitura diária: null, e o repositório nem é consultado.
  const { centroDecisao: ouro } = await obterCentroDecisao({ ativo: "OURO", data: "2026-10-02" }, deps);
  assert.equal(ouro.analise, null);
  assert.deepEqual(pedidas, [["PETROLEO", "2026-10-02"], ["PETROLEO", "2026-10-01"]]);
});

test("filtros inválidos: ativo, série e data futura", async () => {
  const deps = { agora: AGORA, observationRepository: repoCom([]), geopoliticaService: geopoliticaFalsa() };
  await assert.rejects(obterCentroDecisao({ ativo: "SOJA" }, deps), /ativo/);
  await assert.rejects(obterCentroDecisao({ ativo: "OURO", serie: "WTI" }, deps), /serie/);
  await assert.rejects(obterCentroDecisao({ data: "2026-10-03" }, deps), /futura/);
  await assert.rejects(obterCentroDecisao({ data: "02/10/2026" }, deps), /AAAA-MM-DD/);
});

test("variações: ponto anterior, último ponto até N dias antes; série mensal sem 1 e 7 dias", () => {
  const pontos = [
    { data: "2026-07-01", valor: 100 },
    { data: "2026-09-01", valor: 110 },
    { data: "2026-09-24", valor: 118 },
    { data: "2026-09-30", valor: 120 },
    { data: "2026-10-01", valor: 121 }
  ];
  const diaria = calcularVariacoes(pontos, "DIARIA");
  assert.equal(diaria.d1.desde, "2026-09-30");
  assert.equal(diaria.d7.desde, "2026-09-24");
  assert.equal(diaria.d30.desde, "2026-09-01");
  assert.equal(diaria.d90.desde, "2026-07-01");
  assert.equal(diaria.d90.percentual, 21);

  const mensal = calcularVariacoes(pontos, "MENSAL");
  assert.equal(mensal.d1, null);
  assert.equal(mensal.d7, null);
  assert.ok(mensal.d30);

  assert.equal(calcularVariacoes([{ data: "2026-10-01", valor: 1 }], "DIARIA").d1, null);
});
