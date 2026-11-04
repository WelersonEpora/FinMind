"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { medirVolatilidade } = require("./volatilidade-futuro");
const { faixasPorVolatilidade } = require("../shared/analise-diaria-base");

const linha = (ticker, data, value) => ({ series_code: `B3.GLD.${ticker}.SETTLE`, observed_at: data, value });

test("volatilidade (ADR 0152): o retorno sai do vencimento mais próximo com ajuste nos dois pregões; a troca não vira retorno", () => {
  // Z26 vence; F27 começa 2% acima (carregamento). Os retornos de cada contrato são de +1% e -1%, alternados.
  const linhas = [
    linha("GLDZ26", "2026-12-01", 100),
    linha("GLDZ26", "2026-12-02", 101),
    linha("GLDF27", "2026-12-02", 103),
    linha("GLDF27", "2026-12-03", 103 * 0.99),
    linha("GLDF27", "2026-12-04", 103 * 0.99 * 1.01)
  ];
  const v = medirVolatilidade(linhas, { ate: "2026-12-04", pregoes: 3, prefixo: "B3.GLD" });
  // Retornos: +1% (Z26), -1% (F27, o único com ajuste nos dois dias), +1% (F27): nenhum salto de 2%.
  assert.equal(v.pregoes, 3);
  assert.ok(v.volatilidadeDiariaPct > 1 && v.volatilidadeDiariaPct < 1.3, String(v.volatilidadeDiariaPct));
  assert.equal(medirVolatilidade(linhas, { ate: "2026-12-04", pregoes: 4, prefixo: "B3.GLD" }), null);
  // Só até `ate` (point-in-time do preço recebido).
  assert.equal(medirVolatilidade(linhas, { ate: "2026-12-03", pregoes: 3, prefixo: "B3.GLD" }), null);
});

test("faixas proporcionais (ADR 0152): T = k × σ × √n, arredondadas a 0,1; sem σ, null", () => {
  const regra = { horizontes: { IMEDIATO: { k1: 0.43, k2: 1.22, pregoes: 1 }, LONGO: { k1: 0.55, k2: 1.29, pregoes: 62 } } };
  assert.deepEqual(faixasPorVolatilidade(2, regra), { IMEDIATO: { t1: 0.9, t2: 2.4 }, LONGO: { t1: 8.7, t2: 20.3 } });
  assert.equal(faixasPorVolatilidade(null, regra), null);
});
