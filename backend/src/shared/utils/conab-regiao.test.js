"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { descreverRegiaoConab } = require("./conab-regiao");

test("descreverRegiaoConab: UF por extenso, agregados marcados e sub-regiões do café com a UF no nome", () => {
  assert.deepEqual(descreverRegiaoConab("MG"), { rotulo: "Minas Gerais (MG)", agregado: false });
  assert.deepEqual(descreverRegiaoConab("BRASIL"), { rotulo: "Brasil", agregado: true });
  assert.deepEqual(descreverRegiaoConab("OUTROS"), { rotulo: "Outras UFs", agregado: true });
  assert.deepEqual(descreverRegiaoConab("MG_SUL_E_CENTRO_OESTE"), { rotulo: "Minas Gerais - Sul e Centro-Oeste", agregado: false });
  assert.deepEqual(descreverRegiaoConab("BA_ATLANTICO"), { rotulo: "Bahia - Atlântico", agregado: false });
  assert.deepEqual(descreverRegiaoConab("NOVA_REGIAO"), { rotulo: "NOVA_REGIAO", agregado: false }, "código desconhecido aparece como está");
});
