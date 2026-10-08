"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { obterQualidadeIa, comparar, persistencia } = require("./qualidade-ia.service");
const { ValidationError } = require("../shared/errors");

const AGORA = new Date("2026-12-20T15:00:00Z");

// Uma leitura do milho como listarParaAvaliacao a devolve: o IMEDIATO (T1 0,3 / T2 1) e o CURTO (T1 1 / T2 3).
function registro(data, { faixa = "LATERAL", tendencia, d1 = 0.1, referencia = "DATA_DA_ANALISE", versao = 1 } = {}) {
  const tend = tendencia || { LATERAL: "LATERAL", ALTA_LEVE: "ALTA", ALTA_FORTE: "ALTA", BAIXA_LEVE: "BAIXA", BAIXA_FORTE: "BAIXA" }[faixa];
  return {
    data_analise: data,
    created_at: `${data}T04:00:00.000Z`,
    versao_prompt: "milho-analise-diaria@1",
    versao_metodologia: "milho-v1",
    versao_configuracao: versao,
    entrada: {
      precoReferencia: {
        serie: "CCM",
        contrato: { ticker: "CCMX26" },
        dataReferencia: data,
        valor: 70,
        variacoes: { ...(d1 === null ? {} : { d1: { percentual: d1 } }), d7: { percentual: -2 } }
      },
      referenciaHorizontes: referencia,
      horizontes: [
        { codigo: "IMEDIATO", dias: 1, t1: 0.3, t2: 1 },
        { codigo: "CURTO", dias: 7, t1: 1, t2: 3 }
      ]
    },
    leituras: [
      { horizonte: "IMEDIATO", tendencia: tend, faixa: tend === "INSUFICIENTE" ? null : faixa, confianca: tend === "INSUFICIENTE" ? null : "MEDIA" },
      { horizonte: "CURTO", tendencia: "LATERAL", faixa: "LATERAL", confianca: "BAIXA" }
    ]
  };
}

// O realizado de cada leitura, pela data: a base (com ou sem pregão na data) e o IMEDIATO; o CURTO ainda a apurar.
function realizadoFalso(porData) {
  return {
    chamadas: 0,
    async apurarRealizadosComPontos(leituras) {
      this.chamadas += 1;
      const pontosPorSerie = new Map([["B3.CCM.CCMX26.SETTLE", [{ data: "2026-09-01", valor: 70 }]]]);
      const realizados = leituras.map((l) => {
        const r = porData[l.data] || {};
        return {
          seriesCode: "B3.CCM.CCMX26.SETTLE",
          base: { data: r.baseEm || l.data, valor: 70, naDataDaAnalise: (r.baseEm || l.data) === l.data, confirmada: true },
          horizontes: [
            { horizonte: "IMEDIATO", dataAlvo: "x", situacao: r.situacao || "APURADO", preco: 72, dataPreco: "y", variacaoPct: 2, faixa: r.faixa || null },
            { horizonte: "CURTO", dataAlvo: "z", situacao: "A_APURAR" }
          ]
        };
      });
      return { realizados, pontosPorSerie, hoje: "2026-12-20" };
    }
  };
}

function repoCom(registros) {
  const pedidos = [];
  return {
    pedidos,
    listarParaAvaliacao: async (filtros) => {
      pedidos.push(filtros);
      return registros;
    },
    listarVersoesConfiguracao: async () => [1]
  };
}

test("comparar: direção pela faixa, faixa exata e distância na escala de -2 a +2", () => {
  assert.deepEqual(comparar("ALTA_FORTE", "ALTA_LEVE"), { faixa: "ALTA_FORTE", direcao: true, faixaExata: false, distancia: 1 });
  assert.deepEqual(comparar("ALTA_FORTE", "BAIXA_FORTE"), { faixa: "ALTA_FORTE", direcao: false, faixaExata: false, distancia: 4 });
  assert.deepEqual(comparar("LATERAL", "ALTA_LEVE"), { faixa: "LATERAL", direcao: false, faixaExata: false, distancia: 1 });
  assert.deepEqual(comparar("BAIXA_LEVE", "BAIXA_LEVE"), { faixa: "BAIXA_LEVE", direcao: true, faixaExata: true, distancia: 0 });
});

test("persistência: a variação passada de mesmo prazo, como a IA a recebeu, na faixa do horizonte", () => {
  const variacoes = { d1: { percentual: -0.5 }, d7: { percentual: 4 } };
  assert.deepEqual(persistencia(variacoes, { dias: 1, t1: 0.3, t2: 1 }), { variacaoPct: -0.5, faixa: "BAIXA_LEVE" });
  assert.deepEqual(persistencia(variacoes, { dias: 7, t1: 1, t2: 3 }), { variacaoPct: 4, faixa: "ALTA_FORTE" });
  assert.equal(persistencia(variacoes, { dias: 30, t1: 3, t2: 9 }), null);
});

test("a célula: só as linhas avaliáveis, as mesmas para a IA e os dois benchmarks; o resto contado pelo motivo", async () => {
  const registros = [
    // Avaliada: a IA leu ALTA_LEVE, caiu em ALTA_FORTE; a Persistência (-0,5%) leu BAIXA_LEVE.
    registro("2026-09-01", { faixa: "ALTA_LEVE", d1: -0.5 }),
    // Avaliada: todos LATERAL, realizado LATERAL.
    registro("2026-09-02", { faixa: "LATERAL", d1: 0.1 }),
    registro("2026-09-03", { tendencia: "INSUFICIENTE" }), // fora: INSUFICIENTE (cobertura)
    registro("2026-09-04", { faixa: "LATERAL", d1: null }), // fora: SEM_BENCHMARK (sem a variação de 1 dia)
    registro("2026-09-06", { faixa: "LATERAL" }), // domingo: base de sexta, SEM_PREGAO_NA_DATA
    registro("2026-09-08", { faixa: "LATERAL" }), // fora: SEM_PRECO (contrato vencido)
    registro("2026-08-28", { faixa: "LATERAL", referencia: "DATA_DO_ULTIMO_PRECO" }) // petróleo-v1-like: REFERENCIA_ANTIGA
  ];
  const realizado = realizadoFalso({
    "2026-09-01": { faixa: "ALTA_FORTE" },
    "2026-09-02": { faixa: "LATERAL" },
    "2026-09-03": { faixa: "LATERAL" },
    "2026-09-04": { faixa: "LATERAL" },
    "2026-09-06": { faixa: "LATERAL", baseEm: "2026-09-04" },
    "2026-09-08": { situacao: "SEM_PRECO" },
    "2026-08-28": { faixa: "LATERAL" }
  });
  const repo = repoCom(registros);
  const { qualidadeIa: q } = await obterQualidadeIa({ ativo: "milho" }, { agora: AGORA, analiseDiariaRepository: repo, realizadoAnaliseService: realizado });

  assert.equal(realizado.chamadas, 1); // o realizado de todas as leituras de uma vez
  assert.equal(q.ativo.codigo, "MILHO");
  assert.equal(q.totalLeituras, 7);
  assert.deepEqual(q.horizontes.map((h) => h.horizonte), ["IMEDIATO", "CURTO", "MEDIO", "LONGO"]);

  const imediato = q.horizontes[0];
  assert.equal(imediato.n, 2);
  assert.equal(imediato.totalLinhas, 7);
  assert.deepEqual(imediato.cobertura, { respondidas: 3, total: 4 });
  assert.deepEqual(
    Object.entries(imediato.fora).filter(([, v]) => v),
    [["REFERENCIA_ANTIGA", 1], ["SEM_PRECO", 1], ["SEM_PREGAO_NA_DATA", 1], ["INSUFICIENTE", 1], ["SEM_BENCHMARK", 1]]
  );
  assert.deepEqual(imediato.medidas.IA, { direcao: { k: 2, pct: 100 }, faixaExata: { k: 1, pct: 50 }, distanciaMedia: 0.5 });
  assert.deepEqual(imediato.medidas.SEMPRE_LATERAL, { direcao: { k: 1, pct: 50 }, faixaExata: { k: 1, pct: 50 }, distanciaMedia: 1 });
  assert.deepEqual(imediato.medidas.PERSISTENCIA, { direcao: { k: 1, pct: 50 }, faixaExata: { k: 1, pct: 50 }, distanciaMedia: 1.5 });
  // A IA contra o MELHOR benchmark de cada medida.
  assert.deepEqual(imediato.sintese, { direcaoPp: 50, faixaExataPp: 0, distancia: -0.5 });

  // O CURTO ainda não fechou: nada medido, sem síntese.
  assert.equal(q.horizontes[1].n, 0);
  assert.equal(q.horizontes[1].sintese, null);
  assert.equal(q.horizontes[1].medidas.IA.direcao.pct, null);

  // Cada número leva às linhas: a 1ª avaliada traz a base, o preço recebido, a lida, a realizada e os benchmarks.
  const linha = q.linhas.find((l) => l.dataAnalise === "2026-09-01" && l.horizonte === "IMEDIATO");
  assert.equal(linha.motivoFora, null);
  assert.deepEqual(linha.precoRecebido, { valor: 70, data: "2026-09-01" });
  assert.deepEqual(linha.lida, { tendencia: "ALTA", faixa: "ALTA_LEVE", confianca: "MEDIA" });
  assert.deepEqual([linha.realizado.faixa, linha.realizado.tendencia], ["ALTA_FORTE", "ALTA"]);
  assert.deepEqual(linha.resultado.PERSISTENCIA, { faixa: "BAIXA_LEVE", direcao: false, faixaExata: false, distancia: 3 });
  assert.equal(q.linhas.length, 14);
  // O gráfico: o dia de hoje, o preço de cada série com o contrato, e a série em cada linha.
  assert.equal(q.hoje, "2026-12-20");
  assert.deepEqual(q.precos, [{ seriesCode: "B3.CCM.CCMX26.SETTLE", contrato: "CCMX26", pontos: [{ data: "2026-09-01", valor: 70 }] }]);
  assert.equal(linha.seriesCode, "B3.CCM.CCMX26.SETTLE");
});

test("filtros: período e versão vão ao repository; inválidos são recusados", async () => {
  const repo = repoCom([]);
  const deps = { agora: AGORA, analiseDiariaRepository: repo, realizadoAnaliseService: realizadoFalso({}) };
  const { qualidadeIa: q } = await obterQualidadeIa({ ativo: "CAFE", desde: "2026-09-01", ate: "2026-09-30", versaoConfiguracao: "2" }, deps);
  assert.deepEqual(repo.pedidos[0], { ativo: "CAFE", desde: "2026-09-01", ate: "2026-09-30", versaoConfiguracao: 2 });
  assert.equal(q.totalLeituras, 0);
  assert.ok(q.horizontes.every((h) => h.n === 0 && h.sintese === null));

  await assert.rejects(obterQualidadeIa({ ativo: "TRIGO" }, deps), ValidationError);
  await assert.rejects(obterQualidadeIa({ ativo: "CAFE", desde: "01/09/2026" }, deps), ValidationError);
  await assert.rejects(obterQualidadeIa({ ativo: "CAFE", versaoConfiguracao: "v1" }, deps), ValidationError);
});

test("motor (ADR 0066): medido nas linhas da métrica em que leu o horizonte, com o próprio n e fora da síntese", async () => {
  const comMotor = (data, opcoes, faixaMotor) => {
    const r = registro(data, opcoes);
    r.entrada.agregacaoMotor = {
      versao: "cafe-agregacao-v1 (2026-10-05)",
      horizontes: [
        {
          horizonte: "IMEDIATO",
          tendencia: faixaMotor ? faixaMotor.split("_")[0] : "INSUFICIENTE",
          faixa: faixaMotor,
          confianca: faixaMotor ? "BAIXA" : null,
          score: 0
        }
      ]
    };
    return r;
  };
  const registros = [
    comMotor("2026-09-01", { faixa: "ALTA_LEVE", d1: -0.5 }, "ALTA_FORTE"), // o motor acerta a faixa exata
    comMotor("2026-09-02", { faixa: "LATERAL", d1: 0.1 }, null), // o motor INSUFICIENTE: fora do n dele
    registro("2026-09-09", { faixa: "LATERAL", d1: 0.1 }) // leitura sem motor (anterior a ele)
  ];
  const realizado = realizadoFalso({ "2026-09-01": { faixa: "ALTA_FORTE" }, "2026-09-02": { faixa: "LATERAL" }, "2026-09-09": { faixa: "LATERAL" } });
  const { qualidadeIa: q } = await obterQualidadeIa({ ativo: "milho" }, { agora: AGORA, analiseDiariaRepository: repoCom(registros), realizadoAnaliseService: realizado });

  const imediato = q.horizontes[0];
  assert.equal(imediato.n, 3);
  assert.deepEqual(imediato.medidas.MOTOR, { direcao: { k: 1, pct: 100 }, faixaExata: { k: 1, pct: 100 }, distanciaMedia: 0, n: 1 });
  // A síntese segue a IA contra os dois benchmarks, sem o motor.
  assert.deepEqual(Object.keys(imediato.sintese), ["direcaoPp", "faixaExataPp", "distancia"]);
  assert.deepEqual(q.linhas.find((l) => l.dataAnalise === "2026-09-01" && l.horizonte === "IMEDIATO").motor, {
    tendencia: "ALTA",
    faixa: "ALTA_FORTE",
    confianca: "BAIXA",
    score: 0
  });
  // Sem motor em nenhuma linha do horizonte (o CURTO), sem a medida.
  assert.equal(q.horizontes[1].medidas.MOTOR, undefined);
});

test("contexto do gráfico: no petróleo, o Brent à vista da EIA na janela do preço; nos outros ativos, nenhum", async () => {
  const pedidos = [];
  const observationRepository = {
    async buscarAsOf(filtros) {
      pedidos.push(filtros);
      return [
        { series_code: "EIA.PETROLEO_PRECOS.BRENT", observed_at: "2026-09-29", value: "113.96" },
        { series_code: "EIA.PETROLEO_PRECOS.BRENT", observed_at: "2026-09-28", value: "119.97" }
      ];
    }
  };
  const deps = { agora: AGORA, analiseDiariaRepository: repoCom([]), realizadoAnaliseService: realizadoFalso({}), observationRepository };

  const { qualidadeIa: petroleo } = await obterQualidadeIa({ ativo: "PETROLEO" }, deps);
  assert.deepEqual(petroleo.contexto, {
    seriesCode: "EIA.PETROLEO_PRECOS.BRENT",
    nome: "Brent à vista (EIA)",
    pontos: [
      { data: "2026-09-28", valor: 119.97 },
      { data: "2026-09-29", valor: 113.96 }
    ]
  });
  assert.equal(pedidos[0].observadoAte, petroleo.hoje);
  assert.deepEqual(pedidos[0].seriesCodes, ["EIA.PETROLEO_PRECOS.BRENT"]);

  const { qualidadeIa: milho } = await obterQualidadeIa({ ativo: "MILHO" }, deps);
  assert.equal(milho.contexto, null);
  assert.equal(pedidos.length, 1);
});
