"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { registrarObservacoes, montarVersao } = require("./point-in-time.service");
const observationRepository = require("../repositories/observation.repository");
const { Observation } = require("../models");

// Repository fake em memória: reproduz só a semântica de ESCRITA do real
// (últimas versões por observed_at + INSERT IGNORE pela chave única). A regra
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

test("valor diferente com published_at não posterior à última versão vira falha (append-only não representa)", async () => {
  const repo = criarRepoFake();
  await registrarObservacoes([obs({ value: 10, published_at: T1 })], { execucaoId: "e1", coletadoEm: T1 }, { observationRepository: repo });
  const r = await registrarObservacoes([obs({ value: 99, published_at: T0 })], { execucaoId: "e2", coletadoEm: T1 }, { observationRepository: repo });

  assert.equal(r.falhas.length, 1);
  assert.match(r.falhas[0].motivo, /não posterior/);
  assert.equal(repo.linhas.length, 1);
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
    "buscarAsOf",
    "buscarHistoricoAtual",
    "buscarMaisRecente",
    "buscarUltimasVersoes",
    "inserirVersoes",
    "listarVencimentos",
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
