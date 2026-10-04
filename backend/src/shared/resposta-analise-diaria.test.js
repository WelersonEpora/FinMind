"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validarRespostaAnalise } = require("./resposta-analise-diaria");
const { HORIZONTES } = require("./analise-diaria-petroleo");

const CODIGOS = ["PETROLEO_JUROS", "PETROLEO_REFINO", "PETROLEO_COT", "PETROLEO_OFERTA_NAO_OPEP"];

function leitura(horizonte, extra = {}) {
  return {
    horizonte,
    tendencia: "ALTA",
    faixa: "ALTA_LEVE",
    confianca: "MEDIA",
    tese: "Tese curta.",
    forcasDominantes: "Juros dominam.",
    fatoresAFavor: [{ fator: "PETROLEO_JUROS", argumento: "...", evidencias: ["E1"] }],
    fatoresContra: [{ fator: "PETROLEO_REFINO", argumento: "...", evidencias: [] }],
    fatoresPoucoRelevantes: [{ fator: "PETROLEO_OFERTA_NAO_OPEP", motivo: "mensal" }],
    posicionamentoCot: { papel: "CONFIRMA", comentario: "..." },
    evidencias: [{ id: "E1", origem: "FATOR", fator: "PETROLEO_JUROS", descricao: "...", valorCitado: "+0,93 p.p.", dataReferencia: "2026-10-02" }],
    lacunas: [{ fator: null, situacao: "CURVA_SEM_DADO", efeito: "..." }],
    argumentoMaisForteContra: "...",
    invalidaSe: "Se o Treasury cair abaixo de X.",
    ...extra
  };
}

const respostaValida = (troca = {}) => ({
  leituras: ["IMEDIATO", "CURTO", "MEDIO", "LONGO"].map((h) => leitura(h, troca[h]))
});

const validar = (obj) => validarRespostaAnalise(typeof obj === "string" ? obj : JSON.stringify(obj), { horizontes: HORIZONTES, codigosFator: CODIGOS });

test("resposta no formato: as quatro leituras passam, na ordem dos horizontes", () => {
  const { leituras, erros } = validar(respostaValida());
  assert.deepEqual(erros, []);
  assert.deepEqual(
    leituras.map((l) => l.horizonte),
    ["IMEDIATO", "CURTO", "MEDIO", "LONGO"]
  );
});

test("aceita o JSON embrulhado em ```json; texto que não é JSON é recusado", () => {
  assert.deepEqual(validar("```json\n" + JSON.stringify(respostaValida()) + "\n```").erros, []);
  const { leituras, erros } = validar("Segue a análise: ALTA");
  assert.equal(leituras, null);
  assert.match(erros[0], /não é um JSON válido/);
});

test("horizontes: exatamente quatro, na ordem IMEDIATO, CURTO, MEDIO, LONGO", () => {
  const tres = respostaValida();
  tres.leituras.pop();
  assert.ok(validar(tres).erros.some((e) => /4 leituras/.test(e)));

  const trocada = respostaValida();
  [trocada.leituras[0], trocada.leituras[1]] = [trocada.leituras[1], trocada.leituras[0]];
  assert.ok(validar(trocada).erros.some((e) => /fora da ordem/.test(e)));
});

test("a faixa tem de combinar com a tendência, e as duas com a escala (nada de compra ou venda)", () => {
  assert.ok(validar(respostaValida({ CURTO: { tendencia: "ALTA", faixa: "BAIXA_LEVE" } })).erros.some((e) => /não combina/.test(e)));
  assert.ok(validar(respostaValida({ CURTO: { tendencia: "LATERAL", faixa: "ALTA_FORTE" } })).erros.some((e) => /não combina/.test(e)));
  assert.ok(validar(respostaValida({ MEDIO: { tendencia: "COMPRA" } })).erros.some((e) => /tendência "COMPRA"/.test(e)));
  assert.ok(validar(respostaValida({ MEDIO: { faixa: "+7%" } })).erros.some((e) => /faixa "\+7%"/.test(e)));
  assert.ok(validar(respostaValida({ LONGO: { confianca: "MUITO_ALTA" } })).erros.some((e) => /confiança/.test(e)));
  assert.deepEqual(validar(respostaValida({ LONGO: { tendencia: "LATERAL", faixa: "LATERAL", confianca: "BAIXA" } })).erros, []);
});

test("INSUFICIENTE: faixa e confiança null e ao menos uma lacuna", () => {
  const ok = { tendencia: "INSUFICIENTE", faixa: null, confianca: null };
  assert.deepEqual(validar(respostaValida({ IMEDIATO: ok })).erros, []);
  const erros = validar(respostaValida({ IMEDIATO: { ...ok, faixa: "LATERAL", confianca: "BAIXA", lacunas: [] } })).erros;
  assert.ok(erros.some((e) => /"faixa" deve ser null/.test(e)));
  assert.ok(erros.some((e) => /"confianca" deve ser null/.test(e)));
  assert.ok(erros.some((e) => /"lacunas" não pode ser vazio/.test(e)));
});

test("não aceita fator inventado nem evidência citada que não existe", () => {
  const inventado = respostaValida({ CURTO: { fatoresAFavor: [{ fator: "PETROLEO_GUIANA", argumento: "...", evidencias: [] }] } });
  assert.ok(validar(inventado).erros.some((e) => /PETROLEO_GUIANA/.test(e)));

  const semEvidencia = respostaValida({ CURTO: { fatoresContra: [{ fator: "PETROLEO_REFINO", argumento: "...", evidencias: ["E9"] }] } });
  assert.ok(validar(semEvidencia).erros.some((e) => /"E9"/.test(e)));

  const evidenciaRepetida = respostaValida({
    MEDIO: {
      evidencias: [
        { id: "E1", origem: "PRECO", fator: null },
        { id: "E1", origem: "FATOR", fator: "PETROLEO_JUROS" }
      ]
    }
  });
  assert.ok(validar(evidenciaRepetida).erros.some((e) => /repetido/.test(e)));
});

test("textos obrigatórios e listas fechadas: tese, invalidaSe, papel do COT, origem e situação da lacuna", () => {
  const erros = validar(
    respostaValida({
      LONGO: {
        tese: "  ",
        invalidaSe: "",
        posicionamentoCot: { papel: "VOTA_ALTA" },
        evidencias: [{ id: "E1", origem: "BLOG", fator: null }],
        lacunas: [{ fator: null, situacao: "NAO_SEI" }]
      }
    })
  ).erros;
  for (const trecho of [/"tese" vazio/, /"invalidaSe" vazio/, /papel do COT/, /origem "BLOG"/, /situação "NAO_SEI"/]) {
    assert.ok(erros.some((e) => trecho.test(e)), String(trecho));
  }
});

test("fator de contexto (a inflação do ouro, ADR 0054): pode ser evidência ou pouco relevante, nunca a favor ou contra", () => {
  const opcoes = { horizontes: HORIZONTES, codigosFator: [...CODIGOS, "OURO_INFLACAO"], codigosContexto: ["OURO_INFLACAO"] };
  const comoContexto = respostaValida({
    CURTO: {
      fatoresPoucoRelevantes: [{ fator: "OURO_INFLACAO", motivo: "contexto do juro real" }],
      evidencias: [{ id: "E1", origem: "FATOR", fator: "OURO_INFLACAO", descricao: "...", valorCitado: "+0,9 p.p.", dataReferencia: "2026-09-01" }]
    }
  });
  assert.deepEqual(validarRespostaAnalise(JSON.stringify(comoContexto), opcoes).erros, []);

  const comoVoto = respostaValida({ LONGO: { fatoresAFavor: [{ fator: "OURO_INFLACAO", argumento: "...", evidencias: [] }] } });
  const { erros } = validarRespostaAnalise(JSON.stringify(comoVoto), opcoes);
  assert.equal(erros.length, 1);
  assert.match(erros[0], /OURO_INFLACAO.*fator de contexto/);
});
