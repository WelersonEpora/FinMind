"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const collector = require("./b3-ccm-bdi.collector");

afterEach(() => mock.restoreAll());

const loggerMudo = { info: () => {}, warn: () => {}, error: () => {} };

// Um pregão como o download devolve (valores reais do BDI de 2023-01-16).
const diaOk = (data = "2023-01-16", linhas = null) => ({
  data,
  situacao: "ok",
  formato: "en",
  arquivo: `BDI_03-1_${data.replace(/-/g, "")}.pdf`,
  url: `https://arquivos.b3.com.br/bdi/download/bdi/${data}/BDI_03-1_${data.replace(/-/g, "")}.pdf`,
  publicacao: { status: "Publicado", atualizadoEm: "2023-01-17T08:00:38.427", errata: false },
  linhas: linhas || [
    { vencimento: "F23", valores: { OPEN_INTEREST: 9677, TRADES: 360, CONTRACTS: 1020, VOLUME_BRL: 39894242, OPEN: 87.04, LOW: 86.8, HIGH: 87.04, AVG: 86.91, LAST: 86.84, SETTLE: 86.71 } },
    { vencimento: "F24", valores: { OPEN_INTEREST: 654, TRADES: null, CONTRACTS: null, VOLUME_BRL: null, OPEN: null, LOW: null, HIGH: null, AVG: null, LAST: null, SETTLE: 93.73 } }
  ],
  invalidos: []
});

test("normalize: cada campo do vencimento vira uma série B3.CCM.<TICKER>.<CAMPO>, sem gravar as células vazias", () => {
  const { validos, invalidos } = collector.normalize(collector.parse([diaOk()]));

  assert.equal(invalidos.length, 0);
  assert.equal(validos.length, 12); // F23: 10 campos; F24: só contratos em aberto e ajuste
  const oi = validos.find((v) => v.series_code === "B3.CCM.CCMF23.OPEN_INTEREST");
  assert.equal(oi.value, 9677);
  assert.equal(oi.unit, "contratos");
  assert.equal(oi.observed_at, "2023-01-16");
  assert.equal(oi.source_code, "B3");
  assert.equal(validos.find((v) => v.series_code === "B3.CCM.CCMF23.OPEN").unit, "BRL/saca");
  assert.deepEqual(
    validos.filter((v) => v.series_code.startsWith("B3.CCM.CCMF24.")).map((v) => v.series_code),
    ["B3.CCM.CCMF24.OPEN_INTEREST", "B3.CCM.CCMF24.SETTLE"]
  );
});

test("normalize: published_at segue a regra do coletor CSV (fim do pregão em Brasília, estimado) e o BDI fica rastreável", () => {
  const settle = collector.normalize(collector.parse([diaOk()])).validos.find((v) => v.series_code === "B3.CCM.CCMF23.SETTLE");

  assert.equal(settle.published_at.toISOString(), "2023-01-17T02:59:59.000Z");
  assert.equal(settle.published_at_is_estimated, true);
  assert.equal(settle.published_at_basis, "lag_rule");
  assert.equal(settle.metadata.bdiStatus, "Publicado");
  assert.equal(settle.metadata.bdiAtualizadoEm, "2023-01-17T08:00:38.427");
  assert.equal(settle.metadata.arquivo, "BDI_03-1_20230116.pdf");
  assert.equal(settle.metadata.vencimento, "2023-01");
  assert.equal(settle.metadata.campoFonte, "Ajuste");
  assert.equal(settle.metadata.formatoNumerico, "en");
});

test("parse: feriado (sem boletim) e boletim sem tabela não são erro; erro real e linha inválida viram inválidos", () => {
  const dias = [
    diaOk(),
    { data: "2023-02-20", situacao: "sem_boletim" },
    { data: "2023-07-03", situacao: "sem_tabela", motivo: "Boletim sem a tabela" },
    { data: "2023-07-04", situacao: "erro", motivo: "Download do BDI_03-1_20230704.pdf: HTTP 500" },
    { ...diaOk("2023-07-05"), invalidos: [{ vencimento: "H23", motivo: "12 valores em vez de 13" }] }
  ];

  const { validos, invalidos } = collector.normalize(collector.parse(dias));

  assert.equal(validos.length, 24);
  assert.deepEqual(
    invalidos.map((i) => i.motivo),
    ["BDI 2023-07-04: Download do BDI_03-1_20230704.pdf: HTTP 500", "BDI 2023-07-05: H23: 12 valores em vez de 13"]
  );
});

test("parse falha alto se nenhum boletim publicado da janela teve a tabela lida (fonte mudou ou layout novo)", () => {
  const dias = ["2025-12-15", "2025-12-16", "2025-12-17", "2025-12-18"].map((data) => ({ data, situacao: "sem_tabela", motivo: "Boletim no layout novo" }));

  assert.throws(() => collector.parse(dias), /Nenhum dos 4 boletins/);
  assert.throws(() => collector.parse("x"), /formato inesperado/);
});

test("persist é complementar: grava só o que não existe e nunca revisa o que já está no banco", async () => {
  const { validos } = collector.normalize(collector.parse([diaOk()]));
  // O CSV do Up2Data já gravou o ajuste e o volume do F23 nesse pregão (volume com centavos).
  const existentes = {
    "B3.CCM.CCMF23.SETTLE": new Map([["2023-01-16", { value: "86.710000" }]]),
    "B3.CCM.CCMF23.VOLUME_BRL": new Map([["2023-01-16", { value: "39894241.500000" }]])
  };
  const repo = { buscarUltimasVersoes: async (serie) => existentes[serie] || new Map() };
  let gravados = null;
  const pointInTimeService = {
    registrarObservacoes: async (obs) => {
      gravados = obs;
      return { criados: obs.length, atualizados: 0, ignorados: 0, falhas: [] };
    }
  };

  const r = await collector.persist(validos, { execucaoId: "e1" }, { observationRepository: repo, pointInTimeService, logger: loggerMudo });

  assert.equal(gravados.length, 10);
  assert.ok(!gravados.some((v) => v.series_code === "B3.CCM.CCMF23.SETTLE" || v.series_code === "B3.CCM.CCMF23.VOLUME_BRL"));
  assert.deepEqual({ criados: r.criados, atualizados: r.atualizados, ignorados: r.ignorados }, { criados: 10, atualizados: 0, ignorados: 2 });
  // Volume arredondado pelo BDI (39.894.242 x 39.894.241,50) está dentro da tolerância: não é divergência.
  assert.deepEqual(r.divergencias, []);
});

test("persist mede a divergência real entre o BDI e o valor já gravado, sem regravar", async () => {
  const { validos } = collector.normalize(collector.parse([diaOk()]));
  const repo = {
    buscarUltimasVersoes: async (serie) => (serie === "B3.CCM.CCMF23.SETTLE" ? new Map([["2023-01-16", { value: "86.900000" }]]) : new Map())
  };
  const avisos = [];
  const pointInTimeService = { registrarObservacoes: async (obs) => ({ criados: obs.length, atualizados: 0, ignorados: 0, falhas: [] }) };

  const r = await collector.persist(validos, { execucaoId: "e1" }, { observationRepository: repo, pointInTimeService, logger: { ...loggerMudo, warn: (dados) => avisos.push(dados) } });

  assert.deepEqual(r.divergencias, [{ serie: "B3.CCM.CCMF23.SETTLE", pregao: "2023-01-16", noBanco: 86.9, noBdi: 86.71 }]);
  assert.equal(r.ignorados, 1);
  assert.equal(avisos.length, 1);
});

test("persist reexecutado com tudo já gravado não grava nada (idempotente)", async () => {
  const { validos } = collector.normalize(collector.parse([diaOk()]));
  const repo = { buscarUltimasVersoes: async () => new Map([["2023-01-16", { value: "0" }]]) };
  const valorPorSerie = new Map(validos.map((v) => [v.series_code, v.value]));
  repo.buscarUltimasVersoes = async (serie) => new Map([["2023-01-16", { value: String(valorPorSerie.get(serie)) }]]);
  let chamadas = 0;
  const pointInTimeService = {
    registrarObservacoes: async (obs) => {
      chamadas += obs.length;
      return { criados: 0, atualizados: 0, ignorados: 0, falhas: [] };
    }
  };

  const r = await collector.persist(validos, { execucaoId: "e2" }, { observationRepository: repo, pointInTimeService, logger: loggerMudo });

  assert.equal(chamadas, 0);
  assert.deepEqual({ criados: r.criados, ignorados: r.ignorados }, { criados: 0, ignorados: 12 });
});

// Resposta mínima de fetch (o ESLint do projeto não declara `Response` como global).
const resposta = (status, json) => ({
  ok: status >= 200 && status < 300,
  status,
  arrayBuffer: async () => {
    const buf = Buffer.from(json === undefined ? "" : JSON.stringify(json), "utf8");
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
});

test("baixarDia: data sem boletim no BDI (feriado) não baixa o PDF", async () => {
  const urls = [];
  mock.method(globalThis, "fetch", async (url) => {
    urls.push(url);
    return resposta(200, { chapters: [], statusName: null, url: null, lastUpdateDate: "0001-01-01T00:00:00" });
  });

  const dia = await collector.baixarDia("2023-02-20");

  assert.equal(dia.situacao, "sem_boletim");
  assert.deepEqual(urls, ["https://arquivos.b3.com.br/bdi/download/status?dateRef=2023-02-20"]);
});

test("baixarDia: boletim publicado cujo PDF não baixa é erro (com o status do BDI preservado)", async () => {
  mock.method(globalThis, "fetch", async (url) =>
    url.includes("/status?") ? resposta(200, { statusName: "Republicado", lastUpdateDate: "2023-07-05T04:05:38.73" }) : resposta(404)
  );

  const dia = await collector.baixarDia("2023-07-04");

  assert.equal(dia.situacao, "erro");
  assert.match(dia.motivo, /BDI_03-1_20230704\.pdf: HTTP 404/);
  assert.equal(dia.publicacao.status, "Republicado");
});

test("resumirDias separa feriados, boletins sem tabela e erros, e conta os formatos numéricos", () => {
  const resumo = collector.resumirDias([
    { data: "2023-01-16", situacao: "ok", formato: "en" },
    { data: "2023-02-20", situacao: "sem_boletim" },
    { data: "2023-07-03", situacao: "sem_tabela", motivo: "sem a tabela" },
    { data: "2024-07-15", situacao: "ok", formato: "pt" },
    { data: "2024-07-16", situacao: "erro", motivo: "HTTP 500" }
  ]);

  assert.deepEqual(resumo, {
    diasUteis: 5,
    comTabela: 2,
    primeiroComTabela: "2023-01-16",
    ultimoComTabela: "2024-07-15",
    semBoletim: ["2023-02-20"],
    semTabela: [{ data: "2023-07-03", motivo: "sem a tabela" }],
    erros: [{ data: "2024-07-16", motivo: "HTTP 500" }],
    formatos: { en: 1, pt: 1 }
  });
});
