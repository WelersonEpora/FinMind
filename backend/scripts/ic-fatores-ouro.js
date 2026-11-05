"use strict";

// O IC dos fatores do ouro por horizonte (E1 da análise do ouro de 2026-11-01; o mesmo método do café, ADR 0141): para
// cada fator calculado, a correlação de Spearman entre o escore da leitura C e o retorno do ouro da LBMA depois, em 1, 5,
// 21 e 62 pregões (os prazos dos horizontes IMEDIATO, CURTO, MEDIO e LONGO), no histórico inteiro do fator (cada semana
// point-in-time, a leitura valendo do pregão seguinte à disponibilidade), com o intervalo de 90% do bootstrap em blocos,
// as duas metades e as janelas de 12 meses. A validação dos fatores (parte D) mede só 26 semanas à frente.
//
// Além dos fatores, as variantes que o documento pede testar, no sentido do FEL 1 (escore positivo = pressão de alta):
//   - E2: o juro real (FRED.DFII10) pelo NÍVEL (mais baixo, alta) e pela variação de 26 semanas (a do F1, sem as faixas);
//   - M4: o juro real e o dólar (FRED.DTWEXAFEGS) pela variação de 1 e de 4 semanas (subindo, baixa);
//   - M2: o momentum do ouro (a média dos z de 5, 20 e 60 pregões, como no café, ADR 0139), seguir a tendência;
//   - M1: a expectativa de juros pelo Treasury de 2 anos (FRED.DGS2, já coletado, ADR 0119), no lugar do CME FedWatch
//     (fonte nova e paga): a variação de 1, 4 e 13 semanas (subindo, baixa) e a distância até a meta do Fed
//     (FRED.DFEDTARU; o mercado esperando alta, baixa) (ADR 0155).
// O F4 (geopolítica) é de evento e fica de fora: os eventos só existem desde 10/2026.
//
// O preço é a LBMA (PM, US$/onça), a série da validação dos fatores, até o fim do feed (2026-09-30, ADR 0044); o GLD da
// B3 só existe desde 2025-07. Spot: não há troca de contrato. Não chama a IA e não grava nada: só lê e imprime.
//
// O período começa em 2006 (o da validação dos fatores e do documento), para a inflação (desde 1914) e o momentum
// (a LBMA, desde 1968) não misturarem os anos 1970 com os outros; --desde=AAAA-MM-DD troca o início e --ate=AAAA-MM-DD
// limita o fim (ex.: o teste fora da amostra do M1, 1977 a 2005, ADR 0155).
//
// Uso: npm run ic:ouro [-- --desde=2006-01-01] [--ate=2026-12-31] [--json=saida.json]

const fs = require("node:fs");
const { sequelize } = require("../src/models");
const pointInTimeService = require("../src/services/point-in-time.service");
const { escoreDaLeitura, icDoFator } = require("../src/factors/base/ic-fatores");

// `atrasoDias`: o World Gold Council não informa quando publicou, e o histórico foi carregado de uma vez, com a data da
// coleta (2026-10-01) como publicação estimada: no teste, a disponibilidade de cada ponto é a data de referência mais
// o atraso típico da fonte (os ETFs, na semana seguinte; o trimestre, ~1 mês depois do fim dele, contado do início).
// Os trimestrais têm o bootstrap em blocos de 4 pontos (um ano) e um mínimo menor de pontos.
const FATORES = [
  ["F1", "OURO_JUROS_REAIS", "juros-reais-ouro"],
  ["F2", "OURO_DOLAR", "dolar-ouro"],
  ["F3", "OURO_INFLACAO", "inflacao-ouro"],
  ["F5", "OURO_BANCOS_CENTRAIS", "bancos-centrais-ouro", { atrasoDias: 130, trimestral: true }],
  ["F6", "OURO_ETFS", "etfs-ouro", { atrasoDias: 7 }],
  ["F7", "OURO_FUNDOS", "fundos-ouro"],
  ["F8", "OURO_MINERACAO", "mineracao-ouro", { atrasoDias: 130, trimestral: true }],
  ["F9", "OURO_EXPECTATIVA_JUROS", "expectativa-juros-ouro"]
];
const PRAZOS = [1, 5, 21, 62];
const MINIMO_PONTOS = 52;
const MINIMO_PONTOS_TRIMESTRAL = 30;
const DESDE_PADRAO = "2006-01-01";
const SERIE_OURO = "LBMA.GOLD_PM.USD";
const SERIE_JURO_REAL = "FRED.DFII10";
const SERIE_DOLAR = "FRED.DTWEXAFEGS";
const SERIE_JURO_2A = "FRED.DGS2";
const SERIE_META_FED = "FRED.DFEDTARU";

function argumento(nome) {
  const arg = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return arg ? arg.slice(nome.length + 3) : undefined;
}

const iso = (valor) => new Date(valor).toISOString().slice(0, 10);
const fmt = (v) => (v === null || v === undefined ? "  -  " : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`);
const sexta = (data) => new Date(`${data}T00:00:00Z`).getUTCDay() === 5;
const somarDias = (data, dias) => iso(new Date(`${data}T00:00:00Z`).getTime() + dias * 86400000);
const diaSeguinte = (data) => somarDias(data, 1);

async function serieDiaria(codigo, asOf) {
  return (await pointInTimeService.obterAsOf({ seriesCodes: [codigo], asOf }))
    .map((l) => ({ data: String(l.observedAt).slice(0, 10), valor: Number(l.value) }))
    .filter((p) => Number.isFinite(p.valor))
    .sort((a, b) => (a.data < b.data ? -1 : 1));
}

// Uma série diária do FRED amostrada às sextas (o último valor até a sexta), disponível no dia seguinte (o FRED publica
// com um dia de atraso). `escore(serie, i)` recebe a lista das sextas e o índice; null sem histórico.
function variante(diaria, escore) {
  const sextas = [];
  let k = 0;
  if (!diaria.length) return [];
  for (let d = new Date(`${diaria[0].data}T00:00:00Z`); iso(d) <= diaria.at(-1).data; d = new Date(d.getTime() + 86400000)) {
    const data = iso(d);
    while (k + 1 < diaria.length && diaria[k + 1].data <= data) k += 1;
    if (sexta(data) && diaria[k].data <= data) sextas.push({ data, valor: diaria[k].valor });
  }
  return sextas
    .map((s, i) => ({ semana: s.data, disponivelEm: diaSeguinte(s.data), escore: escore(sextas, i) }))
    .filter((p) => p.escore !== null);
}
const variacao = (semanas, sinal) => (s, i) => (i >= semanas ? sinal * (s[i].valor - s[i - semanas].valor) : null);

// O momentum do ouro (spot, sem troca de contrato): a média dos z de 5, 20 e 60 pregões, com a volatilidade dos 60
// pregões até o dia (o mesmo z do café, momentum-kc.js).
function momentum(ouro) {
  const pontos = [];
  for (let i = 121; i < ouro.length; i += 1) {
    if (!sexta(ouro[i].data)) continue;
    const r = [];
    for (let j = i - 59; j <= i; j += 1) r.push(Math.log(ouro[j].valor / ouro[j - 1].valor));
    const media = r.reduce((s, v) => s + v, 0) / r.length;
    const desvio = Math.sqrt(r.reduce((s, v) => s + (v - media) ** 2, 0) / (r.length - 1));
    if (!desvio) continue;
    const z = [5, 20, 60].map((n) => Math.log(ouro[i].valor / ouro[i - n].valor) / (desvio * Math.sqrt(n)));
    pontos.push({ semana: ouro[i].data, disponivelEm: ouro[i].data, escore: z.reduce((s, v) => s + v, 0) / 3 });
  }
  return pontos;
}

async function main() {
  const asOf = new Date();
  const ouro = await serieDiaria(SERIE_OURO, asOf);
  const preco = { datas: ouro.map((p) => p.data), ajustado: ouro.map((p) => p.valor) };
  console.log(`Ouro da LBMA (PM, US$/onça): ${ouro.length} pregões, de ${ouro[0]?.data} a ${ouro.at(-1)?.data}`);

  const desde = argumento("desde") || DESDE_PADRAO;
  const ate = argumento("ate") || "9999-12-31";
  console.log(`Pontos dos fatores de ${desde} a ${ate === "9999-12-31" ? "hoje" : ate}`);

  const resultados = [];
  const medir = (sigla, codigo, todos, { trimestral = false } = {}) => {
    const lista = todos.filter((p) => p.semana >= desde && p.semana <= ate && p.semana >= preco.datas[0]);
    const minimo = trimestral ? MINIMO_PONTOS_TRIMESTRAL : MINIMO_PONTOS;
    const opcoes = trimestral ? { bloco: 4 } : {};
    resultados.push({ sigla, codigo, ...(lista.length >= minimo ? icDoFator(lista, preco, PRAZOS, opcoes) : { n: lista.length, prazos: [] }) });
  };

  for (const [sigla, codigo, modulo, { atrasoDias, trimestral } = {}] of FATORES) {
    const { METODOLOGIA } = require(`../src/factors/${modulo}.factor`);
    const pontos = (await METODOLOGIA.calcular({ asOf })).filter((p) => p.decisao);
    const disponivel = (p) => (atrasoDias ? somarDias(p.observedAt, atrasoDias) : p.disponivelEm ? iso(p.disponivelEm) : p.observedAt);
    medir(
      sigla,
      codigo,
      pontos.map((p) => ({ semana: p.observedAt, disponivelEm: disponivel(p), escore: escoreDaLeitura(p.decisao) })),
      { trimestral }
    );
  }

  const juroReal = await serieDiaria(SERIE_JURO_REAL, asOf);
  const dolar = await serieDiaria(SERIE_DOLAR, asOf);
  medir("F1n", "JURO_REAL_NIVEL", variante(juroReal, (s, i) => -s[i].valor));
  medir("F1-26", "JURO_REAL_VAR_26S", variante(juroReal, variacao(26, -1)));
  medir("F1-4", "JURO_REAL_VAR_4S", variante(juroReal, variacao(4, -1)));
  medir("F1-1", "JURO_REAL_VAR_1S", variante(juroReal, variacao(1, -1)));
  medir("F2-4", "DOLAR_VAR_4S", variante(dolar, variacao(4, -1)));
  medir("F2-1", "DOLAR_VAR_1S", variante(dolar, variacao(1, -1)));
  medir("MOM", "MOMENTUM_OURO", momentum(ouro));

  const juro2a = await serieDiaria(SERIE_JURO_2A, asOf);
  const metaFed = await serieDiaria(SERIE_META_FED, asOf);
  medir("M1-1", "JURO_2A_VAR_1S", variante(juro2a, variacao(1, -1)));
  medir("M1-4", "JURO_2A_VAR_4S", variante(juro2a, variacao(4, -1)));
  medir("M1-13", "JURO_2A_VAR_13S", variante(juro2a, variacao(13, -1)));
  // A distância do 2 anos até a meta do Fed no mesmo dia (o último valor da meta até a data).
  const metaAte = (data) => {
    let r = null;
    for (const p of metaFed) {
      if (p.data > data) break;
      r = p.valor;
    }
    return r;
  };
  const distancia = juro2a.map((p) => ({ data: p.data, valor: metaAte(p.data) === null ? null : p.valor - metaAte(p.data) })).filter((p) => p.valor !== null);
  medir("M1-d", "JURO_2A_MENOS_META", variante(distancia, (s, i) => -s[i].valor));

  console.log("\nIC (Spearman) do escore (positivo = pressão de alta) contra o ouro depois; [intervalo de 90%, bootstrap em blocos de 13 semanas]");
  console.log(`fator | semanas | ${PRAZOS.map((h) => `${h} pregão(ões)`).join(" | ")} | 21 pregões: 1ª e 2ª metade, janelas de 12 meses com IC > 0`);
  for (const r of resultados) {
    if (!r.prazos.length) {
      console.log(`${r.sigla.padEnd(5)} | ${r.n} pontos: histórico insuficiente (mínimo de ${MINIMO_PONTOS})`);
      continue;
    }
    const celulas = r.prazos.map((p) => `${fmt(p.ic)} [${p.intervalo ? `${fmt(p.intervalo[0])}, ${fmt(p.intervalo[1])}` : "-"}]${p.intervalo && (p.intervalo[0] > 0 || p.intervalo[1] < 0) ? " *" : ""}`);
    const p21 = r.prazos.find((p) => p.pregoes === 21);
    const janelas = p21.janelasPositivas ? `${p21.janelasPositivas.positivas} de ${p21.janelasPositivas.total}` : "-";
    console.log(`${r.sigla.padEnd(5)} | ${r.n} (${r.desde.slice(0, 7)} a ${r.ate.slice(0, 7)}) | ${celulas.join(" | ")} | ${fmt(p21.primeiraMetade)}, ${fmt(p21.segundaMetade)}, ${janelas}`);
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
