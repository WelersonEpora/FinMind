"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const { dataAlvoDoHorizonte } = require("../shared/analise-diaria-base");
const assert = require("node:assert/strict");
const { apurarRealizado, apurarRealizados, apurarHorizonte, SERIES_DE_REFERENCIA } = require("./realizado-analise.service");
const { ATIVOS } = require("./centro-decisao.service");
const { somarDias } = require("../shared/utils/date-utils");

// 2026-12-20 12:00 em Brasília: os quatro horizontes de uma leitura de 2026-09-01 já fecharam.
const AGORA = new Date("2026-12-20T15:00:00Z");

const FAIXAS = [
  { codigo: "IMEDIATO", dias: 1, t1: 1, t2: 2.5 },
  { codigo: "CURTO", dias: 7, t1: 2, t2: 5 },
  { codigo: "MEDIO", dias: 30, t1: 4, t2: 10 },
  { codigo: "LONGO", dias: 90, t1: 8, t2: 18 }
];

// Uma leitura como analise-diaria.service.js::leituraGravada a devolve: os horizontes com a data-alvo gravada.
function analise({ serie, contrato = null, seriesCode, data = "2026-09-01", valor = 99, recebidoEm = somarDias(data, -1), referencia = "DATA_DA_ANALISE" } = {}) {
  const dataReferencia = referencia === "DATA_DA_ANALISE" ? data : recebidoEm;
  return {
    disponivel: true,
    data,
    precoReferencia: { serie, seriesCode, contrato, dataReferencia: recebidoEm, valor },
    referenciaHorizontes: { tipo: referencia, data: dataReferencia },
    horizontes: FAIXAS.map((h) => ({ ...h, dataAlvo: dataAlvoDoHorizonte(referencia, { dataAnalise: data, dataPreco: recebidoEm, dias: h.dias }) }))
  };
}

function repoCom(pontos) {
  const chamadas = [];
  return {
    chamadas,
    async buscarAsOf(filtros) {
      chamadas.push(filtros);
      return pontos
        .filter(([codigo, data]) => filtros.seriesCodes.includes(codigo) && data >= filtros.observadoDesde && data <= filtros.observadoAte)
        .map(([codigo, data, valor]) => ({ series_code: codigo, observed_at: data, value: String(valor) }));
    }
  };
}

const BRENT = "EIA.PETROLEO_PRECOS.BRENT";

test("à vista: a variação parte da BASE DA AVALIAÇÃO (o preço da data da análise), não do preço que a IA recebeu", async () => {
  const repo = repoCom([
    [BRENT, "2026-08-31", 99], // o preço que a IA recebeu
    [BRENT, "2026-09-01", 100], // a base: o da data da análise, conhecido depois
    [BRENT, "2026-09-02", 101.5], // +1,5%: alta leve no imediato (1 <= 1,5 < 2,5)
    [BRENT, "2026-09-08", 98.5], // -1,5%: lateral no curto (|v| < 2)
    [BRENT, "2026-10-01", 111], // +11%: alta forte no médio (>= 10)
    [BRENT, "2026-10-02", 111],
    [BRENT, "2026-11-30", 85], // -15%: baixa leve no longo (8 <= 15 < 18)
    [BRENT, "2026-12-01", 85]
  ]);
  const { seriesCode, base, horizontes } = await apurarRealizado(analise({ serie: "BRENT" }), { agora: AGORA }, { observationRepository: repo });

  assert.equal(seriesCode, BRENT);
  assert.deepEqual(base, { data: "2026-09-01", valor: 100, naDataDaAnalise: true, confirmada: true });
  assert.deepEqual(
    horizontes.map((h) => [h.horizonte, h.situacao, h.dataAlvo, h.dataPreco, h.faixa]),
    [
      ["IMEDIATO", "APURADO", "2026-09-02", "2026-09-02", "ALTA_LEVE"],
      ["CURTO", "APURADO", "2026-09-08", "2026-09-08", "LATERAL"],
      ["MEDIO", "APURADO", "2026-10-01", "2026-10-01", "ALTA_FORTE"],
      ["LONGO", "APURADO", "2026-11-30", "2026-11-30", "BAIXA_LEVE"]
    ]
  );
  assert.ok(Math.abs(horizontes[3].variacaoPct - -15) < 1e-9);
  // Uma consulta só, desde o preço recebido até hoje, na versão mais recente (asOf = agora).
  assert.equal(repo.chamadas.length, 1);
  assert.deepEqual([repo.chamadas[0].observadoDesde, repo.chamadas[0].observadoAte, repo.chamadas[0].asOf], ["2026-08-31", "2026-12-20", AGORA]);
});

test("base: sem pregão na data da análise (domingo), a do último pregão até ela, marcada fora da data", async () => {
  const repo = repoCom([
    [BRENT, "2026-09-04", 100], // sexta
    [BRENT, "2026-09-07", 103], // segunda: +3%
    [BRENT, "2026-09-08", 103]
  ]);
  const leitura = analise({ serie: "BRENT", data: "2026-09-06", recebidoEm: "2026-09-04" });
  const { base, horizontes } = await apurarRealizado(leitura, { agora: AGORA }, { observationRepository: repo });
  assert.deepEqual(base, { data: "2026-09-04", valor: 100, naDataDaAnalise: false, confirmada: true });
  assert.deepEqual([horizontes[0].situacao, horizontes[0].faixa], ["APURADO", "ALTA_FORTE"]);
});

test("base provisória: o preço da data da análise ainda não chegou (o Brent da EIA, semanal)", async () => {
  const repo = repoCom([[BRENT, "2026-08-28", 99]]);
  const leitura = analise({ serie: "BRENT", data: "2026-09-01", recebidoEm: "2026-08-28" });
  const { base, horizontes } = await apurarRealizado(leitura, { agora: new Date("2026-09-03T15:00:00Z") }, { observationRepository: repo });
  assert.deepEqual(base, { data: "2026-08-28", valor: 99, naDataDaAnalise: false, confirmada: false });
  assert.deepEqual(horizontes.map((h) => h.situacao), ["AGUARDANDO_DADO", "A_APURAR", "A_APURAR", "A_APURAR"]);
});

test("referência antiga (petróleo v1, horizontes do último preço): a base é o preço que a IA recebeu", async () => {
  const code = "EIA.PETROLEO_PRECOS.WTI";
  const repo = repoCom([
    [code, "2026-08-28", 100],
    [code, "2026-08-31", 102],
    [code, "2026-09-01", 104]
  ]);
  const leitura = analise({ serie: "WTI", data: "2026-09-01", recebidoEm: "2026-08-28", valor: 100, referencia: "DATA_DO_ULTIMO_PRECO" });
  const { seriesCode, base, horizontes } = await apurarRealizado(leitura, { agora: AGORA }, { observationRepository: repo });
  assert.equal(seriesCode, code);
  assert.deepEqual(base, { data: "2026-08-28", valor: 100, naDataDaAnalise: false, doPrecoRecebido: true, confirmada: true });
  // Alvo de 1 dia: 2026-08-29 (sábado) -> o último preço até ele é o da base: sem pregão novo.
  assert.equal(horizontes[0].situacao, "SEM_PREGAO");
});

test("do preço recebido (ADR 0106): a base é o preço que a IA viu e o imediato é o próximo pregão, não antes da leitura", async () => {
  const code = "EIA.PETROLEO_PRECOS.WTI";
  const repo = repoCom([
    [code, "2026-08-28", 100],
    [code, "2026-08-31", 102],
    [code, "2026-09-01", 104],
    [code, "2026-09-02", 106]
  ]);
  // Leitura de segunda (31/08) com o preço de sexta (28/08): o imediato é a própria segunda, o pregão que a IA não viu.
  const leitura = analise({ serie: "WTI", data: "2026-08-31", recebidoEm: "2026-08-28", valor: 100, referencia: "DATA_DO_PRECO_RECEBIDO" });
  const { base, horizontes } = await apurarRealizado(leitura, { agora: AGORA }, { observationRepository: repo });
  assert.deepEqual(base, { data: "2026-08-28", valor: 100, naDataDaAnalise: false, doPrecoRecebido: true, confirmada: true });
  assert.equal(horizontes[0].dataAlvo, "2026-08-31");
  assert.equal(horizontes[0].situacao, "APURADO");
  assert.equal(horizontes[0].dataPreco, "2026-08-31");
  assert.equal(horizontes[0].variacaoPct, 2);
});

test("futuro: o MESMO contrato da leitura, nunca o vencimento mais próximo na data-alvo", async () => {
  const repo = repoCom([
    ["B3.GLD.GLDV26.SETTLE", "2026-08-31", 99],
    ["B3.GLD.GLDV26.SETTLE", "2026-09-01", 100],
    ["B3.GLD.GLDV26.SETTLE", "2026-09-02", 103],
    ["B3.GLD.GLDZ26.SETTLE", "2026-09-02", 500]
  ]);
  const { seriesCode, base, horizontes } = await apurarRealizado(
    analise({ serie: "GLD", contrato: { ticker: "GLDV26", rotulo: "GLDV26 (out/2026)" } }),
    { agora: AGORA },
    { observationRepository: repo }
  );
  assert.equal(seriesCode, "B3.GLD.GLDV26.SETTLE");
  assert.equal(base.valor, 100);
  assert.deepEqual([horizontes[0].situacao, horizontes[0].faixa], ["APURADO", "ALTA_FORTE"]);
  // O contrato parou de negociar (venceu): os horizontes longos ficam SEM_PRECO, não usam outro vencimento.
  assert.deepEqual(horizontes.slice(1).map((h) => h.situacao), ["SEM_PRECO", "SEM_PRECO", "SEM_PRECO"]);
});

test("série: o seriesCode gravado com a leitura vale sobre o mapa fixo", async () => {
  const repo = repoCom([
    ["OUTRA.SERIE", "2026-09-01", 100],
    ["OUTRA.SERIE", "2026-09-02", 100.5]
  ]);
  const { seriesCode } = await apurarRealizado(analise({ serie: "BRENT", seriesCode: "OUTRA.SERIE" }), { agora: AGORA }, { observationRepository: repo });
  assert.equal(seriesCode, "OUTRA.SERIE");
});

test("o mapa fixo das séries de referência bate com as séries do Centro de Decisão de mesmo código", () => {
  for (const [codigo, def] of Object.entries(SERIES_DE_REFERENCIA)) {
    const doCentro = ATIVOS.flatMap((a) => a.series).find((s) => s.codigo === codigo);
    if (!doCentro) continue; // a série saiu do Centro: as leituras antigas continuam com o mapa
    assert.equal(def.observavel, doCentro.observavel, codigo);
    assert.deepEqual(def.futuro ?? null, doCentro.futuro ?? null, codigo);
    assert.equal(def.seriesCode ?? null, doCentro.seriesCode ?? null, codigo);
  }
});

test("lote: várias leituras e séries numa consulta só, um resultado por leitura na mesma ordem", async () => {
  const repo = repoCom([
    [BRENT, "2026-09-01", 100],
    [BRENT, "2026-09-02", 101.5],
    [BRENT, "2026-09-03", 101.5],
    ["B3.CCM.CCMX26.SETTLE", "2026-09-02", 70],
    ["B3.CCM.CCMX26.SETTLE", "2026-09-03", 70.1]
  ]);
  const leituras = [analise({ serie: "BRENT" }), analise({ serie: "CCM", contrato: { ticker: "CCMX26" }, data: "2026-09-02" }), analise({ serie: "DESCONHECIDA" })];
  const resultados = await apurarRealizados(leituras, { agora: AGORA }, { observationRepository: repo });
  assert.equal(repo.chamadas.length, 1);
  assert.deepEqual(repo.chamadas[0].seriesCodes, [BRENT, "B3.CCM.CCMX26.SETTLE"]);
  assert.deepEqual(resultados.map((r) => [r.seriesCode, r.horizontes[0].situacao]), [
    [BRENT, "APURADO"],
    ["B3.CCM.CCMX26.SETTLE", "APURADO"],
    [null, "SEM_BASE"]
  ]);
});

test("período incompleto: à vista espera o dado depois da data-alvo; futuro, a tolerância", () => {
  const base = { data: "2026-09-01", valor: 100 };
  const h = { codigo: "IMEDIATO", dataAlvo: "2026-09-02", t1: 1, t2: 2.5 };
  const pontos = [{ data: "2026-08-20", valor: 100 }];
  const contexto = { base, pontos, hoje: "2026-09-20", tolerancia: 4 };
  // À vista (o Brent da EIA chega semanal): sem dado depois da data-alvo, aguarda, mesmo semanas depois.
  assert.equal(apurarHorizonte(h, contexto).situacao, "AGUARDANDO_DADO");
  // Futuro: passada a tolerância sem pregão do contrato, ele não negocia mais.
  assert.equal(apurarHorizonte(h, { ...contexto, futuro: true }).situacao, "SEM_PRECO");
  assert.equal(apurarHorizonte(h, { ...contexto, futuro: true, hoje: "2026-09-04" }).situacao, "AGUARDANDO_DADO");
  // Ainda não chegou a data-alvo.
  assert.equal(apurarHorizonte(h, { ...contexto, hoje: "2026-09-01" }).situacao, "A_APURAR");
});

test("preço na própria data-alvo: apura sem esperar o pregão seguinte (café de 06/10, ICFZ26)", () => {
  const base = { data: "2026-10-05", valor: 356 };
  const h = { codigo: "IMEDIATO", dataAlvo: "2026-10-06", t1: 1, t2: 2.7 };
  const pontos = [
    { data: "2026-10-05", valor: 356 },
    { data: "2026-10-06", valor: 371.7 }
  ];
  const r = apurarHorizonte(h, { base, pontos, hoje: "2026-10-07", tolerancia: 4, futuro: true });
  assert.deepEqual([r.situacao, r.faixa, r.dataPreco], ["APURADO", "ALTA_FORTE", "2026-10-06"]);
  assert.equal(r.variacaoPct.toFixed(2), "4.41");
});

test("sem preço novo depois da base (fim de semana, feriado): SEM_PREGAO, sem faixa", () => {
  const base = { data: "2026-09-04", valor: 100 };
  const pontos = [
    { data: "2026-09-04", valor: 100 },
    { data: "2026-09-08", valor: 104 }
  ];
  const r = apurarHorizonte({ codigo: "IMEDIATO", dataAlvo: "2026-09-05", t1: 1, t2: 2.5 }, { base, pontos, hoje: "2026-09-20", tolerancia: 4 });
  assert.deepEqual([r.situacao, r.faixa, r.variacaoPct, r.dataPreco], ["SEM_PREGAO", null, null, "2026-09-04"]);
});

test("sem base (leitura sem preço de referência ou futuro sem contrato): SEM_BASE, sem consulta", async () => {
  const repo = repoCom([]);
  const semPreco = { ...analise({ serie: "BRENT" }), precoReferencia: null };
  const r1 = await apurarRealizado(semPreco, { agora: AGORA }, { observationRepository: repo });
  assert.deepEqual(r1.horizontes.map((h) => h.situacao), ["SEM_BASE", "SEM_BASE", "SEM_BASE", "SEM_BASE"]);
  const r2 = await apurarRealizado(analise({ serie: "GLD" }), { agora: AGORA }, { observationRepository: repo });
  assert.equal(r2.seriesCode, null);
  assert.equal(repo.chamadas.length, 0);
});

test("sem preço da série perto da data da análise (contrato parado): SEM_BASE nos horizontes fechados", async () => {
  const repo = repoCom([
    [BRENT, "2026-08-01", 100],
    [BRENT, "2026-09-02", 101],
    [BRENT, "2026-09-03", 101]
  ]);
  const leitura = analise({ serie: "BRENT", recebidoEm: "2026-08-01" });
  const { base, horizontes } = await apurarRealizado(leitura, { agora: AGORA }, { observationRepository: repo });
  assert.equal(base, null);
  assert.equal(horizontes[0].situacao, "SEM_BASE");
});

test("contrato por horizonte (ADR 0078): o horizonte com contrato próprio é apurado nele, com a base dele", async () => {
  const repo = repoCom([
    ["B3.CCM.CCMU26.SETTLE", "2026-08-31", 60],
    ["B3.CCM.CCMU26.SETTLE", "2026-09-01", 61],
    ["B3.CCM.CCMU26.SETTLE", "2026-09-02", 62],
    ["B3.CCM.CCMX26.SETTLE", "2026-08-31", 70],
    ["B3.CCM.CCMX26.SETTLE", "2026-09-01", 70],
    ["B3.CCM.CCMX26.SETTLE", "2026-11-30", 77]
  ]);
  const leitura = analise({ serie: "CCM", contrato: { ticker: "CCMU26", rotulo: "CCMU26 (set/2026)" }, seriesCode: "B3.CCM.CCMU26.SETTLE", valor: 60 });
  // O longo (alvo 30/11) gravou o CCMX26: o CCMU26 vence antes.
  leitura.horizontes[3] = {
    ...leitura.horizontes[3],
    contrato: { ticker: "CCMX26", rotulo: "CCMX26 (nov/2026)" },
    seriesCode: "B3.CCM.CCMX26.SETTLE",
    precoRecebido: { valor: 70, dataReferencia: "2026-08-31" }
  };
  const { seriesCode, base, horizontes } = await apurarRealizado(leitura, { agora: AGORA }, { observationRepository: repo });
  assert.equal(seriesCode, "B3.CCM.CCMU26.SETTLE");
  assert.equal(base.valor, 61);
  assert.equal(horizontes[0].seriesCode, "B3.CCM.CCMU26.SETTLE");
  const longo = horizontes[3];
  assert.equal(longo.seriesCode, "B3.CCM.CCMX26.SETTLE");
  assert.equal(longo.base.valor, 70);
  assert.equal(longo.situacao, "APURADO");
  assert.equal(longo.variacaoPct, 10);
});
