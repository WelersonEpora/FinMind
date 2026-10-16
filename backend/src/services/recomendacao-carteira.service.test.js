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

// A tabela global `recomendacao_ia`, em memória.
function repositorioFalso(linhas = []) {
  const mesmaChave = (a, b) => ["data", "tipo", "hash_entrada", "versao_prompt", "modelo_pedido"].every((k) => a[k] === b[k]);
  return {
    linhas,
    buscarValida: async (chave) => linhas.find((l) => l.situacao === "VALIDA" && mesmaChave(l, chave)) || null,
    existeReplicaEntre: async (r, inicio, fim) => linhas.some((l) => l.tipo === "REPLICA" && l.ativos === r.ativos && l.data >= inicio && l.data <= fim),
    registrar: async (registro) => {
      const linha = { ...registro, id: `ia-${linhas.length + 1}`, custo_usd: registro.custo_usd == null ? null : String(registro.custo_usd) };
      linhas.push(linha);
      return linha;
    }
  };
}

function ambiente({ respostas = [VALIDA], modelo = "gemini-3.8-flash", devolvido = modelo, apiKey = "paga", erro = null, repo = repositorioFalso() } = {}) {
  const chamadas = [];
  const fila = [...respostas];
  return {
    chamadas,
    repo,
    deps: {
      recomendacaoIaRepository: repo,
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

const SEMANA = ["2026-10-12", "2026-10-18"];
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
  const replica = await replicar(principal, SEMANA, deps);
  assert.deepEqual([replica.tipo, replica.situacao, replica.hash_entrada], ["REPLICA", "VALIDA", principal.hash_entrada]);
  assert.equal(chamadas[1].pedido.prompt, chamadas[0].pedido.prompt);
});

test("compartilhada (adendo de 2026-10-16): a chamada vai à tabela global; a próxima carteira com a mesma entrada reaproveita", async () => {
  const { chamadas, repo, deps } = ambiente({ respostas: [VALIDA, VALIDA] });
  const primeira = await pedir(deps);
  assert.equal(chamadas.length, 1);
  assert.equal(repo.linhas.length, 1);
  assert.deepEqual([repo.linhas[0].ativos, repo.linhas[0].situacao], ["CAFE,MILHO", "VALIDA"]);
  // A cópia da carteira: sem o id nem a combinação da linha global, com o vínculo; o custo volta a número.
  assert.deepEqual([primeira.recomendacao_ia_id, primeira.id, primeira.ativos, primeira.custo_usd], ["ia-1", undefined, undefined, 0.0013]);

  const segunda = await pedir(deps);
  assert.equal(chamadas.length, 1);
  assert.deepEqual([segunda.situacao, segunda.recomendacao_ia_id, segunda.recomendacoes], ["VALIDA", "ia-1", primeira.recomendacoes]);

  // Outro dia é outra entrada: chama de novo.
  await recomendar({ data: "2026-10-15", ativos: ["MILHO", "CAFE"], leiturasPorAtivo: LEITURAS }, deps);
  assert.equal(chamadas.length, 2);
});

test("compartilhada: a falha fica gravada mas não é reaproveitada; no memo da rotina, é (a rotina já tentou de novo)", async () => {
  const fora = ambiente({ erro: "429" });
  const r = await pedir(fora.deps);
  assert.deepEqual([r.motivo_falha, fora.repo.linhas.length, r.recomendacao_ia_id], ["GEMINI_FORA", 1, "ia-1"]);

  const depois = ambiente({ repo: fora.repo });
  assert.equal((await pedir(depois.deps)).situacao, "VALIDA");
  assert.equal(depois.chamadas.length, 1);

  const memo = new Map();
  const naRotina = ambiente({ erro: "429" });
  await pedir({ ...naRotina.deps, memoRecomendacoes: memo });
  await pedir({ ...naRotina.deps, memoRecomendacoes: memo });
  assert.equal(naRotina.chamadas.length, 1);
});

test("compartilhada: sem chamada (modelo não fixado) nada vai à tabela; falha do banco não impede a recomendação", async () => {
  const semModelo = ambiente({ modelo: "" });
  const r = await pedir(semModelo.deps);
  assert.deepEqual([r.motivo_falha, r.recomendacao_ia_id, semModelo.repo.linhas.length], ["MODELO_NAO_FIXADO", null, 0]);

  const quebrado = { buscarValida: async () => { throw new Error("banco fora"); }, registrar: async () => { throw new Error("banco fora"); } };
  const { chamadas, deps } = ambiente({ repo: quebrado });
  const ok = await pedir({ ...deps, logger: { warn: () => {} } });
  assert.deepEqual([ok.situacao, ok.recomendacao_ia_id, chamadas.length], ["VALIDA", null, 1]);
});

test("réplica compartilhada: uma por combinação de ativos e semana; a carteira seguinte, no mesmo dia, copia a mesma", async () => {
  const { chamadas, repo, deps } = ambiente({ respostas: [VALIDA, VALIDA, VALIDA] });
  const principal = await pedir(deps);
  const replica = await replicar(principal, SEMANA, deps);
  assert.deepEqual([replica.tipo, replica.recomendacao_ia_id, chamadas.length], ["REPLICA", "ia-2", 2]);

  const deOutraCarteira = await replicar(await pedir(deps), SEMANA, deps);
  assert.deepEqual([deOutraCarteira.recomendacao_ia_id, chamadas.length], ["ia-2", 2]);

  // Outro dia da mesma semana: a combinação já teve réplica; nenhuma chamada.
  const quinta = await recomendar({ data: "2026-10-15", ativos: ["MILHO", "CAFE"], leiturasPorAtivo: LEITURAS }, deps);
  assert.equal(await replicar(quinta, SEMANA, deps), null);
  assert.equal(chamadas.length, 3);
  assert.equal(repo.linhas.filter((l) => l.tipo === "REPLICA").length, 1);
});
