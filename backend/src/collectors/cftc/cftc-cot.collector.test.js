"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarColetorCot, liberacaoPrevista } = require("./cftc-cot.collector");

const BULK = "2022-08-01T18:54:48.615Z"; // carga em lote real do Socrata

function linha(data, updatedAt, extra = {}) {
  return {
    ":updated_at": updatedAt,
    report_date_as_yyyy_mm_dd: `${data}T00:00:00.000`,
    market_and_exchange_names: "GOLD - COMMODITY EXCHANGE INC.",
    open_interest_all: "409899",
    m_money_positions_long_all: "142394",
    m_money_positions_short_all: "9278",
    ...extra
  };
}

// Simula uma carga em lote: >10 linhas com o MESMO :updated_at.
function cargaEmLote(n = 12) {
  return Array.from({ length: n }, (_, i) => linha(`2020-01-${String(7 + 7 * i).padStart(2, "0")}`.replace(/-(\d{2})$/, (m, d) => `-${Math.min(Number(d), 28)}`), BULK)).map((l, i) => ({
    ...l,
    report_date_as_yyyy_mm_dd: `${new Date(Date.UTC(2020, 0, 7 + 7 * i)).toISOString().slice(0, 10)}T00:00:00.000`
  }));
}

test("liberacaoPrevista: terça -> sexta 15:30 ET, com o horário de verão de cada época", () => {
  assert.equal(liberacaoPrevista("2026-09-15").toISOString(), "2026-09-18T19:30:00.000Z"); // EDT
  assert.equal(liberacaoPrevista("2025-11-18").toISOString(), "2025-11-21T20:30:00.000Z"); // EST
});

test("cada linha da CFTC vira 3 observações BRUTAS (posição líquida é fator, não é gravada)", () => {
  const coletor = criarColetorCot("gold");
  const { validos, invalidos } = coletor.normalize([linha("2026-09-15", "2026-09-18T19:30:07.471Z")]);

  assert.equal(invalidos.length, 0);
  assert.deepEqual(validos.map((v) => [v.series_code, v.value]), [
    ["CFTC.GOLD.OPEN_INTEREST", 409899],
    ["CFTC.GOLD.MM_LONG", 142394],
    ["CFTC.GOLD.MM_SHORT", 9278]
  ]);
  assert.equal(validos[0].unit, "contratos");
});

test("timestamp REAL do Socrata (publicação ao vivo) é usado e NÃO é marcado como estimado", () => {
  const { validos } = criarColetorCot("gold").normalize([linha("2026-09-15", "2026-09-18T19:30:07.471Z")]);

  assert.equal(validos[0].published_at.toISOString(), "2026-09-18T19:30:07.471Z");
  assert.equal(validos[0].published_at_is_estimated, false);
  assert.equal(validos[0].published_at_basis, "source");
});

test("atraso real (shutdown 2025): a publicação vem do timestamp da fonte, 50 dias depois, e não da regra 'sexta'", () => {
  const { validos } = criarColetorCot("gold").normalize([linha("2025-09-30", "2025-11-19T20:30:44.000Z")]);

  assert.equal(validos[0].published_at.toISOString(), "2025-11-19T20:30:44.000Z");
  assert.equal(validos[0].published_at_is_estimated, false);
  assert.ok(validos[0].published_at > liberacaoPrevista("2025-09-30"), "bem depois do previsto");
});

test("carga em lote (mesmo :updated_at em muitas linhas) é IGNORADA como publicação: cai na regra e fica estimada", () => {
  const { validos } = criarColetorCot("gold").normalize(cargaEmLote());

  assert.ok(validos.length > 0);
  for (const v of validos) {
    assert.equal(v.published_at_is_estimated, true);
    assert.equal(v.metadata.motivo, "carga_em_lote");
    assert.equal(v.published_at.getUTCDay(), 5, "sexta");
  }
  assert.equal(validos[0].published_at.toISOString(), "2020-01-10T20:30:00.000Z");
});

test(":updated_at anterior à data em que a CFTC recebe os dados é implausível -> regra", () => {
  const { validos } = criarColetorCot("gold").normalize([linha("2026-09-15", "2026-01-01T00:00:00Z")]);

  assert.equal(validos[0].published_at_is_estimated, true);
  assert.equal(validos[0].metadata.motivo, "updated_at_ausente_ou_implausivel");
});

test("campo numérico ausente vira inválido, sem descartar os outros campos da mesma linha", () => {
  const { validos, invalidos } = criarColetorCot("corn").normalize([linha("2026-09-15", "2026-09-18T19:30:07Z", { m_money_positions_long_all: undefined })]);

  assert.equal(validos.length, 2);
  assert.equal(invalidos.length, 1);
  assert.equal(validos[0].series_code.startsWith("CFTC.CORN."), true);
});

test("contrato desconhecido falha cedo", () => {
  assert.throws(() => criarColetorCot("soja"), /desconhecido/);
});
