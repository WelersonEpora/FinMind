"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { FATORES } = require("./fatores-fel1");
const { SITUACAO, obterMetodologiaPetroleo } = require("./metodologia-petroleo");
const { buscarNoCatalogo } = require("../services/observaveis.service");
const { obterMetodologiaAtivo, calcularFator, listarParametros, salvarParametros } = require("../services/metodologia-ativo.service");
const { PARAMETROS_PADRAO } = require("../factors/estoques-petroleo-eia.factor");

// Repositório de parâmetros em memória: as versões gravadas, a maior é a vigente.
function repoFalso(versoes = []) {
  const gravadas = [...versoes];
  return {
    gravadas,
    buscarVigente: async () => gravadas.at(-1) || null,
    listarVersoes: async () => [...gravadas].reverse(),
    criarVersao: async ({ parametros, motivo, alteradoPor }) => {
      gravadas.push({ versao: gravadas.length + 1, parametros, motivo, alteradoPor: { id: alteradoPor, nome: "Admin" }, alteradoEm: new Date() });
      return gravadas.length;
    }
  };
}
const semDados = { obterAsOf: async () => [] };

const { fatores } = obterMetodologiaPetroleo();

test("cobre os 10 fatores do petróleo da planilha, na mesma ordem, com nome e peso dela", () => {
  const daPlanilha = FATORES.filter((fator) => fator.ativo === "PETROLEO");
  assert.deepEqual(
    fatores.map(({ codigo, nome, peso }) => ({ codigo, nome, peso })),
    daPlanilha.map(({ codigo, nome, peso }) => ({ codigo, nome, peso }))
  );
});

test("cada fator traz as 4 colunas do FEL 1 preenchidas", () => {
  for (const fator of fatores) {
    for (const campo of ["tipo", "direcao", "mecanismo", "fonte"]) {
      assert.ok(fator.fel1[campo], `${fator.codigo} sem fel1.${campo}`);
    }
  }
});

test("toda proposta sai marcada como PROPOSTA: nenhuma foi validada pelo David ainda", () => {
  assert.ok(fatores.every((fator) => fator.proposta.situacao === SITUACAO.PROPOSTA));
});

test("todo fator tem dado (observável ou eventos) e ao menos uma pergunta ao David", () => {
  for (const fator of fatores) {
    assert.ok(fator.dados.observaveis.length > 0 || fator.dados.eventos, `${fator.codigo} sem dado`);
    assert.ok(fator.perguntas.length > 0, `${fator.codigo} sem pergunta`);
  }
});

test("todo observável citado existe no catálogo", () => {
  for (const fator of fatores) {
    for (const codigo of fator.dados.observaveis) {
      assert.ok(buscarNoCatalogo(codigo), `${fator.codigo}: observável ${codigo} não está no catálogo`);
    }
  }
});

test("a API aceita o ativo sem diferenciar maiúsculas; ativo do FEL 1 sem metodologia vem nulo; fora do FEL 1, 404", () => {
  assert.equal(obterMetodologiaAtivo("petroleo").metodologia.ativo, "PETROLEO");
  assert.throws(() => obterMetodologiaAtivo("SOJA"), (err) => err.statusCode === 404);
  const ouro = obterMetodologiaAtivo("ouro");
  assert.equal(ouro.metodologia, null);
  assert.deepEqual(ouro.ativo, { codigo: "OURO", nome: "Ouro" });
  assert.deepEqual(
    ouro.ativos.map((a) => `${a.codigo}:${a.disponivel}`),
    ["OURO:false", "PETROLEO:true", "MILHO:false", "CAFE:false"]
  );
});

test("a API devolve o observável com o nome do card", () => {
  const { metodologia } = obterMetodologiaAtivo("PETROLEO");
  const estoques = metodologia.fatores.find((fator) => fator.codigo === "PETROLEO_ESTOQUES_EIA");
  assert.deepEqual(estoques.dados.observaveis, [{ codigo: "PETROLEO_ESTOQUES_EIA", nome: "Petróleo EUA - estoques (EIA)" }]);
});

test("os fatores de estoques, demanda, produção e refino saem marcados como calculados; os demais não", () => {
  const { metodologia } = obterMetodologiaAtivo("PETROLEO");
  assert.deepEqual(
    metodologia.fatores.filter((fator) => fator.calculado).map((fator) => fator.codigo),
    ["PETROLEO_ESTOQUES_EIA", "PETROLEO_DEMANDA", "PETROLEO_PRODUCAO_EUA", "PETROLEO_REFINO"]
  );
});

// Contrato da tela genérica: todo campo que a apresentação de um fator cita existe nos pontos que o cálculo devolve,
// os parâmetros da tela são os do fator, e a explicação fecha com o peso do FEL 1.
const LINHAS_SINTETICAS = {
  PETROLEO_ESTOQUES_EIA: { serie: "EIA.PETROLEO_ESTOQUES.PETROLEO_SEM_SPR", base: 420000 },
  PETROLEO_PRODUCAO_EUA: { serie: "EIA.PETROLEO_FLUXOS.PRODUCAO", base: 13000 },
  PETROLEO_DEMANDA: { serie: "EIA.PETROLEO_FLUXOS.DERIVADOS_FORNECIDOS", base: 20000 },
  PETROLEO_REFINO: { gerar: diasDePrecos }
};

// O refino lê preços diários (Brent, gasolina e diesel) e a utilização semanal: 7 anos de dias úteis.
function diasDePrecos() {
  const linhas = [];
  const inicio = Date.UTC(2015, 0, 5);
  const linha = (serie, observedAt, value) => ({ seriesCode: serie, observedAt, value, publishedAt: new Date(), publishedAtIsEstimated: true });
  for (let i = 0; i < 365 * 7; i += 1) {
    const data = new Date(inicio + i * 86400000);
    const dia = data.getUTCDay();
    const observedAt = data.toISOString().slice(0, 10);
    if (dia === 0 || dia === 6) continue;
    linhas.push(linha("EIA.PETROLEO_PRECOS.BRENT", observedAt, 70 + (i % 30)));
    linhas.push(linha("EIA.PETROLEO_PRECOS.GASOLINA_NY", observedAt, 2.2 + (i % 17) / 100));
    linhas.push(linha("EIA.PETROLEO_PRECOS.DIESEL_NY", observedAt, 2.5 + (i % 23) / 100));
    if (dia === 5) linhas.push(linha("EIA.PETROLEO_FLUXOS.UTILIZACAO_REFINARIAS", observedAt, 90));
  }
  return linhas;
}

function semanasSinteticas({ serie, base }) {
  const linhas = [];
  const inicio = Date.UTC(2015, 0, 2);
  for (let i = 0; i < 52 * 7; i += 1) {
    const observedAt = new Date(inicio + i * 7 * 86400000).toISOString().slice(0, 10);
    linhas.push({ seriesCode: serie, observedAt, value: base + (i % 13) * 100 + i * 5, publishedAt: new Date(), publishedAtIsEstimated: true });
  }
  return linhas;
}

for (const codigo of Object.keys(LINHAS_SINTETICAS)) {
  test(`contrato da tela genérica: ${codigo}`, async () => {
    const definicao = LINHAS_SINTETICAS[codigo];
    const pointInTimeService = { obterAsOf: async () => (definicao.gerar ? definicao.gerar() : semanasSinteticas(definicao)) };
    const deps = { pointInTimeService, fatorParametroRepository: repoFalso() };
    const { calculo } = await calcularFator("PETROLEO", codigo, {}, deps);
    const ultimo = calculo.pontos.at(-1);
    const { apresentacao } = calculo;
    const campos = [
      ...apresentacao.quadros.flatMap((q) => [q.campo, q.secundario?.campo].filter(Boolean)),
      ...apresentacao.graficoAB.series.map((serie) => serie.campo),
      apresentacao.graficoAB.exigeCampo,
      apresentacao.graficoC.campo
    ];
    for (const campo of campos) assert.ok(campo in ultimo, `${codigo}: o ponto não tem o campo "${campo}"`);
    assert.ok(typeof ultimo[apresentacao.graficoC.campo] === "number", `${codigo}: a medida da decisão está vazia`);
    assert.ok(ultimo.decisao);
    assert.deepEqual(apresentacao.parametros.map((parametro) => parametro.chave).sort(), Object.keys(calculo.parametrosPadrao).sort());
    assert.ok(calculo.explicacao.length >= 4);
    assert.match(calculo.explicacao.at(-1), /do FEL 1/);
    assert.ok(apresentacao.rotulosDecisao.tendencia[ultimo.decisao.tendencia ?? "ESTAVEL"]);
    assert.ok(calculo.exemplos.episodios.length > 0 && calculo.exemplos.cenarios.every((c) => c.decisao));
  });
}

test("o cálculo devolve a proposta com a situação dela e recusa fator sem cálculo e data inválida", async () => {
  const deps = { pointInTimeService: semDados, fatorParametroRepository: repoFalso() };
  const { calculo } = await calcularFator("PETROLEO", "petroleo_estoques_eia", { desde: "2026-01-02" }, deps);
  assert.equal(calculo.situacao, "PROPOSTA");
  assert.equal(calculo.tempoReal, false);
  assert.deepEqual(calculo.pontos, []);
  assert.ok(calculo.exemplos.cenarios.length > 0);
  await assert.rejects(calcularFator("PETROLEO", "PETROLEO_OPEP", {}, deps), (err) => err.statusCode === 404);
  await assert.rejects(calcularFator("PETROLEO", "PETROLEO_ESTOQUES_EIA", { desde: "02/01/2026" }, deps), (err) => err.statusCode === 400);
});

test("a avaliação do dado, quando existe, diz se basta e por quê", () => {
  const avaliados = fatores.filter((fator) => fator.dados.avaliacao);
  assert.ok(avaliados.some((fator) => fator.codigo === "PETROLEO_ESTOQUES_EIA"));
  for (const fator of avaliados) {
    assert.equal(typeof fator.dados.avaliacao.suficiente, "boolean");
    assert.ok(fator.dados.avaliacao.texto);
  }
});

test("o cálculo usa os parâmetros padrão da camada C e aceita outros para simular, recusando os inválidos", async () => {
  let recebidos;
  const deps = { pointInTimeService: semDados, fatorParametroRepository: repoFalso() };
  const padrao = (await calcularFator("PETROLEO", "PETROLEO_ESTOQUES_EIA", {}, deps)).calculo;
  assert.deepEqual(padrao.parametros, padrao.parametrosPadrao);
  assert.equal(padrao.peso, "Alto");
  recebidos = (await calcularFator("PETROLEO", "PETROLEO_ESTOQUES_EIA", { limiarModeradoPct: "5", semanasTendencia: "8" }, deps)).calculo.parametros;
  assert.equal(recebidos.limiarModeradoPct, 5);
  assert.equal(recebidos.semanasTendencia, 8);
  assert.equal(recebidos.limiarFortePct, padrao.parametrosPadrao.limiarFortePct);
  for (const invalido of [{ limiarModeradoPct: "abc" }, { limiarModeradoPct: "12" }, { semanasTendencia: "2.5" }, { limiarFortePct: "-1" }]) {
    await assert.rejects(calcularFator("PETROLEO", "PETROLEO_ESTOQUES_EIA", invalido, deps), (err) => err.statusCode === 400);
  }
});

test("sem versão gravada, os valores do sistema são os padrões do código; com versão, a última; a simulação é marcada", async () => {
  const semVersao = (await calcularFator("PETROLEO", "PETROLEO_ESTOQUES_EIA", {}, { pointInTimeService: semDados, fatorParametroRepository: repoFalso() })).calculo;
  assert.deepEqual(semVersao.parametrosSistema, PARAMETROS_PADRAO);
  assert.equal(semVersao.origemParametros, null);
  assert.equal(semVersao.simulacao, false);

  const salvos = { ...PARAMETROS_PADRAO, limiarModeradoPct: 4 };
  const repo = repoFalso([{ versao: 1, parametros: salvos, motivo: "Teste", alteradoPor: { id: "u1", nome: "Admin" }, alteradoEm: new Date() }]);
  const deps = { pointInTimeService: semDados, fatorParametroRepository: repo };
  const comVersao = (await calcularFator("PETROLEO", "PETROLEO_ESTOQUES_EIA", {}, deps)).calculo;
  assert.equal(comVersao.parametros.limiarModeradoPct, 4);
  assert.equal(comVersao.origemParametros.versao, 1);
  assert.equal(comVersao.simulacao, false);

  const simulado = (await calcularFator("PETROLEO", "PETROLEO_ESTOQUES_EIA", { limiarModeradoPct: "2" }, deps)).calculo;
  assert.equal(simulado.simulacao, true);
  assert.equal(simulado.parametrosSistema.limiarModeradoPct, 4);
});

test("salvar grava uma versão nova com motivo e autor; recusa incompleto, inválido, sem motivo e igual ao em uso", async () => {
  const repo = repoFalso();
  const deps = { fatorParametroRepository: repo };
  const novos = { ...PARAMETROS_PADRAO, limiarFortePct: 12 };
  const { parametros } = await salvarParametros("PETROLEO", "PETROLEO_ESTOQUES_EIA", { parametros: novos, motivo: "Ajuste do Comitê" }, "u1", deps);
  assert.equal(parametros.versao, 1);
  assert.equal(repo.gravadas[0].motivo, "Ajuste do Comitê");
  assert.equal(repo.gravadas[0].alteradoPor.id, "u1");

  const recusa = (corpo) => assert.rejects(salvarParametros("PETROLEO", "PETROLEO_ESTOQUES_EIA", corpo, "u1", deps), (err) => err.statusCode === 400);
  await recusa({ parametros: { limiarModeradoPct: 3 }, motivo: "Incompleto" });
  await recusa({ parametros: { ...novos, limiarModeradoPct: 20 }, motivo: "Moderado acima do forte" });
  await recusa({ parametros: { ...novos, limiarFortePct: 13 }, motivo: "  " });
  await recusa({ parametros: novos, motivo: "Iguais aos em uso" });
  assert.equal(repo.gravadas.length, 1);
});

test("salvar ao mesmo tempo que outro admin vira 409; o histórico lista as versões e os padrões", async () => {
  const repo = repoFalso();
  repo.criarVersao = async () => { throw Object.assign(new Error("dup"), { name: "SequelizeUniqueConstraintError" }); };
  await assert.rejects(
    salvarParametros("PETROLEO", "PETROLEO_ESTOQUES_EIA", { parametros: { ...PARAMETROS_PADRAO, limiarFortePct: 12 }, motivo: "Corrida" }, "u1", { fatorParametroRepository: repo }),
    (err) => err.statusCode === 409
  );
  const { parametros } = await listarParametros("PETROLEO", "PETROLEO_ESTOQUES_EIA", { fatorParametroRepository: repoFalso() });
  assert.deepEqual(parametros, { versoes: [], padrao: PARAMETROS_PADRAO });
});
