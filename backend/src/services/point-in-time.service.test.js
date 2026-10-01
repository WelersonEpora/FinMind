"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { registrarObservacoes, montarVersao } = require("./point-in-time.service");
const observationRepository = require("../repositories/observation.repository");
const { Observation } = require("../models");

// Repository fake em memória: reproduz só a semântica de ESCRITA do real
// (últimas versões por observed_at + ON CONFLICT DO NOTHING pela chave única). A regra
// de LEITURA (asOf, em SQL) é verificada contra o MariaDB real em
// observation.integration.test.js - nenhum teste daqui abre conexão.
function criarRepoFake() {
  const linhas = [];
  return {
    linhas,
    async buscarUltimasVersoes(seriesCode) {
      const mapa = new Map();
      for (const l of linhas.filter((x) => x.series_code === seriesCode)) {
        const atual = mapa.get(l.observed_at);
        if (!atual || l.published_at > atual.published_at) mapa.set(l.observed_at, l);
      }
      return mapa;
    },
    chamadasBuscarVersoes: 0,
    async buscarVersoes(seriesCode) {
      this.chamadasBuscarVersoes += 1;
      const porData = new Map();
      for (const l of linhas.filter((x) => x.series_code === seriesCode)) {
        if (!porData.has(l.observed_at)) porData.set(l.observed_at, []);
        porData.get(l.observed_at).push(l);
      }
      return porData;
    },
    async inserirVersoes(versoes) {
      let inseridas = 0;
      for (const v of versoes) {
        const duplicada = linhas.some(
          (l) => l.series_code === v.series_code && l.observed_at === v.observed_at && l.published_at.getTime() === v.published_at.getTime()
        );
        if (!duplicada) {
          linhas.push(v);
          inseridas += 1;
        }
      }
      return inseridas;
    }
  };
}

const T0 = new Date("2026-03-10T12:00:00Z");
const T1 = new Date("2026-08-15T12:00:00Z");

function obs(extra = {}) {
  return { series_code: "TESTE.SERIE", observed_at: "2026-03-01", value: 10, unit: "PCT", source_code: "TESTE", ...extra };
}

test("insere a observação original como revision_seq 0", async () => {
  const repo = criarRepoFake();
  const r = await registrarObservacoes([obs({ published_at: T0 })], { execucaoId: "e1", coletadoEm: T0 }, { observationRepository: repo });

  assert.deepEqual([r.criados, r.atualizados, r.ignorados, r.falhas.length], [1, 0, 0, 0]);
  assert.equal(repo.linhas.length, 1);
  assert.equal(repo.linhas[0].revision_seq, 0);
  assert.equal(repo.linhas[0].collection_execution_id, "e1");
});

test("uma revisão (valor diferente, published_at posterior) entra como linha NOVA, sem tocar a original", async () => {
  const repo = criarRepoFake();
  await registrarObservacoes([obs({ value: 10, published_at: T0 })], { execucaoId: "e1", coletadoEm: T0 }, { observationRepository: repo });
  const original = { ...repo.linhas[0] };

  const r = await registrarObservacoes([obs({ value: 12, published_at: T1 })], { execucaoId: "e2", coletadoEm: T1 }, { observationRepository: repo });

  assert.equal(r.atualizados, 1);
  assert.equal(repo.linhas.length, 2);
  assert.deepEqual(repo.linhas[0], original, "a versão original permanece intacta");
  assert.equal(repo.linhas[1].value, 12);
  assert.equal(repo.linhas[1].revision_seq, 1);
});

test("recoletar o mesmo valor não duplica (ignorado), mesmo com collected_at diferente", async () => {
  const repo = criarRepoFake();
  const dados = [obs({ published_at: T0 })];
  await registrarObservacoes(dados, { execucaoId: "e1", coletadoEm: T0 }, { observationRepository: repo });
  const r = await registrarObservacoes(dados, { execucaoId: "e2", coletadoEm: T1 }, { observationRepository: repo });

  assert.deepEqual([r.criados, r.atualizados, r.ignorados], [0, 0, 1]);
  assert.equal(repo.linhas.length, 1);
});

test("published_at estimado por collected_at NÃO gera versão nova a cada coleta (mesmo valor)", async () => {
  const repo = criarRepoFake();
  const semPublicacao = [obs()]; // fonte não informa quando publicou
  await registrarObservacoes(semPublicacao, { execucaoId: "e1", coletadoEm: T0 }, { observationRepository: repo });
  await registrarObservacoes(semPublicacao, { execucaoId: "e2", coletadoEm: T1 }, { observationRepository: repo });

  assert.equal(repo.linhas.length, 1);
  assert.equal(repo.linhas[0].published_at.getTime(), T0.getTime(), "fica o limite mais antigo em que o valor já era conhecido");
});

test("revisão detectada numa fonte com published_at ESTIMADO usa collected_at, não a regra antiga", async () => {
  const repo = criarRepoFake();
  const regra = new Date("2026-03-02T23:59:59Z"); // "1 dia útil depois" de 2026-03-01
  await registrarObservacoes(
    [obs({ value: 10, published_at: regra, published_at_is_estimated: true, published_at_basis: "lag_rule" })],
    { execucaoId: "e1", coletadoEm: T0 },
    { observationRepository: repo }
  );

  // Meses depois a fonte devolve outro valor para o mesmo período. A regra daria
  // de novo 2026-03-02 (anterior à 1ª versão) - o que seria um conflito E uma mentira.
  const r = await registrarObservacoes(
    [obs({ value: 11, published_at: regra, published_at_is_estimated: true, published_at_basis: "lag_rule" })],
    { execucaoId: "e2", coletadoEm: T1 },
    { observationRepository: repo }
  );

  assert.deepEqual([r.atualizados, r.falhas.length], [1, 0]);
  assert.equal(repo.linhas[1].published_at.getTime(), T1.getTime());
  assert.equal(repo.linhas[1].metadata.publishedAtBasis, "collected_at");
});

test("dois períodos diferentes da mesma série coexistem", async () => {
  const repo = criarRepoFake();
  const r = await registrarObservacoes(
    [obs({ observed_at: "2026-03-01", published_at: T0 }), obs({ observed_at: "2026-03-02", value: 11, published_at: T0 })],
    { execucaoId: "e1", coletadoEm: T0 },
    { observationRepository: repo }
  );

  assert.equal(r.criados, 2);
  assert.deepEqual(repo.linhas.map((l) => l.observed_at).sort(), ["2026-03-01", "2026-03-02"]);
});

test("sem published_at: usa collected_at e marca como estimado", () => {
  const { versao } = montarVersao(obs(), T0);

  assert.equal(versao.published_at.getTime(), T0.getTime());
  assert.equal(versao.published_at_is_estimated, true);
  assert.equal(versao.metadata.publishedAtBasis, "collected_at");
});

test("published_at real (informado pela fonte) não é marcado como estimado", () => {
  const { versao } = montarVersao(obs({ published_at: new Date("2026-03-06T19:30:00Z") }), T0);

  assert.equal(versao.published_at_is_estimated, false);
  assert.equal(versao.metadata.publishedAtBasis, "source");
});

test("published_at estimado por regra nunca fica depois de collected_at (o valor já estava em mãos)", () => {
  const depoisDaColeta = new Date(T0.getTime() + 3600_000);
  const { versao } = montarVersao(obs({ published_at: depoisDaColeta, published_at_is_estimated: true, published_at_basis: "lag_rule" }), T0);

  assert.equal(versao.published_at.getTime(), T0.getTime());
  assert.equal(versao.published_at_is_estimated, true);
  assert.equal(versao.metadata.publishedAtClampedToCollectedAt, true);
});

test("published_at REAL no futuro do relógio é rejeitado, não corrigido em silêncio", () => {
  const { erro, versao } = montarVersao(obs({ published_at: new Date(T0.getTime() + 24 * 3600_000) }), T0);

  assert.equal(versao, undefined);
  assert.match(erro, /futuro/);
});

test("texto mais longo que a coluna é rejeitado, nunca chega ao banco (que recusaria)", () => {
  const { erro, versao } = montarVersao(obs({ source_code: "X".repeat(observationRepository.TAMANHO_MAXIMO.source_code + 1) }), T0);

  assert.equal(versao, undefined);
  assert.match(erro, /source_code .* passa de 64 caracteres/);
});

test("TAMANHO_MAXIMO do repositório bate com as colunas do model", () => {
  const atributos = Observation.getAttributes();
  for (const [campo, maximo] of Object.entries(observationRepository.TAMANHO_MAXIMO)) {
    assert.equal(atributos[campo].type.options.length, maximo, campo);
  }
});

test("valor diferente com published_at não posterior à última versão vira falha (append-only não representa)", async () => {
  const repo = criarRepoFake();
  await registrarObservacoes([obs({ value: 10, published_at: T1 })], { execucaoId: "e1", coletadoEm: T1 }, { observationRepository: repo });
  const r = await registrarObservacoes([obs({ value: 99, published_at: T0 })], { execucaoId: "e2", coletadoEm: T1 }, { observationRepository: repo });

  assert.equal(r.falhas.length, 1);
  assert.match(r.falhas[0].motivo, /não posterior/);
  assert.equal(repo.linhas.length, 1);
});

const T_MEIO = new Date("2026-05-20T12:00:00Z");
const T2 = new Date("2026-09-20T12:00:00Z");

test("reler uma edição antiga com o valor que valia NAQUELA data é ignorado, não falha (ADR 0035)", async () => {
  const repo = criarRepoFake();
  await registrarObservacoes([obs({ value: 10, published_at: T0 })], { execucaoId: "e1", coletadoEm: T0 }, { observationRepository: repo });
  await registrarObservacoes([obs({ value: 12, published_at: T1 })], { execucaoId: "e2", coletadoEm: T1 }, { observationRepository: repo });
  // republicação entre as duas (ex.: WASDE 2018-12-14): o mesmo número da versão de T0, que valia em T_MEIO
  const r = await registrarObservacoes([obs({ value: 10, published_at: T_MEIO })], { execucaoId: "e3", coletadoEm: T2 }, { observationRepository: repo });

  assert.deepEqual([r.criados, r.atualizados, r.ignorados, r.falhas.length], [0, 0, 1, 0]);
  assert.equal(repo.linhas.length, 2);
});

test("valor antigo DIFERENTE do que valia naquela data continua sendo falha", async () => {
  const repo = criarRepoFake();
  await registrarObservacoes([obs({ value: 10, published_at: T0 })], { execucaoId: "e1", coletadoEm: T0 }, { observationRepository: repo });
  await registrarObservacoes([obs({ value: 12, published_at: T1 })], { execucaoId: "e2", coletadoEm: T1 }, { observationRepository: repo });
  const r = await registrarObservacoes([obs({ value: 11, published_at: T_MEIO })], { execucaoId: "e3", coletadoEm: T2 }, { observationRepository: repo });

  assert.equal(r.falhas.length, 1);
  assert.match(r.falhas[0].motivo, /não posterior/);
  assert.equal(repo.linhas.length, 2);
});

test("republicação no MESMO instante com outro valor continua sendo falha (não há duas versões no mesmo published_at)", async () => {
  const repo = criarRepoFake();
  await registrarObservacoes([obs({ value: 10, published_at: T0 })], { execucaoId: "e1", coletadoEm: T0 }, { observationRepository: repo });
  const r = await registrarObservacoes([obs({ value: 11, published_at: T0 })], { execucaoId: "e2", coletadoEm: T1 }, { observationRepository: repo });

  assert.equal(r.falhas.length, 1);
  assert.equal(repo.linhas.length, 1);
});

test("no mesmo lote, a versão vigente considera também o que acabou de ser planejado (ainda fora do banco)", async () => {
  const repo = criarRepoFake();
  const r = await registrarObservacoes(
    [obs({ value: 10, published_at: T0 }), obs({ value: 12, published_at: T1 }), obs({ value: 10, published_at: T_MEIO })],
    { execucaoId: "e1", coletadoEm: T2 },
    { observationRepository: repo }
  );

  assert.deepEqual([r.criados, r.atualizados, r.ignorados, r.falhas.length], [1, 1, 1, 0]);
  assert.equal(repo.linhas.length, 2);
});

test("o histórico da série só é lido no caso raro (valor anterior à última versão), uma vez por série", async () => {
  const repo = criarRepoFake();
  await registrarObservacoes(
    [obs({ value: 10, published_at: T0 }), obs({ observed_at: "2026-04-01", value: 5, published_at: T0 })],
    { execucaoId: "e1", coletadoEm: T0 },
    { observationRepository: repo }
  );
  await registrarObservacoes([obs({ value: 12, published_at: T1 })], { execucaoId: "e2", coletadoEm: T1 }, { observationRepository: repo });
  await registrarObservacoes([obs({ value: 12, published_at: T1 })], { execucaoId: "e3", coletadoEm: T2 }, { observationRepository: repo });
  assert.equal(repo.chamadasBuscarVersoes, 0);

  await registrarObservacoes(
    [obs({ value: 10, published_at: T_MEIO }), obs({ value: 10, published_at: new Date("2026-06-01T12:00:00Z") })],
    { execucaoId: "e4", coletadoEm: T2 },
    { observationRepository: repo }
  );
  assert.equal(repo.chamadasBuscarVersoes, 1);
});

test("item inválido não aborta o lote", async () => {
  const repo = criarRepoFake();
  const r = await registrarObservacoes(
    [obs({ value: "abc" }), obs({ observed_at: "01/03/2026" }), obs({ observed_at: "2026-03-05", published_at: T0 })],
    { execucaoId: "e1", coletadoEm: T0 },
    { observationRepository: repo }
  );

  assert.equal(r.criados, 1);
  assert.equal(r.falhas.length, 2);
});

// --- append-only: nenhuma porta de UPDATE/DELETE ---

test("o repository não expõe nenhuma operação de update/delete", () => {
  assert.deepEqual(Object.keys(observationRepository).sort(), [
    "TAMANHO_MAXIMO",
    "buscarAsOf",
    "buscarHistoricoAtual",
    "buscarMaisRecente",
    "buscarUltimasVersoes",
    "buscarVersoes",
    "inserirVersoes",
    "listarItens",
    "listarSeriesEInstantes",
    "listarUltimasDatasItens",
    "resumirSeries"
  ]);
});

test("o model bloqueia UPDATE/DELETE em todas as vias do Sequelize (antes de tocar o banco)", async () => {
  const existente = Observation.build({ id: "11111111-1111-4111-8111-111111111111", series_code: "X", observed_at: "2026-01-01", value: 1 }, { isNewRecord: false });

  await assert.rejects(() => existente.update({ value: 2 }), /append-only/);
  await assert.rejects(() => existente.destroy(), /append-only/);
  await assert.rejects(() => Observation.update({ value: 2 }, { where: { series_code: "X" } }), /append-only/);
  await assert.rejects(() => Observation.destroy({ where: { series_code: "X" } }), /append-only/);
  await assert.rejects(() => Observation.upsert({ series_code: "X" }), /append-only/);
});
