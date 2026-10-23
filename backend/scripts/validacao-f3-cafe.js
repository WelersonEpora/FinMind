"use strict";

// A validação fora da amostra da regra proposta para o F3 do café (ADR 0145, pré-registro; a regra do ADR 0143,
// congelada em factors/regra-f3-validacao.js). Não chama a IA e não grava nada: só lê e imprime o resultado contra o
// critério pré-registrado.
//
// Uso:
//   npm run validacao:f3 -- --desenho=A   o estoque certificado de Nova York da ICO (mensal), com o sinal conhecido até
//                                         31/08/2019, antes da amostra da calibração (12/2019 em diante)
//   npm run validacao:f3 -- --desenho=C   a sombra: o diário da ICE, as semanas depois de 23/10/2026 (no servidor)
//   [-- --json=saida.json]

const fs = require("node:fs");
const { sequelize } = require("../src/models");
const observationRepository = require("../src/repositories/observation.repository");
const pointInTimeService = require("../src/services/point-in-time.service");
const { primeiroVencimentoKc } = require("../src/factors/basis-icf-kc");
const { ajustarRolagem } = require("../src/factors/base/ic-fatores");
const { METODOLOGIA: F3 } = require("../src/factors/estoques-cafe-ice.factor");
const validacao = require("../src/factors/regra-f3-validacao");

const SERIE_ICO = "ICO.CAFE.ESTOQUE_NOVA_YORK";
// Desenho A: o último sinal da amostra (os 62 pregões terminam antes de 12/2019).
const FIM_DO_DESENHO_A = "2019-08-31";
// Desenho C: as semanas depois do pré-registro.
const INICIO_DO_DESENHO_C = "2026-10-23";

function argumento(nome) {
  const arg = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return arg ? arg.slice(nome.length + 3) : undefined;
}

const iso = (valor) => new Date(valor).toISOString().slice(0, 10);
const diaEmSaoPaulo = (valor) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(valor));
const fmt = (v, casas = 1) => (v === null || v === undefined ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(casas)}`);
const contrato = (data) => JSON.stringify(primeiroVencimentoKc(data));

async function lerKc(asOf) {
  const kc = (await pointInTimeService.obterAsOf({ seriesCodes: ["YAHOO.KC_CONTINUO.SETTLE"], asOf }))
    .map((l) => ({ data: String(l.observedAt).slice(0, 10), valor: l.value }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));
  return { datas: kc.map((p) => p.data), ajustado: ajustarRolagem(kc, contrato) };
}

// Desenho A: cada mês com o valor da 1ª publicação (o que se sabia quando o relatório saiu).
async function sinaisDoDesenhoA() {
  const versoes = [...(await observationRepository.buscarVersoes(SERIE_ICO)).values()].flat();
  const porMes = new Map();
  for (const v of versoes) {
    const mes = String(v.observed_at).slice(0, 7);
    const publicadoEm = diaEmSaoPaulo(v.published_at);
    const atual = porMes.get(mes);
    if (!atual || publicadoEm < atual.publicadoEm) porMes.set(mes, { mes, valor: Number(v.value), publicadoEm });
  }
  const meses = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  return validacao.sinaisMensais(meses).filter((s) => s.data <= FIM_DO_DESENHO_A);
}

// Desenho C: as semanas do F3 (o percentil da camada B, a definição da calibração) publicadas depois do pré-registro.
async function sinaisDoDesenhoC(asOf) {
  const pontos = await F3.calcular({ asOf });
  return pontos
    .map((p) => ({ semana: p.observedAt, data: p.disponivelEm ? iso(p.disponivelEm) : p.observedAt, medida: p.medida, percentil: p.percentilJanela ?? null }))
    .filter((p) => p.data > INICIO_DO_DESENHO_C)
    .map((p) => ({ ...p, leitura: validacao.leituraDaRegra(p.percentil) }));
}

async function main() {
  const desenho = (argumento("desenho") || "").toUpperCase();
  if (!["A", "C"].includes(desenho)) throw new Error("Use --desenho=A ou --desenho=C.");
  const asOf = new Date();
  const kc = await lerKc(asOf);
  const sinais = desenho === "A" ? await sinaisDoDesenhoA() : await sinaisDoDesenhoC(asOf);
  const amostras = validacao.amostras(sinais, kc);
  const r = validacao.avaliar(amostras);

  console.log(`Desenho ${desenho} (ADR 0145). KC de Nova York: ${kc.datas[0]} a ${kc.datas.at(-1)}.`);
  console.log(`Sinais com leitura: ${sinais.filter((s) => s.leitura).length}; com o resultado de ${validacao.CRITERIO.pregoes} pregões: ${r.n}` + (r.n ? ` (${amostras[0].data} a ${amostras.at(-1).data})` : ""));
  console.log("\ndata       | medida   | percentil | leitura        | KC em 62 pregões");
  for (const a of amostras) {
    console.log(`${a.data} | ${fmt(a.medida, 2).padStart(8)}% | ${String(a.percentil?.toFixed(1)).padStart(9)} | ${a.leitura.codigo.padEnd(14)} | ${fmt(a.retorno)}%`);
  }
  console.log(`\nCom sinal de baixa: ${r.comSinal.n}, o KC subiu em ${fmt(r.comSinal.subiuPct)}% (retorno médio ${fmt(r.comSinal.retornoMedio)}%)`);
  console.log(`Sem sinal:          ${r.semSinal.n}, o KC subiu em ${fmt(r.semSinal.subiuPct)}% (retorno médio ${fmt(r.semSinal.retornoMedio)}%)`);
  console.log(`Diferença a favor da regra: ${fmt(r.diferencaPp)} p.p. (mínimo ${validacao.CRITERIO.diferencaMinimaPp}) | IC: ${fmt(r.ic, 3)} | episódios: ${r.episodios} (mínimo ${validacao.CRITERIO.episodiosMinimos})`);
  console.log(`Veredito: ${r.veredito}`);

  const json = argumento("json");
  if (json) fs.writeFileSync(json, JSON.stringify({ desenho, geradoEm: asOf.toISOString(), resultado: r, amostras }, null, 2));
}

main()
  .then(() => sequelize.close())
  .catch(async (erro) => {
    console.error(erro);
    await sequelize.close();
    process.exit(1);
  });
