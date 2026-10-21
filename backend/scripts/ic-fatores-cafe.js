"use strict";

// O IC dos fatores do café (ADR 0141; a §4 e a revisão mensal da §6 da análise do café de 2026-10-19): para cada fator,
// a correlação de Spearman entre o escore da leitura C e o retorno do KC de Nova York depois, em 1, 5, 21 e 62 pregões
// (os prazos dos horizontes), no histórico inteiro do fator (o cálculo com o que se sabe hoje: cada semana já é
// point-in-time), com o intervalo de 90% do bootstrap em blocos, as duas metades e as janelas de 12 meses. Também o
// momentum (o sinal combinado do bloco 2.1, como seguir a tendência). Não chama a IA e não grava nada: só lê e imprime.
//
// Uso: npm run ic:cafe [-- --json=saida.json]
//
// A regra de decisão da §4: IC negativo e estável por 12 meses ou mais, dentro e fora da amostra -> revisar a lógica do
// fator; negativo num episódio isolado -> manter; indistinguível de zero -> rebaixar o peso ou desligar. A decisão é do
// Comitê; o script só mede.

const fs = require("node:fs");
const { sequelize } = require("../src/models");
const pointInTimeService = require("../src/services/point-in-time.service");
const { primeiroVencimentoKc } = require("../src/factors/basis-icf-kc");
const { medirMomentum } = require("../src/factors/momentum-kc");
const { escoreDaLeitura, ajustarRolagem, icDoFator } = require("../src/factors/base/ic-fatores");

const FATORES = [
  ["F1", "CAFE_CLIMA", "clima-cafe"],
  ["F2", "CAFE_SAFRA_BRASIL", "safra-cafe"],
  ["F3", "CAFE_ESTOQUES", "estoques-cafe-ice"],
  ["F4", "CAFE_DOLAR", "dolar-cafe"],
  ["F5", "CAFE_CUSTO_PRECO_MINIMO", "custos-cafe"],
  ["F6", "CAFE_DEMANDA", "demanda-cafe"],
  ["F7", "CAFE_FUNDOS", "fundos-cafe"],
  ["F8", "CAFE_JUROS", "juros-cafe"]
];
const PRAZOS = [1, 5, 21, 62];
// Abaixo disto, o IC não é calculado (o F2 tem um ponto por levantamento).
const MINIMO_PONTOS = 52;

function argumento(nome) {
  const arg = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return arg ? arg.slice(nome.length + 3) : undefined;
}

const iso = (valor) => new Date(valor).toISOString().slice(0, 10);
const fmt = (v) => (v === null || v === undefined ? "  -  " : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`);
const contrato = (data) => JSON.stringify(primeiroVencimentoKc(data));

async function main() {
  const asOf = new Date();
  const kc = (await pointInTimeService.obterAsOf({ seriesCodes: ["YAHOO.KC_CONTINUO.SETTLE"], asOf }))
    .map((l) => ({ data: String(l.observedAt).slice(0, 10), valor: l.value }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));
  const datas = kc.map((p) => p.data);
  const preco = { datas, ajustado: ajustarRolagem(kc, contrato) };
  console.log(`KC de Nova York (Yahoo, a troca de vencimento ajustada): ${datas.length} pregões, de ${datas[0]} a ${datas.at(-1)}`);

  const resultados = [];
  for (const [sigla, codigo, modulo] of FATORES) {
    const { METODOLOGIA } = require(`../src/factors/${modulo}.factor`);
    const pontos = (await METODOLOGIA.calcular({ asOf })).filter((p) => p.decisao);
    const lista = pontos.map((p) => ({ semana: p.observedAt, disponivelEm: p.disponivelEm ? iso(p.disponivelEm) : p.observedAt, escore: escoreDaLeitura(p.decisao) }));
    resultados.push({ sigla, codigo, ...(lista.length >= MINIMO_PONTOS ? icDoFator(lista, preco, PRAZOS) : { n: lista.length, prazos: [] }) });
  }
  // O momentum: o sinal combinado (a média dos z de 5, 20 e 60 pregões), toda sexta.
  const momentum = [];
  for (let i = 130; i < kc.length; i += 1) {
    if (new Date(`${kc[i].data}T00:00:00Z`).getUTCDay() !== 5) continue;
    const m = medirMomentum(kc.slice(i - 130, i + 1));
    if (m) momentum.push({ semana: kc[i].data, disponivelEm: kc[i].data, escore: m.janelas.reduce((s, j) => s + (j.z || 0), 0) / 3 });
  }
  resultados.push({ sigla: "MOM", codigo: "MOMENTUM_KC", ...icDoFator(momentum, preco, PRAZOS) });

  console.log("\nIC (Spearman) do escore contra o KC depois; [intervalo de 90%, bootstrap em blocos de 13 semanas]");
  console.log(`fator | semanas | ${PRAZOS.map((h) => `${h} pregão(ões)`).join(" | ")} | 21 pregões: 1ª e 2ª metade, janelas de 12 meses com IC > 0`);
  for (const r of resultados) {
    if (!r.prazos.length) {
      console.log(`${r.sigla.padEnd(3)} | ${r.n} pontos: histórico insuficiente (mínimo de ${MINIMO_PONTOS})`);
      continue;
    }
    const celulas = r.prazos.map((p) => `${fmt(p.ic)} [${p.intervalo ? `${fmt(p.intervalo[0])}, ${fmt(p.intervalo[1])}` : "-"}]${p.intervalo && (p.intervalo[0] > 0 || p.intervalo[1] < 0) ? " *" : ""}`);
    const p21 = r.prazos.find((p) => p.pregoes === 21);
    const janelas = p21.janelasPositivas ? `${p21.janelasPositivas.positivas} de ${p21.janelasPositivas.total}` : "-";
    console.log(`${r.sigla.padEnd(3)} | ${r.n} (${r.desde.slice(0, 7)} a ${r.ate.slice(0, 7)}) | ${celulas.join(" | ")} | ${fmt(p21.primeiraMetade)}, ${fmt(p21.segundaMetade)}, ${janelas}`);
  }
  console.log("\n* o intervalo exclui o zero.");
  const json = argumento("json");
  if (json) fs.writeFileSync(json, JSON.stringify({ geradoEm: asOf.toISOString(), resultados }, null, 2));
}

main()
  .then(() => sequelize.close())
  .catch(async (erro) => {
    console.error(erro);
    await sequelize.close();
    process.exit(1);
  });
