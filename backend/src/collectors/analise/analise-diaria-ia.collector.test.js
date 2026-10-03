"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const collector = require("./analise-diaria-ia.collector");

const PROMPT_DIARIO = {
  ativo: "PETROLEO",
  dataAnalise: "2026-10-03",
  versaoPrompt: "petroleo-analise-diaria@1",
  versaoMetodologia: "petroleo-v1 (2026-10-02)",
  versaoConfiguracao: 1,
  hashEntrada: "a".repeat(64),
  instrucaoDoSistema: "INSTRUÇÃO",
  prompt: "PROMPT",
  entrada: { horizontes: [], fatores: [{ fator: "PETROLEO_JUROS" }, { fator: "PETROLEO_COT" }] }
};

function leitura(horizonte) {
  return {
    horizonte,
    tendencia: "BAIXA",
    faixa: "BAIXA_LEVE",
    confianca: "BAIXA",
    tese: "Tese.",
    fatoresAFavor: [{ fator: "PETROLEO_JUROS", argumento: "...", evidencias: ["E1"] }],
    evidencias: [{ id: "E1", origem: "FATOR", fator: "PETROLEO_JUROS" }],
    lacunas: [],
    invalidaSe: "Condição."
  };
}
const RESPOSTA_VALIDA = JSON.stringify({ leituras: ["IMEDIATO", "CURTO", "MEDIO", "LONGO"].map(leitura) });

function provedorFalso(textos) {
  const chamadas = [];
  return {
    chamadas,
    gerarJson: async (entrada) => {
      chamadas.push(entrada);
      return { texto: textos[Math.min(chamadas.length - 1, textos.length - 1)], modelo: "gemini-x", tokens: 1000, chave: "gratuita" };
    }
  };
}

function depsCom({ textos = [RESPOSTA_VALIDA], existe = false, refazer = false } = {}) {
  const provedor = provedorFalso(textos);
  const montados = [];
  return {
    provedor,
    montados,
    deps: {
      geminiSearch: provedor,
      dataAnalise: "2026-10-03",
      refazer,
      analiseDiariaRepository: { existeAnaliseDoDia: async () => existe },
      promptDiarioService: {
        montarPromptDiario: async (ativo, opcoes) => {
          montados.push([ativo, opcoes.data]);
          return { promptDiario: PROMPT_DIARIO };
        }
      }
    }
  };
}

test("envia o prompt diário do petróleo da data, sem busca, e grava as quatro leituras com a proveniência", async () => {
  const { deps, provedor, montados } = depsCom();
  const bruto = await collector.download({ signal: undefined }, deps);
  assert.deepEqual(montados, [["PETROLEO", "2026-10-03"]]);
  assert.deepEqual(provedor.chamadas.map((c) => [c.systemInstruction, c.prompt]), [["INSTRUÇÃO", "PROMPT"]]);

  const { validos, invalidos, detalhes } = collector.normalize(collector.parse(bruto));
  assert.deepEqual(invalidos, []);
  const { analise } = validos[0];
  assert.equal(analise.ativo, "PETROLEO");
  assert.equal(analise.data_analise, "2026-10-03");
  assert.equal(analise.hash_entrada, PROMPT_DIARIO.hashEntrada);
  assert.equal(analise.versao_configuracao, 1);
  assert.equal(analise.resposta_bruta, RESPOSTA_VALIDA);
  assert.equal(analise.leituras.length, 4);
  assert.deepEqual(detalhes.ia, {
    chave: "gratuita",
    modelo: "gemini-x",
    tokens: 1000,
    respostasRecusadas: 0,
    versaoPrompt: "petroleo-analise-diaria@1",
    versaoMetodologia: "petroleo-v1 (2026-10-02)",
    hashEntrada: PROMPT_DIARIO.hashEntrada
  });

  const gravadas = [];
  const resultado = await collector.persist(validos, { execucaoId: "exec-1" }, {
    analiseDiariaRepository: { substituirAnaliseDoDia: async (a) => (gravadas.push(a), { substituiu: false }) }
  });
  assert.equal(resultado.criados, 1);
  assert.equal(gravadas[0].collection_execution_id, "exec-1");
});

test("uma leitura por dia: com a do dia já gravada, pula a chamada (salvo REFAZER)", async () => {
  const { deps, provedor } = depsCom({ existe: true });
  const bruto = await collector.download({}, deps);
  assert.equal(provedor.chamadas.length, 0);
  const { validos } = collector.normalize(collector.parse(bruto));
  const resultado = await collector.persist(validos, { execucaoId: "x" }, { analiseDiariaRepository: {} });
  assert.equal(resultado.ignorados, 1);

  const refazer = depsCom({ existe: true, refazer: true });
  await collector.download({}, refazer.deps);
  assert.equal(refazer.provedor.chamadas.length, 1);
});

test("resposta recusada: uma nova chamada; se a 2ª passa, grava a 2ª e conta os tokens das duas", async () => {
  const { deps, provedor } = depsCom({ textos: ["não é JSON", RESPOSTA_VALIDA] });
  const bruto = await collector.download({}, deps);
  assert.equal(provedor.chamadas.length, 2);
  const { validos, detalhes } = collector.normalize(collector.parse(bruto));
  assert.equal(validos.length, 1);
  assert.equal(detalhes.ia.respostasRecusadas, 1);
  assert.equal(detalhes.ia.tokens, 2000);
});

test("recusada duas vezes: nada é gravado e os motivos vão para a execução", async () => {
  const fatorInventado = JSON.stringify({
    leituras: ["IMEDIATO", "CURTO", "MEDIO", "LONGO"].map((h) => ({ ...leitura(h), fatoresAFavor: [{ fator: "PETROLEO_GUIANA", evidencias: [] }] }))
  });
  const { deps, provedor } = depsCom({ textos: [fatorInventado] });
  const bruto = await collector.download({}, deps);
  assert.equal(provedor.chamadas.length, 2);
  const { validos, invalidos, detalhes } = collector.normalize(collector.parse(bruto));
  assert.deepEqual(validos, []);
  assert.ok(invalidos.length > 0);
  assert.ok(invalidos.every((i) => /PETROLEO_GUIANA/.test(i.motivo)));
  assert.equal(detalhes.ia.modelo, "gemini-x");
});
