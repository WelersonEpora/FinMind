"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SERIES, PARAMETROS_PADRAO, METODOLOGIA, numeroDoLevantamento, decidirSafrinha, derivarSafrinhaMilho } = require("./safrinha-milho.factor");
const { montarTextoPrompt } = require("./base/texto-prompt");

const producao = (safra, valor, edicao) => ({
  seriesCode: SERIES.producao,
  observedAt: safra,
  value: valor,
  publishedAt: new Date(`${edicao}T12:00:00Z`),
  publishedAtIsEstimated: false
});

test("o número do levantamento vem do mês: outubro é o 1º, setembro o 12º", () => {
  assert.deepEqual([10, 11, 2, 9].map(numeroDoLevantamento), [1, 2, 5, 12]);
});

test("R-SAF v0: 3% contra a safra anterior ou a acumulada de 2% em 2 levantamentos dão direção; os dois, forte", () => {
  const p = PARAMETROS_PADRAO;
  assert.deepEqual([decidirSafrinha({ variacaoSafraAnteriorPct: -3, acumuladasPct: [0, 0] }, p).direcao], ["ALTA"]);
  assert.equal(decidirSafrinha({ variacaoSafraAnteriorPct: 3, acumuladasPct: [0, 0] }, p).direcao, "BAIXA");
  // A acumulada precisa passar do limiar nos 2 levantamentos seguidos.
  assert.equal(decidirSafrinha({ variacaoSafraAnteriorPct: null, acumuladasPct: [-2.3, -1.8], revisaoPct: -0.5 }, p).direcao, "NEUTRA");
  assert.equal(decidirSafrinha({ variacaoSafraAnteriorPct: null, acumuladasPct: [-2.3, -2], revisaoPct: -0.3 }, p).direcao, "ALTA");
  assert.equal(decidirSafrinha({ variacaoSafraAnteriorPct: -4, acumuladasPct: [-2.5, -2.1], revisaoPct: -0.4 }, p).intensidade, "FORTE");
  const opostos = decidirSafrinha({ variacaoSafraAnteriorPct: 4, acumuladasPct: [-2.5, -2.1], revisaoPct: -0.4 }, p);
  assert.deepEqual([opostos.direcao, opostos.conflito], ["NEUTRA", true]);
});

test("abaixo dos limiares, uma revisão para cima é viés de baixa fraco (o exemplo do especialista)", () => {
  const d = decidirSafrinha({ variacaoSafraAnteriorPct: 0.09, acumuladasPct: [1.51, 0.52], revisaoPct: 0.99 }, PARAMETROS_PADRAO);
  assert.deepEqual([d.direcao, d.intensidade, d.vies], ["BAIXA", "FRACA", true]);
  assert.equal(decidirSafrinha({ variacaoSafraAnteriorPct: 0.5, acumuladasPct: [0, 0], revisaoPct: -0.5 }, PARAMETROS_PADRAO).direcao, "NEUTRA");
});

test("um ponto por levantamento: a safra anterior no mesmo mês um ano antes e a acumulada contra a 1ª estimativa (outubro)", () => {
  const s25 = "2025-09-01";
  const s24 = "2024-09-01";
  const linhas = [
    producao(s24, 96000, "2025-02-13"),
    producao(s25, 110000, "2025-10-14"),
    producao(s25, 108000, "2026-01-12"),
    producao(s25, 107000, "2026-02-12")
  ];
  const pontos = derivarSafrinhaMilho(linhas);
  const fev = pontos.at(-1);
  assert.equal(fev.levantamento, "5º");
  assert.equal(fev.safra, "2025/26");
  assert.equal(fev.producaoSafraAnteriorMilT, 96000);
  assert.equal(fev.variacaoSafraAnteriorPct, 11.46);
  assert.equal(fev.acumuladaPct, -2.73);
  assert.equal(fev.revisaoPct, -0.93);
  // A acumulada passa de -2% em fev (-2,73%), mas não em jan (-1,82%): não são 2 seguidos. Decide o nível (safra maior).
  assert.deepEqual([fev.decisao.direcao, fev.decisao.porRevisao], ["BAIXA", "NEUTRA"]);
  // Sem levantamento no mesmo mês um ano antes, a comparação fica vazia.
  assert.equal(pontos.find((p) => p.observedAt === "2026-01-12").producaoSafraAnteriorMilT, null);
  // A safra 2024/25 começa na base em fevereiro: sem a 1ª estimativa (de outubro), sem acumulada.
  assert.equal(pontos[0].acumuladaPct, null);
});

test("o texto do prompt traz a regra do fator, com os levantamentos sem casa decimal", () => {
  const texto = montarTextoPrompt({
    ativo: "MILHO",
    fator: { codigo: "MILHO_SAFRINHA", nome: "Safrinha", peso: "Alto", proposta: { situacao: "PROPOSTA" } },
    calculo: { apresentacao: METODOLOGIA.apresentacao, periodicidade: "MENSAL", parametros: PARAMETROS_PADRAO, factorId: METODOLOGIA.factorId, factorVersion: 1 },
    ponto: { observedAt: "2026-09-15", levantamento: "12º", decisao: { direcao: "BAIXA", intensidade: "FRACA", tendencia: null } }
  });
  assert.match(texto, /3,0% ou mais abaixo da safra anterior no mesmo levantamento, .* -2,0% ou pior em 2 levantamentos seguidos/);
});

test("o VHI de MT e do PR vai como contexto (ADR 0070): as 2 semanas mais recentes, sem mudar a decisão", () => {
  const vhi = (estado, semana, valor) => ({
    seriesCode: `NOAA_VH.MILHO.${estado}.VHI`,
    observedAt: semana,
    value: valor,
    publishedAt: new Date(`${semana}T23:59:59Z`),
    publishedAtIsEstimated: true
  });
  const conab = [producao("2025-09-01", 100000, "2025-10-15"), producao("2025-09-01", 101000, "2025-11-03")];
  const linhasVhi = [
    vhi("BR_MT", "2025-10-07", 50), vhi("BR_MT", "2025-10-14", 38), vhi("BR_MT", "2025-11-04", 35), vhi("BR_MT", "2025-11-11", 36),
    vhi("BR_PR", "2025-11-04", 60), vhi("BR_PR", "2025-11-11", 61)
  ];
  const semVhi = derivarSafrinhaMilho(conab);
  const [outubro, novembro] = derivarSafrinhaMilho(conab, { linhasVhi });
  // Outubro: o VHI conhecido até o levantamento de novembro sair; o PR ainda não tinha semana recente.
  assert.equal(outubro.vhiContexto, "semanas até 14/10/2025");
  assert.match(outubro.vhiContextoDetalhe, /^MT 50,0 e 38,0\. Só contexto/);
  assert.equal(novembro.vhiContexto, "semanas até 11/11/2025");
  assert.match(novembro.vhiContextoDetalhe, /^MT 35,0 e 36,0 \(abaixo de 40\); PR 60,0 e 61,0\./);
  assert.deepEqual(novembro.decisao, semVhi.at(-1).decisao);
  assert.equal(semVhi.at(-1).vhiContexto, null);
});
