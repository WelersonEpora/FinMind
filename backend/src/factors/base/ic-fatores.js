"use strict";

// O IC (Information Coefficient) de um fator: a correlação de Spearman entre o escore da leitura C e o retorno futuro do
// preço, o método da §4 da análise do café de 2026-10-19 para verificar inversão de sinal (ADR 0141). Funções puras: quem
// chama traz os pontos do fator e a série de preço. Não é regra nem fator: mede a relação no histórico.

// A leitura C em número: alta positiva, baixa negativa; forte 2, moderada 1, fraca 0,5; neutra 0.
const INTENSIDADE = Object.freeze({ FORTE: 2, MODERADA: 1, FRACA: 0.5 });
function escoreDaLeitura(decisao) {
  if (!decisao) return null;
  const tamanho = INTENSIDADE[decisao.intensidade] ?? 1;
  if (decisao.direcao === "ALTA") return tamanho;
  if (decisao.direcao === "BAIXA") return -tamanho;
  return 0;
}

// Os postos médios (empates com a média dos postos).
function postos(valores) {
  const ordem = valores.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(valores.length);
  for (let k = 0; k < ordem.length; ) {
    let j = k;
    while (j + 1 < ordem.length && ordem[j + 1][0] === ordem[k][0]) j += 1;
    for (let m = k; m <= j; m += 1) r[ordem[m][1]] = (k + j) / 2;
    k = j + 1;
  }
  return r;
}

// Spearman de dois vetores do mesmo tamanho; null com menos de `minimo` pares ou sem variação.
function spearman(x, y, minimo = 20) {
  if (x.length < minimo || x.length !== y.length) return null;
  const a = postos(x);
  const b = postos(y);
  const n = x.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}

// A série de preço ajustada pela troca de contrato: o retorno do dia em que `contratoDe(data)` muda é zerado.
// `precos`: [{ data, valor }] em ordem. -> [valor ajustado], na mesma ordem.
function ajustarRolagem(precos, contratoDe) {
  const ajustado = precos.length ? [precos[0].valor] : [];
  for (let i = 1; i < precos.length; i += 1) {
    const rolou = contratoDe(precos[i].data) !== contratoDe(precos[i - 1].data);
    ajustado.push(rolou ? ajustado[i - 1] : ajustado[i - 1] * (precos[i].valor / precos[i - 1].valor));
  }
  return ajustado;
}

// O índice do 1º pregão DEPOIS de `iso` (a leitura publicada num dia vale a partir do pregão seguinte), ou -1.
function pregaoDepois(datas, iso) {
  let lo = 0;
  let hi = datas.length - 1;
  let r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (datas[m] > iso) {
      r = m;
      hi = m - 1;
    } else lo = m + 1;
  }
  return r;
}

// Gerador determinístico (o mesmo intervalo a cada execução).
function aleatorio(semente) {
  let s = semente;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

// O intervalo de `nivel` do IC por bootstrap em blocos (os retornos de semanas vizinhas se sobrepõem): reamostra blocos
// de `bloco` pares seguidos. -> [inferior, superior] ou null.
function intervaloBootstrap(pares, { bloco = 13, reamostras = 1000, nivel = 0.9, semente = 7 } = {}) {
  if (pares.length < Math.max(20, bloco * 2)) return null;
  const sortear = aleatorio(semente);
  const blocos = Math.ceil(pares.length / bloco);
  const ics = [];
  for (let r = 0; r < reamostras; r += 1) {
    const x = [];
    const y = [];
    for (let b = 0; b < blocos; b += 1) {
      const inicio = Math.floor(sortear() * (pares.length - bloco));
      for (let j = inicio; j < inicio + bloco; j += 1) {
        x.push(pares[j].escore);
        y.push(pares[j].retorno);
      }
    }
    const ic = spearman(x, y);
    if (ic !== null) ics.push(ic);
  }
  if (!ics.length) return null;
  ics.sort((a, b) => a - b);
  const cauda = (1 - nivel) / 2;
  return [ics[Math.floor(cauda * ics.length)], ics[Math.ceil((1 - cauda) * ics.length) - 1]];
}

// O IC de um fator em cada prazo. `pontos`: [{ semana, disponivelEm (AAAA-MM-DD), escore }]; `datas` e `ajustado`: o preço.
// -> { n, desde, ate, naoNeutros, prazos: [{ pregoes, n, ic, intervalo, primeiraMetade, segundaMetade, janelasPositivas }] }.
function icDoFator(pontos, { datas, ajustado }, prazos = [1, 5, 21, 62], opcoes = {}) {
  const validos = pontos
    .filter((p) => p.escore !== null && p.escore !== undefined)
    .map((p) => ({ ...p, i: pregaoDepois(datas, p.disponivelEm > p.semana ? p.disponivelEm : p.semana) }))
    .filter((p) => p.i >= 0);
  const retorno = (i, h) => (i + h < ajustado.length ? (ajustado[i + h] / ajustado[i] - 1) * 100 : undefined);
  const resultado = {
    n: validos.length,
    desde: validos[0]?.semana ?? null,
    ate: validos.at(-1)?.semana ?? null,
    naoNeutros: validos.length ? validos.filter((p) => p.escore !== 0).length / validos.length : null,
    prazos: []
  };
  for (const h of prazos) {
    const pares = validos.map((p) => ({ escore: p.escore, retorno: retorno(p.i, h) })).filter((p) => p.retorno !== undefined);
    const ic = (lista) => spearman(lista.map((p) => p.escore), lista.map((p) => p.retorno));
    const meio = Math.floor(pares.length / 2);
    // Janelas de 52 semanas, de 13 em 13: a estabilidade do sinal.
    const janelas = [];
    for (let k = 0; k + 52 <= pares.length; k += 13) janelas.push(ic(pares.slice(k, k + 52)));
    const comIc = janelas.filter((v) => v !== null);
    resultado.prazos.push({
      pregoes: h,
      n: pares.length,
      ic: ic(pares),
      intervalo: intervaloBootstrap(pares, opcoes),
      primeiraMetade: ic(pares.slice(0, meio)),
      segundaMetade: ic(pares.slice(meio)),
      janelasPositivas: comIc.length ? { positivas: comIc.filter((v) => v > 0).length, total: comIc.length } : null
    });
  }
  return resultado;
}

module.exports = { escoreDaLeitura, spearman, ajustarRolagem, pregaoDepois, intervaloBootstrap, icDoFator };
