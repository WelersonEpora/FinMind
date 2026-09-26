"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { converterLinha, emailsDuplicados, TABELAS } = require("./migrar-mariadb-para-postgres");

test("converterLinha: tinyint vira boolean e JSON em objeto vira texto; datas e decimais passam como vieram", () => {
  const publicado = new Date("2026-09-25T13:45:07.000Z");
  const linha = converterLinha("observation", {
    id: "a",
    observed_at: "2026-09-01",
    published_at: publicado,
    value: "1.234567",
    published_at_is_estimated: 1,
    metadata: { origem: "teste" }
  });

  assert.equal(linha.published_at_is_estimated, true);
  assert.equal(linha.metadata, '{"origem":"teste"}');
  assert.equal(linha.observed_at, "2026-09-01");
  assert.equal(linha.published_at, publicado);
  assert.equal(linha.value, "1.234567");
});

test("converterLinha: JSON já em texto e nulo ficam como estão", () => {
  assert.equal(converterLinha("market_quote", { metadata: '{"a":1}' }).metadata, '{"a":1}');
  assert.equal(converterLinha("market_quote", { metadata: null }).metadata, null);
});

test("converterLinha: e-mail do usuário vai para minúsculas e active para boolean", () => {
  const linha = converterLinha("user", { email: " Admin@FinMind.Local ", active: 0 });
  assert.equal(linha.email, "admin@finmind.local");
  assert.equal(linha.active, false);
});

test("emailsDuplicados: acha e-mails que só diferem em maiúsculas", () => {
  assert.deepEqual(emailsDuplicados([{ email: "a@x.com" }, { email: "A@X.com" }, { email: "b@x.com" }]), ["a@x.com"]);
  assert.deepEqual(emailsDuplicados([{ email: "a@x.com" }, { email: "b@x.com" }]), []);
});

test("TABELAS: quem é referenciado por chave estrangeira vem antes de quem referencia", () => {
  const ordem = TABELAS.map((t) => t.nome);
  const antes = (a, b) => assert.ok(ordem.indexOf(a) < ordem.indexOf(b), `${a} antes de ${b}`);
  antes("user", "workspace");
  antes("workspace", "workspace_member");
  antes("user", "collection_execution");
  antes("collection_execution", "market_quote");
  antes("collection_execution", "observation");
});
