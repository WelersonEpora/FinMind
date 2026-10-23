"use strict";

const { posicaoNoHistorico } = require("./modelos/posicao-historica");
const { spearman, pregaoDepois } = require("./base/ic-fatores");

// A validação fora da amostra da regra proposta para o F3 do café (ADR 0145, pré-registro; a regra é a do ADR 0143,
// congelada). Funções PURAS: quem chama traz a série do estoque (já com o percentil, no desenho C) e o KC ajustado pela
// rolagem. Não é fator nem vai ao prompt: só mede.

// A regra congelada (ADR 0143): o percentil da variação do estoque contra o próprio histórico. Escore: baixa moderada
// -2, baixa fraca -1, neutra 0.
const REGRA = Object.freeze({ moderada: 10, fraca: 20 });
function leituraDaRegra(percentil) {
  if (percentil === null || percentil === undefined) return null;
  if (percentil < REGRA.moderada) return { codigo: "BAIXA_MODERADA", escore: -2 };
  if (percentil < REGRA.fraca) return { codigo: "BAIXA_FRACA", escore: -1 };
  return { codigo: "NEUTRA", escore: 0 };
}

// O critério pré-registrado (ADR 0145).
const CRITERIO = Object.freeze({ pregoes: 62, diferencaMinimaPp: 10, episodiosMinimos: 3 });

// Desenho A: a variação mensal do estoque (cada mês contra o anterior) e o percentil dela contra os `janela` meses
// anteriores (mínimo `minimo`). `meses`: [{ mes: "AAAA-MM", valor, publicadoEm: "AAAA-MM-DD" }] em ordem.
// -> [{ mes, data (a publicação), medida, percentil, leitura }].
function sinaisMensais(meses, { janela = 60, minimo = 36 } = {}) {
  const medidas = meses.map((m, i) => (i > 0 && meses[i - 1].valor > 0 ? (m.valor / meses[i - 1].valor - 1) * 100 : null));
  return meses.map((m, i) => {
    const anteriores = medidas.slice(Math.max(0, i - janela), i).filter((v) => v !== null);
    const { percentil } = posicaoNoHistorico(medidas[i], anteriores, minimo);
    return { mes: m.mes, data: m.publicadoEm, medida: medidas[i], percentil, leitura: leituraDaRegra(percentil) };
  });
}

// O retorno do KC (ajustado pela rolagem) do 1º pregão DEPOIS de `data` até `pregoes` pregões depois dele, em %. null
// sem o período completo. `kc`: { datas, ajustado }.
function retornoDepois(kc, data, pregoes = CRITERIO.pregoes) {
  const i = pregaoDepois(kc.datas, data);
  if (i === -1 || i + pregoes >= kc.datas.length) return null;
  return (kc.ajustado[i + pregoes] / kc.ajustado[i] - 1) * 100;
}

// Os sinais com o resultado: só os que têm leitura e retorno.
function amostras(sinais, kc, pregoes = CRITERIO.pregoes) {
  return sinais
    .filter((s) => s.leitura)
    .map((s) => ({ ...s, retorno: retornoDepois(kc, s.data, pregoes) }))
    .filter((s) => s.retorno !== null);
}

const subiu = (lista) => (lista.length ? (lista.filter((a) => a.retorno > 0).length / lista.length) * 100 : null);
const media = (lista) => (lista.length ? lista.reduce((s, a) => s + a.retorno, 0) / lista.length : null);

// O resultado contra o critério. `amostras` em ordem; sinais seguidos contam como UM episódio.
function avaliar(lista) {
  const comSinal = lista.filter((a) => a.leitura.escore < 0);
  const semSinal = lista.filter((a) => a.leitura.escore === 0);
  let episodios = 0;
  lista.forEach((a, i) => {
    if (a.leitura.escore < 0 && (i === 0 || lista[i - 1].leitura.escore === 0)) episodios += 1;
  });
  const ic = spearman(
    lista.map((a) => a.leitura.escore),
    lista.map((a) => a.retorno),
    3
  );
  const [subiuCom, subiuSem] = [subiu(comSinal), subiu(semSinal)];
  // A diferença a favor da regra: quanto MENOS o KC subiu depois do sinal de baixa do que sem sinal.
  const diferencaPp = subiuCom === null || subiuSem === null ? null : subiuSem - subiuCom;

  let veredito = "INCONCLUSIVO";
  if (episodios >= CRITERIO.episodiosMinimos && diferencaPp !== null && ic !== null) {
    if (diferencaPp >= CRITERIO.diferencaMinimaPp && ic > 0) veredito = "PASSA";
    else if (diferencaPp < 0 || ic <= 0) veredito = "NAO_PASSA";
  }
  return {
    n: lista.length,
    comSinal: { n: comSinal.length, subiuPct: subiuCom, retornoMedio: media(comSinal) },
    semSinal: { n: semSinal.length, subiuPct: subiuSem, retornoMedio: media(semSinal) },
    diferencaPp,
    ic,
    episodios,
    veredito
  };
}

module.exports = { REGRA, CRITERIO, leituraDaRegra, sinaisMensais, retornoDepois, amostras, avaliar };
