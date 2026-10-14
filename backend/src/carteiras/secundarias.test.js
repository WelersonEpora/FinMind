"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  painelDaTrilha,
  diasDivergentes,
  atribuicaoPorAtivo,
  contrariasALeitura,
  cortesDoMotor,
  consistenciaDaReplica,
  metricasDaCartilha,
  cartilhaPorTrilha
} = require("./secundarias");

const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const dia = (n) => `2026-11-${String(n).padStart(2, "0")}`;

test("painel: retorno e recuo no segmento (sobre o patrimônio de antes dele); volatilidade e Sharpe só com o mínimo de dias", () => {
  const serie = [
    { data: dia(2), patrimonio: 9000 },
    { data: dia(3), patrimonio: 9900 },
    { data: dia(4), patrimonio: 9450 },
    { data: dia(5), patrimonio: 10350 }
  ];
  const p = painelDaTrilha({ tipo: "IA", serie, inicio: dia(3), capital: 10000, minimoDias: 20, caixa: new Map() });
  assert.equal(p.dias, 3);
  perto(p.retornoPct, 13.5);
  perto(p.maiorRecuoPct, (9450 / 9900 - 1) * 100);
  assert.equal(p.volatilidadePct, null);
  assert.equal(p.sharpe, null);

  const longa = Array.from({ length: 30 }, (_, i) => ({ data: `2026-12-${String(i + 1).padStart(2, "0")}`, patrimonio: 10000 * (1 + (i % 2 ? 0.01 : 0.005)) }));
  const comDias = painelDaTrilha({ tipo: "IA", serie: longa, inicio: longa[0].data, capital: 10000, minimoDias: 20, caixa: new Map() });
  assert.ok(comDias.volatilidadePct > 0);
  assert.ok(Number.isFinite(comDias.sharpe));
  const caixa = painelDaTrilha({ tipo: "CAIXA", serie: longa, inicio: longa[0].data, capital: 10000, minimoDias: 20, caixa: new Map() });
  assert.equal(caixa.sharpe, null);
});

test("painel: Sharpe sobre o retorno da trilha CAIXA, e o tempo exposto pelas posições carregadas", () => {
  const serie = Array.from({ length: 20 }, (_, i) => ({ data: `2026-12-${String(i + 1).padStart(2, "0")}`, patrimonio: 10000 + 10 * (i + 1) + (i % 3) * 5 }));
  const caixa = new Map(serie.map((p) => [p.data, 0.0005]));
  const semCaixa = painelDaTrilha({ tipo: "IA", serie, inicio: serie[0].data, capital: 10000, minimoDias: 20, caixa: new Map() });
  const comCaixa = painelDaTrilha({ tipo: "IA", serie, inicio: serie[0].data, capital: 10000, minimoDias: 20, caixa });
  assert.ok(comCaixa.sharpe < semCaixa.sharpe);

  const posicoes = [{ ativo: "MILHO", lado: "COMPRADO", dataEntrada: "2026-12-01", dataSaida: "2026-12-05" }];
  const p = painelDaTrilha({ tipo: "IA", serie, posicoes, inicio: serie[0].data, capital: 10000, minimoDias: 20, caixa });
  // Carregada de 02 a 05 (entrou no ajuste de 01 e saiu em 05): 4 de 20 dias.
  perto(p.tempoExpostoPct, 20);
});

test("dias divergentes: outra exposição (ativo ou lado) separa a diferença", () => {
  const diferencas = [{ data: dia(3), diferenca: 0.2 }, { data: dia(4), diferenca: -0.1 }, { data: dia(5), diferenca: 0.05 }];
  const posicoesIa = [{ ativo: "MILHO", lado: "COMPRADO", dataEntrada: dia(2), dataSaida: dia(4) }];
  const posicoesDet = [{ ativo: "MILHO", lado: "COMPRADO", dataEntrada: dia(2), dataSaida: dia(3) }];
  const r = diasDivergentes({ diferencas, posicoesIa, posicoesDet });
  assert.equal(r.divergentes, 1);
  perto(r.acumuladaDivergentes, -0.1);
  perto(r.acumuladaIguais, 0.25);
});

test("atribuição por ativo pelo razão, com o caixa à parte; soma igual à diferença total", () => {
  const lancamentos = [
    { trilhaId: "ia", data: dia(3), tipo: "AJUSTE_DIARIO", ativo: "MILHO", valor: 100 },
    { trilhaId: "ia", data: dia(3), tipo: "CUSTO", ativo: "MILHO", valor: -10 },
    { trilhaId: "ia", data: dia(3), tipo: "RENDIMENTO_CAIXA", ativo: null, valor: 5 },
    { trilhaId: "det", data: dia(3), tipo: "AJUSTE_DIARIO", ativo: "CAFE", valor: -50 },
    { trilhaId: "det", data: dia(3), tipo: "RENDIMENTO_CAIXA", ativo: null, valor: 5 },
    { trilhaId: "ia", data: dia(1), tipo: "AJUSTE_DIARIO", ativo: "MILHO", valor: 999 }
  ];
  const r = atribuicaoPorAtivo({ lancamentos, iaId: "ia", detId: "det", inicio: dia(2), ativos: ["MILHO", "CAFE"], capital: 10000 });
  assert.deepEqual(r.map((x) => x.ativo), ["MILHO", "CAFE", null]);
  perto(r[0].diferenca, 0.9);
  perto(r[1].diferenca, 0.5);
  perto(r[2].diferenca, 0);
});

test("contrárias à leitura: dias, ramos, aplicadas e o resultado das entradas", () => {
  const principais = [
    { data: dia(3), contrarias: { MILHO: ["semPosicao", "comprado"] } },
    { data: dia(4), contrarias: null },
    { data: dia(5), contrarias: { CAFE: ["vendido"] } }
  ];
  const intencoesIa = [
    { data: dia(3), ativo: "MILHO", acao: "ENTRAR_COMPRADO", resultado: "ORDEM", referencia: { contraria: true } },
    { data: dia(5), ativo: "CAFE", acao: "MANTER", resultado: "SEM_ORDEM", referencia: { contraria: true } },
    { data: dia(4), ativo: "SOJA", acao: "ENTRAR_VENDIDO", resultado: "ORDEM", referencia: { contraria: false } }
  ];
  const posicoesIa = [
    { ativo: "MILHO", dataEntrada: dia(3), situacao: "ENCERRADA", resultadoMoeda: 200, resultadoR: 1 },
    { ativo: "SOJA", dataEntrada: dia(4), situacao: "ENCERRADA", resultadoMoeda: -100, resultadoR: -1 }
  ];
  const r = contrariasALeitura({ principais, intencoesIa, posicoesIa, capital: 10000 });
  assert.equal(r.dias, 2);
  assert.equal(r.ramos, 3);
  assert.equal(r.entradas, 1);
  assert.equal(r.manutencoes, 1);
  assert.equal(r.resultado.encerradas, 1);
  perto(r.resultado.resultadoPct, 2);
});

test("cortes do motor por trilha e motivo, na ordem das trilhas", () => {
  const tipoDaTrilha = new Map([["ia", "IA"], ["det", "DETERMINISTICA"]]);
  const intencoes = [
    { trilhaId: "det", resultado: "BLOQUEADA", motivoBloqueio: "MAX_POSICOES" },
    { trilhaId: "ia", resultado: "BLOQUEADA", motivoBloqueio: "TRAVA" },
    { trilhaId: "ia", resultado: "BLOQUEADA", motivoBloqueio: "TRAVA" },
    { trilhaId: "ia", resultado: "ORDEM", motivoBloqueio: null }
  ];
  const r = cortesDoMotor({ intencoes, tipoDaTrilha });
  assert.deepEqual(r, [
    { tipo: "IA", total: 2, motivos: { TRAVA: 2 } },
    { tipo: "DETERMINISTICA", total: 1, motivos: { MAX_POSICOES: 1 } }
  ]);
});

test("consistência da réplica: ações por ativo e ramo e prioridades; réplica inválida não compara", () => {
  const item = (ativo, prioridade, a, b, c) => ({ ativo, prioridade, semPosicao: { acao: a }, comprado: { acao: b }, vendido: { acao: c } });
  const recomendacoes = [
    { data: dia(3), tipo: "PRINCIPAL", situacao: "VALIDA", recomendacoes: [item("MILHO", 1, "ENTRAR_COMPRADO", "MANTER", "ZERAR"), item("CAFE", 2, "NAO_ENTRAR", "MANTER", "MANTER")] },
    { data: dia(3), tipo: "REPLICA", situacao: "VALIDA", recomendacoes: [item("MILHO", 2, "ENTRAR_COMPRADO", "MANTER", "ZERAR"), item("CAFE", 1, "NAO_ENTRAR", "REDUZIR", "MANTER")] },
    { data: dia(10), tipo: "PRINCIPAL", situacao: "VALIDA", recomendacoes: [] },
    { data: dia(10), tipo: "REPLICA", situacao: "FALHA", recomendacoes: null }
  ];
  const r = consistenciaDaReplica(recomendacoes);
  assert.deepEqual(r, { replicas: 2, comparaveis: 1, acoes: 6, acoesIguais: 5, prioridades: 2, prioridadesIguais: 0 });
});

test("métricas da Cartilha: acerto, R médio, R:R realizado e planejado", () => {
  const p = (situacao, r, moeda) => ({ situacao, resultadoR: r, resultadoMoeda: moeda, entrada: 100, alvo2: 106, distancia: 2 });
  const m = metricasDaCartilha([p("ENCERRADA", 2, 400), p("ENCERRADA", -1, -200), p("ENCERRADA", 1, 200), p("ABERTA", null, 0)], 10000);
  assert.equal(m.operacoes, 4);
  assert.equal(m.encerradas, 3);
  assert.equal(m.abertas, 1);
  perto(m.acertoPct, (2 / 3) * 100);
  perto(m.rMedio, 2 / 3);
  perto(m.rrRealizado, 1.5);
  perto(m.rrPlanejado, 3);
  perto(m.resultadoPct, 4);
  const vazia = metricasDaCartilha([], 10000);
  assert.equal(vazia.acertoPct, null);
  assert.equal(vazia.rrRealizado, null);
});

test("Cartilha por trilha: sem o caixa e o comprar e segurar; só as entradas do segmento; aderência do operador", () => {
  const trilhas = [{ id: "c", tipo: "CAIXA" }, { id: "op", tipo: "OPERADOR" }, { id: "ia", tipo: "IA" }, { id: "cs", tipo: "COMPRAR_E_SEGURAR" }];
  const posicoes = [
    { trilhaId: "ia", ativo: "MILHO", dataEntrada: dia(3), situacao: "ENCERRADA", resultadoR: 1, resultadoMoeda: 100 },
    { trilhaId: "ia", ativo: "MILHO", dataEntrada: dia(1), situacao: "ENCERRADA", resultadoR: -1, resultadoMoeda: -100 }
  ];
  const ordensOperador = [
    { tipo: "ENTRADA", situacao: "EXECUTADA", dataExecucao: dia(3), detalhes: { aderente: true } },
    { tipo: "ENTRADA", situacao: "EXPIRADA", dataExecucao: dia(4), detalhes: { aderente: false } },
    { tipo: "ENTRADA", situacao: "CANCELADA", dataExecucao: dia(4), detalhes: { aderente: false } },
    { tipo: "SAIDA", situacao: "EXECUTADA", dataExecucao: dia(5), detalhes: null }
  ];
  const r = cartilhaPorTrilha({ trilhas, posicoes, ordensOperador, ativos: ["MILHO", "CAFE"], inicio: dia(2), capital: 10000 });
  assert.deepEqual(r.map((t) => t.tipo), ["IA", "OPERADOR"]);
  assert.equal(r[0].total.operacoes, 1);
  assert.equal(r[0].porAtivo[0].operacoes, 1);
  assert.equal(r[0].porAtivo[1].operacoes, 0);
  assert.equal(r[0].aderencia, null);
  assert.deepEqual(r[1].aderencia, { entradas: 2, aderentes: 1 });
});
