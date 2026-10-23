"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const servico = require("./revisao-evento.service");

const evento = (titulo, intensidade, data = "2026-10-22") => ({
  titulo,
  intensidade,
  tipo: "SAFRA",
  fator: null,
  pressao: "ALTA",
  confianca: "ALTA",
  resumo: "r",
  fontes: [{ site: "conab.gov.br" }],
  leitura: { data_referencia: data }
});

function deps(eventos) {
  const feitas = new Map();
  return {
    hoje: "2026-10-23",
    geopoliticaRepository: { listarEventosAceitosDoAtivo: async () => eventos },
    revisaoEventoRepository: {
      listarPorChaves: async (chaves) => chaves.filter((c) => feitas.has(c)).map((c) => feitas.get(c)),
      buscarPorChave: async (c) => feitas.get(c) || null,
      criar: async (campos) => feitas.set(campos.chave, campos),
      remover: async (c) => feitas.delete(c)
    }
  };
}

test("listar: só os eventos aceitos de grau ALTA (a magnitude 3), com a revisão ou pendentes", async () => {
  const d = deps([evento("Conab corta a safra", "ALTA"), evento("Chuva no sul de MG", "MEDIA")]);
  const { revisoes } = await servico.listar({ ativo: "CAFE" }, d);
  assert.deepEqual(revisoes.eventos.map((e) => [e.chave, e.revisao]), [["CAFE|2026-10-22|Conab corta a safra", null]]);
  assert.equal(revisoes.pendentes, 1);
  assert.equal(revisoes.desde, "2026-10-22");
});

test("revisar: grava quem e quando, com a cópia do evento; de novo é recusado; desfazer volta a pendente", async () => {
  const d = deps([evento("Conab corta a safra", "ALTA")]);
  const chave = "CAFE|2026-10-22|Conab corta a safra";
  const { revisoes } = await servico.revisar({ chave, observacao: "  F2 já reflete  " }, "u1", d);
  assert.equal(revisoes.pendentes, 0);
  const feita = await d.revisaoEventoRepository.buscarPorChave(chave);
  assert.equal(feita.revisado_por, "u1");
  assert.equal(feita.observacao, "F2 já reflete");
  assert.equal(feita.evento.titulo, "Conab corta a safra");
  await assert.rejects(() => servico.revisar({ chave }, "u1", d), /já foi revisado/);
  assert.equal((await servico.desfazer({ chave }, d)).revisoes.pendentes, 1);
});

test("revisar: evento que não existe (a leitura refeita) e ativo fora do escopo são recusados", async () => {
  const d = deps([evento("Conab corta a safra", "ALTA")]);
  await assert.rejects(() => servico.revisar({ chave: "CAFE|2026-10-22|Outro" }, "u1", d), /não encontrado/);
  await assert.rejects(() => servico.listar({ ativo: "MILHO" }, d), /só para CAFE/);
});
