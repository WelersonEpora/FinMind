"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./imea-milho-safra.collector");

const AREA_MT = { Localidade: "Mato Grosso", Valor: 7434288.03, Safra: "25/26", IndicadorFinalId: "700940565361721344", TipoLocalidadeId: "1", UnidadeSigla: "ha", DataPublicacao: "2026-09-01 00:00:00" };
const OUTRO_INDICADOR = { Localidade: "Mato Grosso", Valor: 42.52, Safra: null, IndicadorFinalId: "999999999999", TipoLocalidadeId: "1", UnidadeSigla: "R$/sc", DataPublicacao: "2026-09-18 00:00:00" };

const resposta = (corpo, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => corpo });

function fetchFake(corpo, opcoes) {
  return async () => resposta(corpo, opcoes);
}

test("download: pede a API do milho (cadeia 3) e devolve o corpo como veio", async () => {
  let urlChamada;
  const fetchFn = async (url) => {
    urlChamada = url;
    return resposta([AREA_MT]);
  };
  const corpo = await coletor.download({ fetchFn });
  assert.equal(urlChamada, "https://api1.imea.com.br/api/v2/mobile/cadeias/3/cotacoes");
  assert.deepEqual(corpo, [AREA_MT]);
});

test("download: resposta que não é uma lista falha a execução", async () => {
  await assert.rejects(coletor.download({ fetchFn: fetchFake({ nao: "é lista" }) }), /esperava uma lista/);
});

test("download: resposta sem NENHUM dos 3 indicadores conhecidos falha (guarda contra a API trocar os IDs)", async () => {
  await assert.rejects(coletor.download({ fetchFn: fetchFake([OUTRO_INDICADOR]) }), /não traz nenhum dos indicadores/);
});

test("download: HTTP não-2xx vira UpstreamServiceError", async () => {
  await assert.rejects(coletor.download({ fetchFn: fetchFake([], { ok: false, status: 500 }) }), /respondeu com status 500/);
});

test("parse: só as observações extraídas e os inválidos contam como itens lidos (não os ~5.900 de outros indicadores)", () => {
  const entradas = coletor.parse([AREA_MT, OUTRO_INDICADOR, OUTRO_INDICADOR, OUTRO_INDICADOR]);
  assert.equal(entradas.length, 1);
  assert.ok(entradas[0].observacao);
});

test("normalize: published_at é o fim do dia de DataPublicacao (real, não estimado)", () => {
  const entradas = coletor.parse([AREA_MT]);
  const agora = new Date("2026-09-22T00:00:00Z");
  const { validos, invalidos } = coletor.normalize(entradas, agora);

  assert.equal(invalidos.length, 0);
  assert.equal(validos.length, 1);
  assert.deepEqual(
    { ...validos[0], published_at: validos[0].published_at.toISOString() },
    {
      series_code: "IMEA.MILHO.MATO_GROSSO.AREA",
      observed_at: "2025-09-01",
      value: 7434288.03,
      unit: "ha",
      source_code: "IMEA_MILHO_SAFRA",
      published_at: "2026-09-01T23:59:59.000Z",
      published_at_is_estimated: false,
      published_at_basis: "source",
      metadata: {
        fonte: "IMEA - indicadores do milho",
        produto: "milho",
        regiao: "MATO_GROSSO",
        localidade: "Mato Grosso",
        tipoLocalidade: "estado",
        metrica: "AREA",
        safra: "2025/26",
        indicadorId: "700940565361721344",
        dataPublicacao: "2026-09-01"
      }
    }
  );
});

test("normalize: item inválido do parser sai como inválido, com o motivo repassado", () => {
  const entradas = coletor.parse([{ ...AREA_MT, UnidadeSigla: "t" }]);
  const { validos, invalidos } = coletor.normalize(entradas);
  assert.equal(validos.length, 0);
  assert.match(invalidos[0].motivo, /unidade "t" diferente da esperada/);
});

test("persist: delega ao serviço point-in-time (é append-only, sem trava de carga inicial)", async () => {
  const chamadas = [];
  const deps = { pointInTimeService: { registrarObservacoes: async (validos, contexto) => (chamadas.push({ validos, contexto }), { criados: validos.length, atualizados: 0, ignorados: 0, falhas: [] }) } };

  const resultado = await coletor.persist([{ series_code: "IMEA.MILHO.MATO_GROSSO.AREA" }], { execucaoId: "exec-1" }, deps);

  assert.equal(resultado.criados, 1);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].contexto.execucaoId, "exec-1");
});
