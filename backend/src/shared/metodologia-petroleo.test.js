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
const { VALIDACAO_MOTORES } = require("./metodologia-base");
const { buscarNoCatalogo } = require("../services/observaveis.service");
const { obterMetodologiaAtivo, calcularFator, obterEventosFator, simularFatores, listarParametros, salvarParametros } = require("../services/metodologia-ativo.service");
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

test("cobre os 10 fatores do petróleo da planilha, na mesma ordem, com o nome do FEL 1 e o peso dela", () => {
  const daPlanilha = FATORES.filter((fator) => fator.ativo === "PETROLEO");
  assert.deepEqual(
    fatores.map(({ codigo, nomeFel1, peso }) => ({ codigo, nome: nomeFel1, peso })),
    daPlanilha.map(({ codigo, nome, peso }) => ({ codigo, nome, peso }))
  );
});

test("o título diz o dado usado quando ele é mais estreito que o nome do FEL 1; sem a Guiana, que não entra no cálculo", () => {
  const titulo = (codigo) => fatores.find((fator) => fator.codigo === codigo).nome;
  assert.equal(titulo("PETROLEO_OFERTA_NAO_OPEP"), "Oferta não-OPEP (Brasil, Noruega e Canadá)");
  assert.equal(titulo("PETROLEO_DEMANDA"), "Demanda dos EUA (consumo de derivados)");
  assert.equal(titulo("PETROLEO_DOLAR"), "Dólar (índice do Fed contra as economias avançadas)");
  assert.equal(titulo("PETROLEO_PRODUCAO_EUA"), "Produção dos EUA");
  const oferta = fatores.find((fator) => fator.codigo === "PETROLEO_OFERTA_NAO_OPEP");
  for (const texto of [oferta.nome, oferta.proposta.objetivo, oferta.proposta.medida, oferta.dados.avaliacao.texto]) {
    assert.doesNotMatch(texto, /Guiana/);
  }
});

test("cada fator traz as 4 colunas do FEL 1 preenchidas", () => {
  for (const fator of fatores) {
    for (const campo of ["tipo", "direcao", "mecanismo", "fonte"]) {
      assert.ok(fator.fel1[campo], `${fator.codigo} sem fel1.${campo}`);
    }
  }
});

test("os 10 fatores saem validados pelo Comitê, com o David, em 2026-10-07 (ADR 0108)", () => {
  assert.ok(fatores.every((fator) => fator.proposta.situacao === SITUACAO.VALIDADA && fator.proposta.validacao === VALIDACAO_MOTORES));
});

test("todo fator tem dado (observável ou eventos) e ao menos uma pergunta ao David ou uma decisão (a OPEP+, ADR 0091)", () => {
  for (const fator of fatores) {
    assert.ok(fator.dados.observaveis.length > 0 || fator.dados.eventos, `${fator.codigo} sem dado`);
    assert.ok(fator.perguntas.length > 0 || fator.decisoes.length > 0, `${fator.codigo} sem pergunta nem decisão`);
  }
});

test("todo observável citado existe no catálogo", () => {
  for (const fator of fatores) {
    for (const codigo of fator.dados.observaveis) {
      assert.ok(buscarNoCatalogo(codigo), `${fator.codigo}: observável ${codigo} não está no catálogo`);
    }
  }
});

test("a API aceita o ativo sem diferenciar maiúsculas; os 4 ativos do FEL 1 têm metodologia (o café desde o ADR 0060); fora do FEL 1, 404", () => {
  assert.equal(obterMetodologiaAtivo("petroleo").metodologia.ativo, "PETROLEO");
  assert.throws(() => obterMetodologiaAtivo("SOJA"), (err) => err.statusCode === 404);
  const cafe = obterMetodologiaAtivo("cafe");
  assert.equal(cafe.metodologia.ativo, "CAFE");
  assert.deepEqual(cafe.ativo, { codigo: "CAFE", nome: "Café" });
  assert.deepEqual(
    cafe.ativos.map((a) => `${a.codigo}:${a.disponivel}`),
    ["OURO:true", "PETROLEO:true", "MILHO:true", "CAFE:true"]
  );
});

test("a API devolve o observável com o nome do card", () => {
  const { metodologia } = obterMetodologiaAtivo("PETROLEO");
  const estoques = metodologia.fatores.find((fator) => fator.codigo === "PETROLEO_ESTOQUES_EIA");
  assert.deepEqual(estoques.dados.observaveis, [{ codigo: "PETROLEO_ESTOQUES_EIA", nome: "Petróleo EUA - estoques (EIA)" }]);
});

test("a OPEP+ e os fatores de estoques, demanda, dólar, produção, juros, fundos, refino e oferta não-OPEP saem marcados como calculados; a geopolítica não", () => {
  const { metodologia } = obterMetodologiaAtivo("PETROLEO");
  assert.deepEqual(
    metodologia.fatores.filter((fator) => fator.calculado).map((fator) => fator.codigo),
    ["PETROLEO_OPEP", "PETROLEO_ESTOQUES_EIA", "PETROLEO_DEMANDA", "PETROLEO_DOLAR", "PETROLEO_PRODUCAO_EUA", "PETROLEO_JUROS", "PETROLEO_FUNDOS", "PETROLEO_REFINO", "PETROLEO_OFERTA_NAO_OPEP"]
  );
});

// Contrato da tela genérica: todo campo que a apresentação de um fator cita existe nos pontos que o cálculo devolve,
// os parâmetros da tela são os do fator, e a explicação fecha com o peso do FEL 1.
const LINHAS_SINTETICAS = {
  PETROLEO_ESTOQUES_EIA: { serie: "EIA.PETROLEO_ESTOQUES.PETROLEO_SEM_SPR", base: 420000 },
  PETROLEO_PRODUCAO_EUA: { serie: "EIA.PETROLEO_FLUXOS.PRODUCAO", base: 13000 },
  PETROLEO_DEMANDA: { serie: "EIA.PETROLEO_FLUXOS.DERIVADOS_FORNECIDOS", base: 20000 },
  PETROLEO_REFINO: { gerar: diasDePrecos },
  PETROLEO_DOLAR: { gerar: diasDoDolar },
  PETROLEO_FUNDOS: { gerar: semanasDoCot },
  PETROLEO_JUROS: { gerar: diasDosJuros },
  PETROLEO_OFERTA_NAO_OPEP: { gerar: mesesDaOferta },
  PETROLEO_OPEP: { gerar: mesesDoSteo }
};

// A oferta não-OPEP lê o Brasil da ANP (m³ por UF) e Noruega e Canadá do JODI, mensais: 3 anos.
function mesesDaOferta() {
  const linhas = [];
  const linha = (serie, observedAt, value) => ({ seriesCode: serie, observedAt, value, publishedAt: new Date(), publishedAtIsEstimated: true });
  for (let i = 0; i < 36; i += 1) {
    const observedAt = new Date(Date.UTC(2023, i, 1)).toISOString().slice(0, 10);
    linhas.push(linha("ANP.PETROLEO_PRODUCAO.RJ.MAR", observedAt, 15000000 + i * 50000));
    linhas.push(linha("JODI.PETROLEO_PRODUCAO.NO.PRODUCAO", observedAt, 1800 + (i % 5) * 10));
    linhas.push(linha("JODI.PETROLEO_PRODUCAO.CA.PRODUCAO", observedAt, 4000 + i * 5));
  }
  return linhas;
}

// A OPEP+ lê a produção, a capacidade ociosa e a capacidade da OPEP e, como contexto, a OPEP+, a Rússia e a Arábia
// Saudita, do STEO, mensais: 3 anos, com a produção caindo e a ociosa subindo (um corte).
function mesesDoSteo() {
  const linhas = [];
  const linha = (item, campo, observedAt, value) => ({
    seriesCode: `EIA_STEO.PETROLEO.${item}.${campo}`,
    observedAt,
    value,
    publishedAt: new Date(),
    publishedAtIsEstimated: true
  });
  for (let i = 0; i < 36; i += 1) {
    const observedAt = new Date(Date.UTC(2023, i, 1)).toISOString().slice(0, 10);
    linhas.push(linha("OPEP", "PRODUCAO", observedAt, 28000 - i * 60));
    linhas.push(linha("OPEP", "CAPACIDADE_OCIOSA", observedAt, 2000 + i * 60));
    linhas.push(linha("OPEP", "CAPACIDADE", observedAt, 30000));
    linhas.push(linha("OPEP_MAIS", "PRODUCAO", observedAt, 40000 - i * 50));
    linhas.push(linha("RU", "PRODUCAO", observedAt, 9200));
    linhas.push(linha("SA", "PRODUCAO", observedAt, 9500 - i * 20));
  }
  return linhas;
}

// Os juros leem o Treasury de 10 anos e a meta do Fed, diários: 2 anos de dias úteis.
function diasDosJuros() {
  const linhas = [];
  const inicio = Date.UTC(2022, 0, 3);
  const linha = (serie, observedAt, value) => ({ seriesCode: serie, observedAt, value, publishedAt: new Date(), publishedAtIsEstimated: true });
  for (let i = 0; i < 365 * 2; i += 1) {
    const data = new Date(inicio + i * 86400000);
    if (data.getUTCDay() === 0 || data.getUTCDay() === 6) continue;
    const observedAt = data.toISOString().slice(0, 10);
    linhas.push(linha("FRED.DGS10", observedAt, 2 + i / 300));
    linhas.push(linha("FRED.DFEDTARU", observedAt, 0.25 + Math.floor(i / 60) * 0.25));
  }
  return linhas;
}

// Os fundos leem o COT do WTI (terças): 4 anos de comprados, vendidos e contratos em aberto.
function semanasDoCot() {
  const linhas = [];
  const inicio = Date.UTC(2020, 0, 7);
  const linha = (serie, observedAt, value) => ({ seriesCode: `CFTC.CRUDE_WTI.${serie}`, observedAt, value, publishedAt: new Date(), publishedAtIsEstimated: false });
  for (let i = 0; i < 52 * 4; i += 1) {
    const observedAt = new Date(inicio + i * 7 * 86400000).toISOString().slice(0, 10);
    linhas.push(linha("MM_LONG", observedAt, 300000 + (i % 37) * 1000));
    linhas.push(linha("MM_SHORT", observedAt, 100000 + (i % 23) * 1000));
    linhas.push(linha("OPEN_INTEREST", observedAt, 2000000));
  }
  return linhas;
}

// O dólar lê o índice diário do Fed: 3 anos de dias úteis.
function diasDoDolar() {
  const linhas = [];
  const inicio = Date.UTC(2020, 0, 6);
  for (let i = 0; i < 365 * 3; i += 1) {
    const data = new Date(inicio + i * 86400000);
    if (data.getUTCDay() === 0 || data.getUTCDay() === 6) continue;
    linhas.push({ seriesCode: "FRED.DTWEXAFEGS", observedAt: data.toISOString().slice(0, 10), value: 110 + (i % 40) / 10, publishedAt: new Date(), publishedAtIsEstimated: true });
  }
  return linhas;
}

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
    assert.match(calculo.explicacao.at(-1), /do especialista/);
    assert.ok(apresentacao.rotulosDecisao.tendencia[ultimo.decisao.tendencia ?? "ESTAVEL"]);
    assert.ok(calculo.exemplos.episodios.length > 0 && calculo.exemplos.cenarios.every((c) => c.decisao));
    // O bloco do prompt: o fator, a decisão e a regra; nenhum quadro sem valor vira "undefined".
    assert.match(calculo.textoPrompt, /^FATOR — .* — PETRÓLEO \(peso (Alto|Médio)\)\n/);
    // A regra é a da decisão por faixa ("neutra entre ..."), ou a regra própria do fator (a OPEP+, pelos quatro casos).
    // O fator de contexto (o refino, ADR 0093) não leva a regra nem a pressão: só o papel e a tendência.
    if (codigo === "PETROLEO_REFINO") {
      assert.match(calculo.textoPrompt, /\nC — Papel na análise:\n- CONTEXTO do fator PETROLEO_DEMANDA, por decisão do usuário: sem pressão própria; não conta a favor nem contra\.\n- Tendência: /);
      assert.doesNotMatch(calculo.textoPrompt, /Regra aplicada|- Pressão:/);
    } else if (codigo === "PETROLEO_FUNDOS") {
      // Só informação (ADR 0094): sem a regra nem a pressão, e sem fator-pai.
      assert.match(calculo.textoPrompt, /\nC — Papel na análise:\n- INFORMAÇÃO, por decisão do usuário: sem pressão própria; não conta a favor nem contra\.\n- Tendência: /);
      assert.doesNotMatch(calculo.textoPrompt, /Regra aplicada|- Pressão:/);
    } else {
      assert.match(calculo.textoPrompt, /\n- Regra aplicada \(parâmetros padrão do FinMind\): (neutra entre|o caso pela produção) .*\nC — Leitura do fator:\n- Pressão: (alta|baixa|neutra)\n/);
    }
    assert.match(calculo.textoPrompt, /\nD — Validação histórica \(contexto para avaliar a relação; não entra na leitura acima\):\n- /);
    assert.doesNotMatch(calculo.textoPrompt, /[Dd]ecisão sugerida/);
    assert.doesNotMatch(calculo.textoPrompt, /undefined|NaN/);
  });
}

test("o cálculo devolve a proposta com a situação dela e recusa fator sem cálculo e data inválida", async () => {
  const deps = { pointInTimeService: semDados, fatorParametroRepository: repoFalso() };
  const { calculo } = await calcularFator("PETROLEO", "petroleo_estoques_eia", { desde: "2026-01-02" }, deps);
  assert.equal(calculo.situacao, "VALIDADA");
  assert.equal(calculo.tempoReal, false);
  assert.deepEqual(calculo.pontos, []);
  assert.ok(calculo.exemplos.cenarios.length > 0);
  await assert.rejects(calcularFator("PETROLEO", "PETROLEO_GEOPOLITICA", {}, deps), (err) => err.statusCode === 404);
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

test("o refino é o único fator de contexto do petróleo: da demanda, por decisão do usuário (ADR 0093), sem pergunta pendente", () => {
  assert.deepEqual(
    fatores.filter((fator) => fator.contextoDe).map((fator) => [fator.codigo, fator.contextoDe, fator.papelDecididoPor]),
    [["PETROLEO_REFINO", "PETROLEO_DEMANDA", "do usuário"]]
  );
  const refino = fatores.find((fator) => fator.codigo === "PETROLEO_REFINO");
  assert.deepEqual(refino.perguntas, []);
  assert.equal(refino.decisoes.length, 2);
});

test("os fundos são o único fator só de informação do petróleo, por decisão do usuário (ADR 0094), sem pergunta pendente", () => {
  assert.deepEqual(
    fatores.filter((fator) => fator.informativo).map((fator) => [fator.codigo, fator.contextoDe, fator.papelDecididoPor]),
    [["PETROLEO_FUNDOS", null, "do usuário"]]
  );
  const fundos = fatores.find((fator) => fator.codigo === "PETROLEO_FUNDOS");
  assert.deepEqual(fundos.perguntas, []);
  assert.equal(fundos.decisoes.length, 2);
});

test("a geopolítica sai como fator de evento, sem cálculo; a OPEP+, calculada e com eventos (ADR 0091)", () => {
  const { metodologia } = obterMetodologiaAtivo("PETROLEO");
  assert.deepEqual(
    metodologia.fatores.filter((fator) => fator.deEvento).map((fator) => [fator.codigo, fator.evento.janelaDias]),
    [["PETROLEO_GEOPOLITICA", 7]]
  );
  assert.deepEqual(
    metodologia.fatores.filter((fator) => fator.comEventos).map((fator) => [fator.codigo, fator.evento.janelaDias]),
    [["PETROLEO_OPEP", 45]]
  );
  for (const fator of metodologia.fatores.filter((item) => item.deEvento)) assert.equal(fator.calculado, false);
});

test("o resultado de um fator de evento são os eventos dele na janela do fator até hoje (São Paulo); outro fator, 404", async () => {
  let pedido;
  const geopoliticaService = {
    async obterEventosDoFator(...args) {
      pedido = args.slice(0, 4);
      return { contexto: "EVENTOS DO FATOR" };
    }
  };
  // 02h UTC de 04/10 ainda é 03/10 em São Paulo.
  const opcoes = { geopoliticaService, agora: new Date("2026-10-04T02:00:00Z") };
  const { eventosFator } = await obterEventosFator("petroleo", "petroleo_geopolitica", {}, opcoes);
  assert.deepEqual(pedido, ["PETROLEO", "PETROLEO_GEOPOLITICA", "2026-10-03", { janelaDias: 7, comCalculo: false }]);
  // Logo abaixo do título, a identificação do fator no catálogo (o código que a IA cita, o peso e o tipo no FEL 1).
  assert.match(eventosFator.contexto, /^EVENTOS DO FATOR\nCódigo: PETROLEO_GEOPOLITICA \| Peso no FEL 1: [^|]+\| Tipo no FEL 1: [^|]+\| Regra: fator de evento \(janela de 7 dias\)$/);
  // A OPEP+ é calculada e com eventos (ADR 0091): o bloco vai depois do texto do cálculo, que já identifica o fator.
  const opep = await obterEventosFator("petroleo", "petroleo_opep", {}, opcoes);
  assert.deepEqual(pedido, ["PETROLEO", "PETROLEO_OPEP", "2026-10-03", { janelaDias: 45, comCalculo: true }]);
  assert.equal(opep.eventosFator.contexto, "EVENTOS DO FATOR");
  await assert.rejects(obterEventosFator("PETROLEO", "PETROLEO_DOLAR", {}, { geopoliticaService }), (err) => err.statusCode === 404);
});

test("simulação: os 10 fatores na data (calculados até o fim dela, eventos na janela dela), com a versão da metodologia", async () => {
  let asOf;
  const pointInTimeService = { obterAsOf: async (args) => { asOf = args.asOf; return []; } };
  const datasEventos = [];
  let eventosDoAtivo;
  const geopoliticaService = {
    async obterEventosDoFator(ativo, fator, data, janela) {
      datasEventos.push(data);
      return { eventos: [], janelaDias: janela.janelaDias, primeiraLeitura: null, ultimaLeitura: null, contexto: `EVENTOS DO FATOR ${fator}` };
    },
    async obterEventosDoAtivo(ativo, data, opcoes) {
      datasEventos.push(data);
      eventosDoAtivo = opcoes;
      return { eventos: [], janelaDias: opcoes.janelaDias, janelaPorFator: opcoes.janelaPorFator, primeiraLeitura: null, ultimaLeitura: null, contexto: "EVENTOS DO ATIVO" };
    }
  };
  const deps = { pointInTimeService, geopoliticaService, fatorParametroRepository: repoFalso(), agora: new Date("2026-10-03T12:00:00Z") };
  const { simulacao } = await simularFatores("petroleo", { data: "2022-03-15" }, deps);
  assert.equal(simulacao.data, "2022-03-15");
  assert.equal(asOf.toISOString(), "2022-03-16T02:59:59.999Z");
  assert.deepEqual([...new Set(datasEventos)], ["2022-03-15"]);
  assert.equal(simulacao.fatores.length, 10);
  assert.deepEqual(simulacao.fatores.filter((f) => f.tipo === "EVENTO").map((f) => f.codigo), ["PETROLEO_GEOPOLITICA"]);
  assert.ok(simulacao.fatores.filter((f) => f.tipo === "CALCULADO").every((f) => f.medida === null && f.textoPrompt.startsWith("FATOR — ")));
  assert.equal(simulacao.versaoMetodologia, "petroleo-v12 (2026-10-08)");
  // Os eventos do ativo numa seção da base (ADR 0095), sem os dos dois fatores de evento.
  assert.deepEqual(eventosDoAtivo, { janelaDias: 7, janelaPorFator: {}, excluirFatores: ["PETROLEO_OPEP", "PETROLEO_GEOPOLITICA"] });
  assert.equal(simulacao.eventosDoAtivo.textoPrompt, "EVENTOS DO ATIVO");
  // A OPEP+ é calculada e com eventos: o texto do cálculo e, depois, o bloco dos eventos.
  assert.match(simulacao.fatores[0].textoPrompt, /^FATOR — Decisões da OPEP\+[^\n]*\n[\s\S]*\n\nEVENTOS DO FATOR PETROLEO_OPEP$/);
  // O prompt completo é do prompt-diario.service.js: a simulação não monta um texto próprio.
  assert.equal(simulacao.promptCompleto, undefined);
});

test("simulação: data obrigatória, válida e não no futuro", async () => {
  const deps = { agora: new Date("2026-10-03T12:00:00Z") };
  await assert.rejects(simularFatores("PETROLEO", {}, deps), (err) => err.statusCode === 400);
  await assert.rejects(simularFatores("PETROLEO", { data: "15/03/2022" }, deps), (err) => err.statusCode === 400);
  await assert.rejects(simularFatores("PETROLEO", { data: "2026-10-04" }, deps), /futuro/);
});
