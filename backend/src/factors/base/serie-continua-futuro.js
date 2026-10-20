"use strict";

// Série contínua de um futuro por vencimento (análise do café de 2026-10-19, itens E1 e E11; PROPOSTA, a validar pelo
// Comitê): os vencimentos emendados num preço só, com a regra de rolagem e o ajuste explícitos. Calculada sob demanda,
// NUNCA gravada (como um fator, ADR 0008). Função pura: quem chama traz os preços e o calendário do produto.
//
// Rolagem (sem olhar o futuro: só o que se sabia no fim de cada pregão):
//   - LIQUIDEZ: a partir de `pregoesJanela` pregões antes do último pregão do vencimento atual, rola para o vencimento
//     seguinte com mais contratos negociados nos últimos `pregoesLiquidez` pregões quando essa soma passa a do atual.
//     Os candidatos são os `candidatos` vencimentos seguintes: pula sozinho os que não negociam, sem saltar para um
//     contrato distante. Só para frente: nunca volta a um vencimento anterior. A janela evita trocar por ruído (um
//     contrato a um ano do vencimento com meia dúzia de negócios na semana).
//   - TRAVA: se a liquidez não migrou até `pregoesTrava` pregões antes do último pregão, rola nesse dia para o candidato
//     com mais negócios (o mais próximo, no empate). Também rola o vencimento que passou do último pregão sem troca (um
//     buraco nos dados, como o do BDI em 2023).
//   O preço do dia da troca já é o do vencimento novo.
// Ajuste PROPORCIONAL: na troca, os preços anteriores são multiplicados pela razão novo ÷ antigo naquele pregão. Os
// retornos em % ficam iguais aos de cada contrato, e o trecho atual é o preço real. O passado ajustado muda a cada troca
// nova: só os retornos são comparáveis no tempo, não o nível.

const PARAMETROS_PADRAO = Object.freeze({ pregoesLiquidez: 5, pregoesTrava: 10, pregoesJanela: 40, candidatos: 3 });

function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function ehPregao(iso, feriados) {
  const dia = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dia !== 0 && dia !== 6 && !feriados.has(iso.slice(5));
}

// Os pregões em (de, ate], pelo calendário (seg-sex menos os feriados de data fixa, "MM-DD").
function pregoesEntre(de, ate, feriados) {
  let n = 0;
  for (let d = somarDias(de, 1); d <= ate; d = somarDias(d, 1)) if (ehPregao(d, feriados)) n += 1;
  return n;
}

// O dia útil `n` pregões antes de `iso` (n = 0: o próprio, recuando até um pregão).
function pregaoAntes(iso, n, feriados) {
  let d = iso;
  while (!ehPregao(d, feriados)) d = somarDias(d, -1);
  for (let restantes = n; restantes > 0; ) {
    d = somarDias(d, -1);
    if (ehPregao(d, feriados)) restantes -= 1;
  }
  return d;
}

// `contratos`: [{ ticker, vencimento: "AAAA-MM", ultimoPregao: "AAAA-MM-DD" }]; `ajustes` e `negociados`: Map ticker ->
// Map data -> valor (o ajuste existe em todo pregão de um vencimento listado; os negociados, só nos dias com negócio).
// `feriados`: Set "MM-DD" para contar os pregões até o último. -> { pontos, trocas }.
//   pontos: [{ data, ticker, valor (o ajuste real), ajustado, negociados5 }]
//   trocas: [{ data, de, para, motivo: "LIQUIDEZ" | "TRAVA", precoDe, precoPara, razao, negociadosDe, negociadosPara }]
function montarSerieContinua({ contratos, ajustes, negociados, feriados = new Set() }, parametros = PARAMETROS_PADRAO) {
  const { pregoesLiquidez, pregoesTrava, pregoesJanela, candidatos: quantosCandidatos } = { ...PARAMETROS_PADRAO, ...parametros };
  const ordenados = [...contratos].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const dias = [...new Set([...ajustes.values()].flatMap((m) => [...m.keys()]))].sort();
  const indiceDoDia = new Map(dias.map((d, i) => [d, i]));

  // Os negociados de um vencimento nos `pregoesLiquidez` pregões da base até `data` (inclusive).
  const somaNegociados = (ticker, data) => {
    const porDia = negociados.get(ticker);
    if (!porDia) return 0;
    const i = indiceDoDia.get(data);
    return dias.slice(Math.max(0, i - pregoesLiquidez + 1), i + 1).reduce((soma, d) => soma + (porDia.get(d) || 0), 0);
  };
  const ajusteNoDia = (ticker, data) => ajustes.get(ticker)?.get(data);
  // Os `quantosCandidatos` vencimentos seguintes ao atual que ainda negociam e têm ajuste no dia, do que tem mais
  // negócios ao mais próximo.
  const candidatos = (posicao, data) =>
    ordenados
      .map((c, k) => ({ c, posicao: k }))
      .filter(({ c, posicao: k }) => k > posicao && data <= c.ultimoPregao)
      .slice(0, quantosCandidatos)
      .filter(({ c }) => ajusteNoDia(c.ticker, data) !== undefined)
      .map((x) => ({ ...x, soma: somaNegociados(x.c.ticker, data) }))
      .sort((a, b) => b.soma - a.soma || a.posicao - b.posicao);

  const pontos = [];
  const trocas = [];
  let atual = -1;
  for (const data of dias) {
    if (atual === -1) {
      // O 1º pregão: o vencimento mais próximo com ajuste; a liquidez decide daí em diante, já com a janela.
      const primeiro = ordenados.findIndex((c) => data <= c.ultimoPregao && ajusteNoDia(c.ticker, data) !== undefined);
      if (primeiro === -1) continue;
      atual = primeiro;
    } else {
      const contrato = ordenados[atual];
      const somaAtual = somaNegociados(contrato.ticker, data);
      const [melhor] = candidatos(atual, data);
      const naJanela = data >= pregaoAntes(contrato.ultimoPregao, pregoesJanela, feriados);
      const trava = data >= pregaoAntes(contrato.ultimoPregao, pregoesTrava, feriados);
      const motivo = melhor && naJanela && melhor.soma > somaAtual ? "LIQUIDEZ" : melhor && trava ? "TRAVA" : null;
      if (motivo) {
        const precoDe = ajusteNoDia(contrato.ticker, data);
        const precoPara = ajusteNoDia(melhor.c.ticker, data);
        trocas.push({
          data,
          de: contrato.ticker,
          para: melhor.c.ticker,
          motivo,
          precoDe: precoDe ?? null,
          precoPara,
          // Sem o ajuste do antigo no dia (já parou), a razão é a do último pregão dele.
          razao: (precoPara / (precoDe ?? ultimoAjusteAte(ajustes.get(contrato.ticker), data))),
          negociadosDe: somaAtual,
          negociadosPara: melhor.soma
        });
        atual = melhor.posicao;
      }
    }
    const ticker = ordenados[atual].ticker;
    const valor = ajusteNoDia(ticker, data);
    if (valor === undefined) continue;
    pontos.push({ data, ticker, valor, ajustado: valor, negociados5: somaNegociados(ticker, data) });
  }

  // O ajuste proporcional, de trás para frente: cada troca multiplica tudo o que veio antes dela.
  let fator = 1;
  let t = trocas.length - 1;
  for (let i = pontos.length - 1; i >= 0; i -= 1) {
    while (t >= 0 && pontos[i].data < trocas[t].data) {
      fator *= trocas[t].razao;
      t -= 1;
    }
    pontos[i].ajustado = pontos[i].valor * fator;
  }
  return { pontos, trocas };
}

function ultimoAjusteAte(porDia, data) {
  let ultimo;
  for (const [d, v] of porDia || []) if (d <= data && (!ultimo || d > ultimo.d)) ultimo = { d, v };
  return ultimo?.v;
}

module.exports = { PARAMETROS_PADRAO, montarSerieContinua, pregoesEntre, pregaoAntes };
