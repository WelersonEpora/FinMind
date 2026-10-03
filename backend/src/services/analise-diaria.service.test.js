"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { obterAnaliseDoDia, obterPromptEnviado } = require("./analise-diaria.service");
const { FATORES_PETROLEO } = require("../shared/metodologia-petroleo");

const REGISTRO = {
  data_analise: "2026-10-03",
  created_at: "2026-10-03T04:10:00.000Z",
  entrada: {
    curva: null,
    horizontes: [
      { codigo: "IMEDIATO", dias: 1, t1: 1, t2: 2.5 },
      { codigo: "CURTO", dias: 7, t1: 2, t2: 6 },
      { codigo: "MEDIO", dias: 30, t1: 5, t2: 12 },
      { codigo: "LONGO", dias: 90, t1: 8, t2: 20 }
    ],
    precoReferencia: {
      serie: "WTI",
      valor: 96.16,
      dataReferencia: "2026-09-29",
      publicadoEm: "2026-09-30T23:59:59.000Z",
      publicadoEmEstimado: true,
      variacoes: { d1: { percentual: -3.23, desde: "2026-09-28" }, d7: { percentual: -0.26, desde: "2026-09-22" }, d30: null, d90: { percentual: 37.88, desde: "2026-07-01" } }
    },
    fatores: [
      {
        fator: "PETROLEO_JUROS",
        tipo: "CALCULADO",
        peso: "Médio",
        tipoFel1: "Macroeconômico",
        situacaoRegra: "PROPOSTA",
        situacao: "ESTIMADO",
        dataReferencia: "2026-10-02",
        idadeDias: 1,
        medida: { valor: 0.93, rotulo: "Variação (B)", unidade: "p.p." },
        leitura: { pressao: "BAIXA", intensidade: "MODERADA", tendencia: "SUBINDO" },
        factorId: "juros_petroleo_treasury_10a",
        factorVersion: 1,
        parametros: { limiarModeradoPct: 0.5 }
      },
      { fator: "PETROLEO_OFERTA_NAO_OPEP", tipo: "CALCULADO", peso: "Médio", situacao: "SEM_DADO" },
      { fator: "PETROLEO_GEOPOLITICA", tipo: "EVENTO", peso: "Alto", situacao: "COM_LEITURA", janelaDias: 30, eventos: 2, ultimaLeitura: { data: "2026-10-02", nivel: "RELEVANTE" } },
      { fator: "PETROLEO_OPEP", tipo: "EVENTO", peso: "Alto", situacao: "SEM_LEITURA", janelaDias: 45, eventos: 0, ultimaLeitura: null }
    ]
  },
  leituras: [],
  instrucao_sistema: "INSTRUÇÃO",
  prompt: "PROMPT",
  resposta_bruta: '{"leituras":[]}',
  modelo: "gemini-x",
  chave: "gratuita",
  tokens: 100,
  versao_prompt: "petroleo-analise-diaria@1",
  versao_metodologia: "petroleo-v1",
  versao_configuracao: 1,
  hash_entrada: "abc"
};

const repo = (registro) => ({ buscarAnaliseDoDia: async () => registro });

test("evidências: o que foi ao prompt, da entrada GRAVADA, com o nome de cada fator e as lacunas como fatos", async () => {
  const { evidencias } = await obterAnaliseDoDia("PETROLEO", "2026-10-03", { analiseDiariaRepository: repo(REGISTRO) });

  assert.deepEqual(
    evidencias.preco.variacoes.map((v) => [v.horizonte, v.percentual]),
    [["IMEDIATO", -3.23], ["CURTO", -0.26], ["MEDIO", null], ["LONGO", 37.88]]
  );
  assert.equal(evidencias.preco.publicadoEmEstimado, true);

  const juros = evidencias.fatores.find((f) => f.codigo === "PETROLEO_JUROS");
  assert.equal(juros.nome, FATORES_PETROLEO.find((f) => f.codigo === "PETROLEO_JUROS").nome);
  assert.deepEqual(juros.leitura, { pressao: "BAIXA", intensidade: "MODERADA", tendencia: "SUBINDO" });
  assert.deepEqual(juros.parametros, { limiarModeradoPct: 0.5 });
  assert.equal(evidencias.fatores.find((f) => f.codigo === "PETROLEO_GEOPOLITICA").ultimaLeitura.nivel, "RELEVANTE");

  assert.deepEqual(
    evidencias.lacunas.map((l) => [l.codigo, l.fator]),
    [["CURVA_SEM_DADO", null], ["SEM_DADO", "PETROLEO_OFERTA_NAO_OPEP"], ["SEM_LEITURA", "PETROLEO_OPEP"]]
  );
});

test("os horizontes contam de onde a leitura gravada diz: do último preço (v1, sem o campo) ou da data da análise (v2)", async () => {
  const v1 = await obterAnaliseDoDia("PETROLEO", "2026-10-03", { analiseDiariaRepository: repo(REGISTRO) });
  assert.deepEqual(v1.referenciaHorizontes, { tipo: "DATA_DO_ULTIMO_PRECO", data: "2026-09-29" });
  assert.equal(v1.evidencias.referenciaHorizontes, "DATA_DO_ULTIMO_PRECO");

  const registroV2 = { ...REGISTRO, entrada: { ...REGISTRO.entrada, referenciaHorizontes: "DATA_DA_ANALISE" } };
  const v2 = await obterAnaliseDoDia("PETROLEO", "2026-10-03", { analiseDiariaRepository: repo(registroV2) });
  assert.deepEqual(v2.referenciaHorizontes, { tipo: "DATA_DA_ANALISE", data: "2026-10-03" });
  assert.equal(v2.evidencias.referenciaHorizontes, "DATA_DA_ANALISE");
});

test("o prompt e a resposta saem só sob demanda, como foram gravados; sem leitura na data, 404", async () => {
  const { analiseEnviada } = await obterPromptEnviado({ ativo: "PETROLEO", data: "2026-10-03" }, { analiseDiariaRepository: repo(REGISTRO) });
  assert.deepEqual(
    [analiseEnviada.instrucaoDoSistema, analiseEnviada.prompt, analiseEnviada.respostaBruta, analiseEnviada.hashEntrada],
    ["INSTRUÇÃO", "PROMPT", '{"leituras":[]}', "abc"]
  );

  // O resumo do Centro de Decisão não carrega os textos (~30 mil caracteres).
  const resumo = await obterAnaliseDoDia("PETROLEO", "2026-10-03", { analiseDiariaRepository: repo(REGISTRO) });
  assert.equal("prompt" in resumo, false);
  assert.equal("respostaBruta" in resumo, false);

  await assert.rejects(obterPromptEnviado({ ativo: "PETROLEO", data: "2026-10-01" }, { analiseDiariaRepository: repo(null) }), /Não há leitura/);
  await assert.rejects(obterPromptEnviado({ ativo: "OURO", data: "2026-10-03" }, { analiseDiariaRepository: repo(REGISTRO) }), /ativo/);
  await assert.rejects(obterPromptEnviado({ ativo: "PETROLEO", data: "03/10/2026" }, { analiseDiariaRepository: repo(REGISTRO) }), /AAAA-MM-DD/);
});
