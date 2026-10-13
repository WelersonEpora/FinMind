"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { recomendar, replicar } = require("./recomendacao-carteira.service");

const LEITURAS = {
  MILHO: [{ horizonte: "MEDIO", tendencia: "ALTA", confianca: "MEDIA" }],
  CAFE: null
};
const VALIDA = JSON.stringify({
  recomendacoes: [
    {
      ativo: "MILHO",
      prioridade: 1,
      semPosicao: { acao: "ENTRAR_VENDIDO", porque: "Contra o MEDIO de propósito." },
      comprado: { acao: "MANTER", porque: "Segue." },
      vendido: { acao: "ZERAR", porque: "Contra." },
      evidencias: ["MILHO.MEDIO"],
      invalidaSe: "Se virar."
    }
  ]
});
const USO = { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 50, totalTokenCount: 1150 };

function ambiente({ respostas = [VALIDA], modelo = "gemini-3.8-flash", devolvido = modelo, apiKey = "paga", erro = null } = {}) {
  const chamadas = [];
  const fila = [...respostas];
  return {
    chamadas,
    deps: {
      recomendacaoCarteira: { model: modelo, precoEntrada: 1, precoSaida: 2 },
      gemini: { apiKeyFree: "gratuita", apiKey, model: "gemini-flash-latest", timeoutMs: 1000 },
      geopoliticaService: { obterEventosDoAtivo: async () => ({ eventos: [{ data: "2026-10-13", titulo: "Geada" }] }) },
      geminiSearch: {
        gerarJson: async (pedido, deps) => {
          chamadas.push({ pedido, gemini: deps.gemini });
          if (erro) throw new Error(erro);
          return { texto: fila.shift(), modelo: devolvido, uso: USO, tentativas: [{ chave: "paga", resultado: "ok", segundos: 1 }] };
        }
      }
    }
  };
}

const pedir = (deps) => recomendar({ data: "2026-10-14", ativos: ["MILHO", "CAFE"], leiturasPorAtivo: LEITURAS }, deps);

test("válida: só a chave paga e o modelo fixado; o prompt com a entrada; contrária marcada; tokens e custo", async () => {
  const { chamadas, deps } = ambiente();
  const r = await pedir(deps);
  assert.equal(r.situacao, "VALIDA");
  assert.equal(chamadas.length, 1);
  assert.deepEqual([chamadas[0].gemini.apiKeyFree, chamadas[0].gemini.model], ["", "gemini-3.8-flash"]);
  assert.match(r.prompt, /\[MILHO\.MEDIO\]/);
  assert.match(r.prompt, /\[MILHO\.EV1\] 2026-10-13: Geada/);
  assert.doesNotMatch(r.prompt, /CAFE/);
  assert.deepEqual(r.entrada.semLeitura, ["CAFE"]);
  assert.deepEqual(r.contrarias, { MILHO: ["semPosicao"] });
  assert.equal(r.versao_prompt, "carteira-recomendacao@1");
  assert.deepEqual(r.tokens, { entrada: 1000, saida: 100, raciocinio: 50, total: 1150 });
  assert.equal(r.custo_usd, 0.0013);
  assert.equal(r.hash_entrada.length, 64);
});

test("uma resposta inválida leva a outra chamada; duas inválidas, FALHA com as duas guardadas", async () => {
  const segunda = ambiente({ respostas: ["{}", VALIDA] });
  const r1 = await pedir(segunda.deps);
  assert.deepEqual([r1.situacao, r1.respostas.length, r1.motivo_falha], ["VALIDA", 2, null]);
  assert.equal(r1.tokens.total, 2300);

  const r2 = await pedir(ambiente({ respostas: ["{}", "nada"] }).deps);
  assert.deepEqual([r2.situacao, r2.motivo_falha, r2.respostas.length], ["FALHA", "RESPOSTA_INVALIDA", 2]);
  assert.ok(r2.respostas[1].erros.length > 0);
});

test("modelo devolvido diferente do pedido é resposta inválida", async () => {
  const r = await pedir(ambiente({ devolvido: "gemini-3.9-flash" }).deps);
  assert.deepEqual([r.situacao, r.motivo_falha, r.modelo_devolvido], ["FALHA", "MODELO_DIFERENTE", "gemini-3.9-flash"]);
});

test("sem chamada: modelo alias ou vazio, sem chave paga, sem leituras; Gemini fora vira FALHA, nunca exceção", async () => {
  for (const [opcoes, motivo] of [
    [{ modelo: "gemini-flash-latest" }, "MODELO_NAO_FIXADO"],
    [{ modelo: "" }, "MODELO_NAO_FIXADO"],
    [{ apiKey: "" }, "SEM_CHAVE_PAGA"]
  ]) {
    const { chamadas, deps } = ambiente(opcoes);
    const r = await pedir(deps);
    assert.deepEqual([r.situacao, r.motivo_falha, chamadas.length], ["FALHA", motivo, 0]);
  }
  const { deps } = ambiente();
  const vazio = await recomendar({ data: "2026-10-14", ativos: ["CAFE"], leiturasPorAtivo: { CAFE: null } }, deps);
  assert.deepEqual([vazio.motivo_falha, vazio.prompt], ["SEM_LEITURAS", null]);

  const fora = await pedir(ambiente({ erro: "503" }).deps);
  assert.deepEqual([fora.situacao, fora.motivo_falha, fora.detalhes.erro], ["FALHA", "GEMINI_FORA", "503"]);
});

test("réplica: o mesmo prompt de novo, como REPLICA", async () => {
  const { chamadas, deps } = ambiente({ respostas: [VALIDA, VALIDA] });
  const principal = await pedir(deps);
  const replica = await replicar(principal, deps);
  assert.deepEqual([replica.tipo, replica.situacao, replica.hash_entrada], ["REPLICA", "VALIDA", principal.hash_entrada]);
  assert.equal(chamadas[1].pedido.prompt, chamadas[0].pedido.prompt);
});
