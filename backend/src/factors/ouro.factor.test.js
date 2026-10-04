"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

// Os fatores do ouro (ADR 0053) com dados sintéticos: o cálculo de cada um e o que o diferencia do molde comum.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { somarDias } = require("./base/semana-de-dias");
const { somarMeses } = require("./base/meses");
const { derivarJurosReaisOuro } = require("./juros-reais-ouro.factor");
const { derivarFundosOuro, SERIES: SERIES_COT } = require("./fundos-ouro.factor");
const { derivarFundosPetroleo, SERIES: SERIES_COT_WTI } = require("./fundos-petroleo.factor");
const { derivarInflacaoOuro } = require("./inflacao-ouro.factor");
const { derivarComprasDeclaradas, derivarBancosCentraisOuro, calcularBancosCentraisOuro } = require("./bancos-centrais-ouro.factor");
const { derivarEtfsOuro } = require("./etfs-ouro.factor");
const { derivarMineracaoOuro } = require("./mineracao-ouro.factor");
const { montarTextoPrompt } = require("./base/texto-prompt");

const publicado = new Date("2026-10-01T12:00:00Z");
const linha = (seriesCode, observedAt, value) => ({ seriesCode, observedAt, value, publishedAt: publicado, publishedAtIsEstimated: true });

test("juros reais: a variação do TIPS em 26 semanas, com a meta do Fed como contexto; subindo pressiona para baixo", () => {
  const sextas = Array.from({ length: 31 }, (_, i) => somarDias("2026-03-06", 7 * i));
  const linhas = sextas.flatMap((d, i) => [linha("FRED.DFII10", d, i < 26 ? 1.5 : 2.5), linha("FRED.DFEDTARU", d, 4)]);
  const ultimo = derivarJurosReaisOuro(linhas).at(-1);
  assert.equal(ultimo.juroReal10a, 2.5);
  assert.equal(ultimo.juroReal10a26SemanasAntes, 1.5);
  assert.equal(ultimo.variacao26Semanas, 1);
  assert.equal(ultimo.metaFed, 4);
  assert.equal(ultimo.decisao.direcao, "BAIXA");
  assert.equal(ultimo.decisao.intensidade, "FORTE");
});

test("fundos: o mesmo cálculo do petróleo, com a leitura do FEL 1 (muito comprados = ALTA, o contrário do petróleo)", () => {
  // 151 semanas com a posição líquida crescendo; a última, a maior: percentil 100, posição relativa +50.
  const tercas = Array.from({ length: 152 }, (_, i) => somarDias("2023-10-03", 7 * i));
  const serie = (s) => tercas.flatMap((d, i) => [linha(s.comprados, d, 100 + i), linha(s.vendidos, d, 50), linha(s.contratosEmAberto, d, 1000)]);
  const ouro = derivarFundosOuro(serie(SERIES_COT)).at(-1);
  const petroleo = derivarFundosPetroleo(serie(SERIES_COT_WTI)).at(-1);
  assert.equal(ouro.posicaoRelativa, petroleo.posicaoRelativa);
  assert.equal(ouro.decisao.direcao, "ALTA");
  assert.equal(petroleo.decisao.direcao, "BAIXA");
});

test("inflação: o CPI cheio contra 12 meses antes, menos a meta de 2%; acima da meta favorece o ouro", () => {
  const meses = Array.from({ length: 13 }, (_, i) => somarMeses("2025-08-01", i));
  const linhas = meses.flatMap((m, i) => [linha("FRED.CPIAUCNS", m, i === 12 ? 104 : 100), linha("FRED.CPILFESL", m, i === 12 ? 103 : 100)]);
  const ultimo = derivarInflacaoOuro(linhas).at(-1);
  assert.equal(ultimo.observedAt, "2026-08-01");
  assert.equal(ultimo.inflacaoAnualPct, 4);
  assert.equal(ultimo.nucleoAnualPct, 3);
  assert.equal(ultimo.distanciaMetaPp, 2);
  assert.equal(ultimo.decisao.direcao, "ALTA");
});

// O par de séries de um país do FMI no mês: volume (mi oz) e valor (US$ mi), com o preço implícito de US$ 3.000/oz.
function pais(codigo, mes, volume, { valor = volume * 3000 } = {}) {
  return [
    linha(`IMF.IRFCL.OURO.${codigo}.VOLUME_MI_OZT`, mes, volume),
    ...(valor === null ? [] : [linha(`IMF.IRFCL.OURO.${codigo}.VALOR_MI_USD`, mes, valor)])
  ];
}

test("bancos centrais, contexto: as compras declaradas ao FMI só entre os países nos dois meses e conferidos", () => {
  const antes = "2025-07-01";
  const agora = "2026-07-01";
  const linhas = [
    // A, B, C, D e E nos dois meses: A compra 1 mi oz (~31 t); os demais ficam parados.
    ...["A", "B", "C", "D", "E"].flatMap((p) => [...pais(p, antes, 10), ...pais(p, agora, p === "A" ? 11 : 10)]),
    // F entra na lista agora: não é compra.
    ...pais("F", agora, 50),
    // G reporta o volume 1.000× maior agora (o preço implícito sai da faixa): fica de fora, não vira compra.
    ...pais("G", antes, 5),
    ...pais("G", agora, 5000, { valor: 5 * 3000 }),
    // H reporta só o volume, sem como conferir: fica de fora.
    ...pais("H", antes, 1, { valor: null }),
    ...pais("H", agora, 200, { valor: null })
  ];
  assert.deepEqual([...derivarComprasDeclaradas(linhas)], [[agora, { toneladas: 31.1, paises: 5 }]]);
});

test("bancos centrais: as compras de 4 trimestres do WGC contra a média dos 3 anos anteriores; o FMI vai junto", () => {
  // 15 trimestres a 200 t (4 trimestres = 800 t) e o 16º a 400 t: 1.000 t contra a média de 800 t.
  const trimestres = Array.from({ length: 16 }, (_, i) => somarMeses("2022-07-01", 3 * i));
  const linhas = trimestres.map((t, i) => linha("WGC.OFERTA_DEMANDA.BANCOS_CENTRAIS", t, i === 15 ? 400 : 200));
  const fmi = ["A", "B", "C", "D", "E"].flatMap((p) => [...pais(p, "2025-05-01", 10), ...pais(p, "2026-05-01", p === "A" ? 12 : 10)]);
  const pontos = derivarBancosCentraisOuro([...linhas, ...fmi]);
  const ultimo = pontos.at(-1);
  assert.equal(ultimo.observedAt, "2026-04-01");
  assert.equal(ultimo.compras4TrimestresT, 1000);
  assert.equal(ultimo.media3AnosT, 800);
  assert.equal(ultimo.desvio3AnosT, 200);
  assert.equal(ultimo.declaradas12mT, 62.2);
  assert.equal(ultimo.declaradasPaises, 5);
  assert.equal(ultimo.decisao.direcao, "ALTA");
  assert.equal(ultimo.decisao.intensidade, "MODERADA");
  // Sem os 12 trimestres anteriores, não há média.
  assert.equal(pontos.at(-2).media3AnosT, null);
});

test("bancos centrais: o WGC e os países do FMI, descobertos no banco pelo prefixo", async () => {
  let pedido = null;
  const deps = {
    observationRepository: { listarUltimasDatasItens: async () => [{ codigo: "CHN" }, { codigo: "POL" }] },
    pointInTimeService: {
      obterAsOf: async ({ seriesCodes }) => {
        pedido = seriesCodes;
        return [];
      }
    }
  };
  assert.deepEqual(await calcularBancosCentraisOuro({ asOf: new Date() }, deps), []);
  assert.deepEqual(pedido, [
    "WGC.OFERTA_DEMANDA.BANCOS_CENTRAIS",
    "IMF.IRFCL.OURO.CHN.VOLUME_MI_OZT",
    "IMF.IRFCL.OURO.CHN.VALOR_MI_USD",
    "IMF.IRFCL.OURO.POL.VOLUME_MI_OZT",
    "IMF.IRFCL.OURO.POL.VALOR_MI_USD"
  ]);
});

test("ETFs: a semana só entra com as quatro regiões; o fluxo é contra 13 semanas antes, em %", () => {
  const regioes = ["AMERICA_DO_NORTE", "EUROPA", "ASIA", "OUTROS"];
  const sextas = Array.from({ length: 14 }, (_, i) => somarDias("2026-06-26", 7 * i));
  const linhas = sextas.flatMap((d, i) => regioes.map((r) => linha(`WGC.ETF.${r}.TONELADAS`, d, i === 13 ? 110 : 100)));
  linhas.push(linha("WGC.ETF.EUROPA.TONELADAS", "2026-10-02", 999)); // semana sem as outras regiões
  const pontos = derivarEtfsOuro(linhas);
  assert.equal(pontos.at(-1).observedAt, "2026-09-25");
  assert.equal(pontos.at(-1).totalT, 440);
  assert.equal(pontos.at(-1).fluxo13SemanasT, 40);
  assert.equal(pontos.at(-1).fluxo13SemanasPct, 10);
  assert.equal(pontos.at(-1).decisao.direcao, "ALTA");
});

test("mineração: 4 trimestres somados contra os mesmos um ano antes; o texto do prompt diz o trimestre", () => {
  const trimestres = Array.from({ length: 8 }, (_, i) => somarMeses("2024-07-01", 3 * i));
  const linhas = trimestres.map((t, i) => linha("WGC.OFERTA_DEMANDA.PRODUCAO_MINAS", t, i < 4 ? 900 : 945));
  const ponto = derivarMineracaoOuro(linhas).at(-1);
  assert.equal(ponto.observedAt, "2026-04-01");
  assert.equal(ponto.producao4TrimestresT, 3780);
  assert.equal(ponto.producao4TrimestresAntesT, 3600);
  assert.equal(ponto.crescimentoAnualPct, 5);
  assert.equal(ponto.decisao.direcao, "BAIXA");

  const { METODOLOGIA } = require("./mineracao-ouro.factor");
  const texto = montarTextoPrompt({
    ativo: "OURO",
    fator: { codigo: "OURO_MINERACAO", nome: "Mineração", peso: "Baixo" },
    calculo: { ...METODOLOGIA, parametros: METODOLOGIA.parametrosPadrao, origemParametros: null, simulacao: false },
    ponto
  });
  assert.match(texto, /^Trimestre de 2º\/2026\./m);
  assert.match(texto, /tendência em 2 trimestres/);
});
