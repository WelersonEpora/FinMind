"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const collector = require("./b3-ccm.collector");

afterEach(() => mock.restoreAll());

const COLUNAS = "RptDt;TckrSymb;ISIN;SgmtNm;MinPric;MaxPric;TradAvrgPric;LastPric;OscnPctg;AdjstdQt;AdjstdQtTax;RefPric;TradQty;FinInstrmQty;NtlFinVol";

// Linhas reais do arquivo de 2026-09-18 (CCMF27 e CCMH27), mais os "falsos
// positivos" que o arquivo de fato contém: CCME11 (segmento CASH), uma opção e
// outro derivativo. CCMK27 aqui simula um vencimento sem negócios no dia.
const LINHAS = [
  "2026-09-18;03BK11;BR03BKCTF019;FORWARD;51,59;51,7;51,66;51,59;0;;;;3;250;12917,45",
  "2026-09-18;CCME11;BRCCMECTF007;CASH;8,6;8,89;8,7;8,61;-1,71;;;;547;21878;189223,32",
  "2026-09-18;CCMF27;BRBMEFCCP353;AGRIBUSINESS;79,84;80,81;80,48;80,1;-0,24;80,17;;;910;2446;88592341,5",
  "2026-09-18;CCMF27C006800;BRBMEFFM0BV3;AGRIBUSINESS;;;;;;;;11,7;;;",
  "2026-09-18;CCMH27;BRBMEFCCP361;AGRIBUSINESS;81,67;82,39;82,02;81,95;0,07;81,83;;;398;510;18824085",
  "2026-09-18;CCMK27;BRBMEFCCP338;AGRIBUSINESS;;;;;;80,29;;;;;",
  "2026-09-18;DOLF27;BRBMEFDOL123;FINANCIAL;5000;5100;5050;5075;0,1;5080;;;10;20;1000"
];
// Resposta mínima de fetch (o ESLint do projeto não declara `Response` como global).
const resposta = (status, { json, texto } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => json,
  arrayBuffer: async () => {
    const buf = Buffer.from(texto ?? "", "latin1");
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
});

const csv = (status = "Final", colunas = COLUNAS) => [`Status do Arquivo: ${status}`, colunas, ...LINHAS].join("\r\n");

test("extrairFuturosCcm guarda só os futuros CCM: descarta CCME11 (CASH), opções e outros derivativos", () => {
  const { situacao, linhas } = collector.extrairFuturosCcm(csv());

  assert.equal(situacao, "final");
  assert.deepEqual(linhas.map((l) => l.split(";")[1]), ["CCMF27", "CCMH27", "CCMK27"]);
});

test("extrairFuturosCcm: só aceita arquivo Final, com colunas conhecidas; vazio é 'sem arquivo'", () => {
  assert.equal(collector.extrairFuturosCcm(csv("Preliminar")).situacao, "nao_final");
  assert.equal(collector.extrairFuturosCcm(csv("Final", COLUNAS.replace("AdjstdQt;", "Ajuste;"))).situacao, "erro");
  assert.equal(collector.extrairFuturosCcm("Outra coisa\r\nx").situacao, "erro");
  assert.equal(collector.extrairFuturosCcm("").situacao, "vazio");
});

test("normalize interpreta o CCMF27: vírgula decimal, cada campo vira uma série do vencimento", () => {
  const { linhas } = collector.extrairFuturosCcm(csv());
  const { validos, invalidos } = collector.normalize(collector.parse([{ data: "2026-09-18", situacao: "final", linhas }]));
  assert.equal(invalidos.length, 0);

  const f27 = Object.fromEntries(validos.filter((v) => v.series_code.startsWith("B3.CCM.CCMF27.")).map((v) => [v.series_code.split(".")[3], v]));
  assert.deepEqual(Object.keys(f27).sort(), ["AVG", "CONTRACTS", "HIGH", "LAST", "LOW", "OSCN_PCT", "SETTLE", "TRADES", "VOLUME_BRL"]);
  assert.equal(f27.SETTLE.value, 80.17, "AdjstdQt = preço de ajuste");
  assert.equal(f27.LAST.value, 80.1);
  assert.equal(f27.HIGH.value, 80.81);
  assert.equal(f27.LOW.value, 79.84);
  assert.equal(f27.OSCN_PCT.value, -0.24);
  assert.equal(f27.CONTRACTS.value, 2446);
  assert.equal(f27.TRADES.value, 910);
  assert.equal(f27.VOLUME_BRL.value, 88592341.5);
  assert.equal(f27.SETTLE.unit, "BRL/saca");
  assert.equal(f27.SETTLE.observed_at, "2026-09-18");
  assert.equal(f27.SETTLE.metadata.vencimento, "2027-01", "F = janeiro, 27 = 2027");
  assert.equal(f27.SETTLE.metadata.isin, "BRBMEFCCP353");
});

test("cada vencimento é preservado separadamente (sem série contínua)", () => {
  const { linhas } = collector.extrairFuturosCcm(csv());
  const { validos } = collector.normalize(collector.parse([{ data: "2026-09-18", situacao: "final", linhas }]));

  const settle = validos.filter((v) => v.series_code.endsWith(".SETTLE")).map((v) => [v.series_code, v.value, v.metadata.vencimento]);
  assert.deepEqual(settle, [
    ["B3.CCM.CCMF27.SETTLE", 80.17, "2027-01"],
    ["B3.CCM.CCMH27.SETTLE", 81.83, "2027-03"],
    ["B3.CCM.CCMK27.SETTLE", 80.29, "2027-05"]
  ]);
});

test("vencimento sem negócios no dia grava só o que existe (o preço de ajuste), sem inventar zeros", () => {
  const { linhas } = collector.extrairFuturosCcm(csv());
  const { validos } = collector.normalize(collector.parse([{ data: "2026-09-18", situacao: "final", linhas }]));

  assert.deepEqual(validos.filter((v) => v.series_code.startsWith("B3.CCM.CCMK27.")).map((v) => v.series_code), ["B3.CCM.CCMK27.SETTLE"]);
});

test("published_at: fim do dia do pregão em Brasília (UTC-3), estimado", () => {
  const { linhas } = collector.extrairFuturosCcm(csv());
  const { validos } = collector.normalize(collector.parse([{ data: "2026-09-18", situacao: "final", linhas }]));

  assert.equal(validos[0].published_at.toISOString(), "2026-09-19T02:59:59.000Z");
  assert.equal(validos[0].published_at_is_estimated, true);
  assert.equal(validos[0].published_at_basis, "lag_rule");
});

test("parse: feriado (sem arquivo) não é erro; arquivo não final ou com layout novo vira item inválido", () => {
  const { linhas } = collector.extrairFuturosCcm(csv());
  const itens = collector.parse([
    { data: "2026-09-14", situacao: "indisponivel", linhas: [], motivo: "HTTP 400" },
    { data: "2026-09-15", situacao: "vazio", linhas: [] },
    { data: "2026-09-16", situacao: "nao_final", linhas: [], motivo: 'Status do arquivo: "Preliminar".' },
    { data: "2026-09-17", situacao: "erro", linhas: [], motivo: "Colunas diferentes" },
    { data: "2026-09-18", situacao: "final", linhas }
  ]);
  const { validos, invalidos } = collector.normalize(itens);

  assert.ok(validos.length > 0);
  assert.equal(invalidos.length, 2);
  assert.match(invalidos[0].motivo, /2026-09-16/);
});

test("parse falha alto quando nenhum pregão devolve arquivo numa janela de vários dias úteis (fonte caiu/mudou)", () => {
  const semArquivo = ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"].map((data) => ({ data, situacao: "indisponivel", linhas: [], motivo: "HTTP 400" }));

  assert.throws(() => collector.parse(semArquivo), /nenhum arquivo final/);
});

test("downloadIntervalo: pula fins de semana e baixa cada pregão em 2 etapas (fetch mockado)", async () => {
  const chamadas = [];
  mock.method(global, "fetch", async (url) => {
    chamadas.push(String(url));
    if (String(url).includes("requestname")) {
      return resposta(200, { json: { redirectUrl: "~/download?token=abc" } });
    }
    return resposta(200, { texto: csv() });
  });

  // 2026-09-18 = sexta; 19 e 20 = fim de semana; 21 = segunda
  const dias = await collector.downloadIntervalo({ dataInicial: "2026-09-18", dataFinal: "2026-09-21" });

  assert.deepEqual(dias.map((d) => [d.data, d.situacao, d.linhas.length]), [["2026-09-18", "final", 3], ["2026-09-21", "final", 3]]);
  assert.equal(chamadas.filter((u) => u.includes("requestname")).length, 2, "sábado e domingo não são pedidos");
  assert.ok(chamadas[0].includes("fileName=TradeInformationConsolidatedFile&date=2026-09-18"));
});

test("downloadIntervalo: data sem arquivo (HTTP 4xx) vira 'indisponivel', não derruba a coleta", async () => {
  mock.method(global, "fetch", async () => resposta(400));

  const [dia] = await collector.downloadIntervalo({ dataInicial: "2016-06-17", dataFinal: "2016-06-17" });

  assert.equal(dia.situacao, "indisponivel");
});
