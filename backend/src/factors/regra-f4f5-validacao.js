"use strict";

const { spearman, pregaoDepois } = require("./base/ic-fatores");

// O backtest pré-registrado do E8 (a regra F4 + F5, o físico do Cepea contra o custo) e do E9 (a regra do F5 com o KC em
// reais), ADR 0147. Funções PURAS: quem chama traz as semanas do F5 (`derivarCustosCafe`) e as séries de preço do
// resultado. Não é fator nem vai ao prompt: só mede.

const CRITERIO = Object.freeze({ pregoes: 62, diferencaMinimaPp: 10, episodiosMinimos: 3, semanasEntreEpisodios: 26 });

// Os escores congelados (ADR 0147). `decisao`: a leitura do F5 da semana ({ direcao, intensidade }).
const ESCORE_F5 = Object.freeze({ ALTA: { FORTE: 3, MODERADA: 2, FRACA: 1 }, BAIXA: { MODERADA: -2 } });
function escoreF5(decisao) {
  if (!decisao) return null;
  return ESCORE_F5[decisao.direcao]?.[decisao.intensidade] ?? 0;
}
// R1 (E8): só o físico abaixo do custo por 4 semanas (alta forte ou moderada do F5); a "alta fraca" (margem até 15%) é um
// limiar da escala do KC e não conta.
function escoreR1(decisao) {
  if (!decisao) return null;
  if (decisao.direcao === "ALTA" && decisao.intensidade === "FORTE") return 3;
  if (decisao.direcao === "ALTA" && decisao.intensidade === "MODERADA") return 2;
  return 0;
}

// O retorno de uma série ({ datas, valores }) do 1º pregão DEPOIS de `data` até `pregoes` pregões depois, em %.
function retornoDepois(serie, data, pregoes = CRITERIO.pregoes) {
  const i = pregaoDepois(serie.datas, data);
  if (i === -1 || i + pregoes >= serie.datas.length) return null;
  return (serie.valores[i + pregoes] / serie.valores[i] - 1) * 100;
}

// As semanas com escore e retorno: [{ semana, data, escore, retorno }].
function amostras(semanas, serie, escore, pregoes = CRITERIO.pregoes) {
  return semanas
    .map((s) => ({ semana: s.observedAt, data: s.ultimoPregao, margemTotalPct: s.margemTotalPct, escore: escore(s.decisao) }))
    .filter((s) => s.escore !== null)
    .map((s) => ({ ...s, retorno: retornoDepois(serie, s.data, pregoes) }))
    .filter((s) => s.retorno !== null);
}

// Episódios de um lado: uma semana com o sinal abre um episódio novo se a última com o sinal ficou 26 semanas ou mais atrás.
function episodios(lista, comSinal) {
  const semanas = lista.map((a, i) => (comSinal(a) ? i : null)).filter((i) => i !== null);
  return semanas.filter((i, k) => k === 0 || i - semanas[k - 1] >= CRITERIO.semanasEntreEpisodios).map((i) => lista[i].semana);
}

const subiu = (lista) => (lista.length ? (lista.filter((a) => a.retorno > 0).length / lista.length) * 100 : null);
const media = (lista) => (lista.length ? lista.reduce((s, a) => s + a.retorno, 0) / lista.length : null);

// Um lado contra o critério. `lado`: "ALTA" ou "BAIXA"; `ic`: o de todas as semanas.
function avaliarLado(lista, lado, ic) {
  const comSinal = (a) => (lado === "ALTA" ? a.escore > 0 : a.escore < 0);
  const com = lista.filter(comSinal);
  const sem = lista.filter((a) => a.escore === 0);
  const inicios = episodios(lista, comSinal);
  const [subiuCom, subiuSem] = [subiu(com), subiu(sem)];
  const diferencaPp = subiuCom === null || subiuSem === null ? null : lado === "ALTA" ? subiuCom - subiuSem : subiuSem - subiuCom;
  let veredito = "INCONCLUSIVO";
  if (inicios.length >= CRITERIO.episodiosMinimos && diferencaPp !== null && ic !== null) {
    if (diferencaPp >= CRITERIO.diferencaMinimaPp && ic > 0) veredito = "PASSA";
    else if (diferencaPp < 0 || ic <= 0) veredito = "NAO_PASSA";
  }
  return {
    lado,
    comSinal: { n: com.length, subiuPct: subiuCom, retornoMedio: media(com) },
    semSinal: { n: sem.length, subiuPct: subiuSem, retornoMedio: media(sem) },
    diferencaPp,
    episodios: inicios,
    veredito
  };
}

function avaliar(lista, lados) {
  const ic = spearman(
    lista.map((a) => a.escore),
    lista.map((a) => a.retorno),
    3
  );
  return { n: lista.length, ic, lados: lados.map((lado) => avaliarLado(lista, lado, ic)) };
}

module.exports = { CRITERIO, escoreF5, escoreR1, retornoDepois, amostras, episodios, avaliarLado, avaliar };
