"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const { primeiroVencimentoKc } = require("./basis-icf-kc");

// O MOMENTUM DO PREÇO DO CAFÉ (ADR 0139, análise do café de 2026-10-19, item E10): INFORMAÇÃO no prompt, sem voto e
// fora dos fatores. A definição é a do documento: o retorno de 5, 20 e 60 pregões, normalizado pela volatilidade. O
// FinMind não tem regra para ele: seguir a tendência não funcionou no café (o teste do ADR 0139), e a leitura fica com a
// IA, com a validação ao lado, até o Comitê decidir.
//
// OBSERVÁVEL → MEDIDA:
//   YAHOO.KC_CONTINUO.SETTLE (observation) - o café arábica de Nova York, 1º vencimento contínuo, US¢/lb (Yahoo, fonte
//     não oficial e provisória, ADR 0129)
//   - a série ajustada: o retorno do dia da troca de vencimento (primeiroVencimentoKc) é zerado, para o salto entre
//     contratos não parecer movimento (o mesmo ajuste do teste)
//   - z de n pregões = o retorno log de n pregões ÷ (o desvio dos retornos diários dos 60 pregões até o dia × √n): quantas
//     "volatilidades normais" o preço andou. |z| perto de 1 é um movimento comum; acima de 2, raro
// Função pura (medirMomentum) + carga point-in-time (calcularMomentumKc). Nada é gravado.

const SERIE_KC = "YAHOO.KC_CONTINUO.SETTLE";
const JANELAS = [5, 20, 60];
const PREGOES_VOLATILIDADE = 60;
// O mínimo de pregões: os 60 do retorno mais longo e os 60 da volatilidade.
const MINIMO = 121;

const venc = (data) => {
  const v = primeiroVencimentoKc(data);
  return v ? `${v.ano}${v.mes}` : null;
};
const arred = (n, casas) => Math.round(n * 10 ** casas) / 10 ** casas;

// Função PURA: o KC ({ data, valor }) -> o momentum no último pregão, ou null sem histórico.
function medirMomentum(kc) {
  const ordenado = [...kc].sort((a, b) => (a.data < b.data ? -1 : 1));
  if (ordenado.length < MINIMO) return null;
  const ajustado = [ordenado[0].valor];
  for (let i = 1; i < ordenado.length; i += 1) {
    const rolou = venc(ordenado[i].data) !== venc(ordenado[i - 1].data);
    ajustado.push(rolou ? ajustado[i - 1] : ajustado[i - 1] * (ordenado[i].valor / ordenado[i - 1].valor));
  }
  const ultimo = ajustado.length - 1;
  const diarios = [];
  for (let i = ultimo - PREGOES_VOLATILIDADE + 1; i <= ultimo; i += 1) diarios.push(Math.log(ajustado[i] / ajustado[i - 1]));
  const media = diarios.reduce((a, b) => a + b, 0) / diarios.length;
  const desvio = Math.sqrt(diarios.reduce((a, b) => a + (b - media) ** 2, 0) / (diarios.length - 1));
  const janelas = JANELAS.map((n) => {
    const log = Math.log(ajustado[ultimo] / ajustado[ultimo - n]);
    return { pregoes: n, retornoPct: arred((Math.exp(log) - 1) * 100, 2), z: desvio > 0 ? arred(log / (desvio * Math.sqrt(n)), 2) : null };
  });
  return {
    data: ordenado[ultimo].data,
    kc: ordenado[ultimo].valor,
    volatilidadeDiariaPct: arred(desvio * 100, 2),
    janelas
  };
}

const fmt = (n, casas = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const comSinal = (n, casas = 2) => `${n > 0 ? "+" : ""}${fmt(n, casas)}`;

// O tamanho de um z em palavras, para a IA não ler um número solto.
function tamanho(z) {
  const a = Math.abs(z);
  if (a < 1) return "dentro do normal";
  if (a < 2) return z > 0 ? "alta acima do normal" : "queda acima do normal";
  return z > 0 ? "alta extrema" : "queda extrema";
}

// O texto que vai ao prompt (o bloco do momentum, na base). `m` null: sem dado.
function textoMomentum(m) {
  if (!m) return "SEM DADO: o KC de Nova York não tem histórico bastante até a data (são precisos 121 pregões).";
  const linhas = [
    `KC de Nova York (1º vencimento contínuo, Yahoo, fonte não oficial; a troca de vencimento ajustada) em ${m.data.split("-").reverse().join("/")}: ` +
      `${fmt(m.kc)} US¢/lb. Volatilidade diária dos últimos 60 pregões: ${fmt(m.volatilidadeDiariaPct)}%.`,
    ...m.janelas.map(
      (j) => `- ${j.pregoes} pregões: ${comSinal(j.retornoPct)}% | z ${j.z === null ? "-" : `${comSinal(j.z)} (${tamanho(j.z)})`}`
    ),
    "O z é o retorno dividido pela volatilidade normal do prazo: perto de ±1, um movimento comum; acima de 2, raro.",
    "Validação (ADR 0139; o KC de 2000 a 2026): seguir a tendência NÃO funcionou no café. Com o sinal combinado (a média " +
      "dos três z) acima de +1 ou abaixo de −1, o preço seguiu para o mesmo lado em 49,5% dos casos em 1 pregão, 49,7% em 5, " +
      "45,0% em 21 e 47,6% em 62. Nos extremos de 20 pregões, houve reversão: com o z de 20 acima de +2, o KC subiu nos " +
      "21 pregões seguintes em só 33% dos dias (24% de 2000 a 2012, 41% de 2013 a 2026); abaixo de −2, em 54%. É " +
      "INFORMAÇÃO, sem voto: o momentum não é um fator e não entra em fatoresAFavor nem em fatoresContra."
  ];
  return linhas.join("\n");
}

// O momentum com o que se sabia no fim do dia `data` (AAAA-MM-DD). -> { momentum, texto }.
async function calcularMomentumKc({ data }, deps = {}) {
  const obterAsOf = deps.obterAsOf || pointInTimeService.obterAsOf;
  const asOf = new Date(`${data}T23:59:59.999-03:00`);
  // Dois anos de calendário cobrem com folga os 121 pregões.
  const desde = new Date(asOf.getTime() - 2 * 365 * 86400000).toISOString().slice(0, 10);
  const linhas = await obterAsOf({ seriesCodes: [SERIE_KC], asOf, observadoDesde: desde }, deps);
  const momentum = medirMomentum(linhas.map((l) => ({ data: String(l.observedAt).slice(0, 10), valor: l.value })));
  return { momentum, texto: textoMomentum(momentum) };
}

module.exports = { SERIE_KC, medirMomentum, textoMomentum, calcularMomentumKc };
