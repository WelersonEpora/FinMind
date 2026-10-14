"use strict";

// A MEDIÇÃO PRÉ-REGISTRADA (ADR 0127, §10; etapa 7). Puro: recebe as séries e as datas; não lê nem grava nada.
//
//   pergunta:  a IA agrega valor ao processo, sobre uma regra sem nenhuma IA? (revista pelo usuário em 2026-10-14; era
//              "a recomendação agrega valor sobre a regra fixa?", hoje uma das duas partes)
//   medida:    a diferença diária de retorno IA − Persistência, em % do capital inicial; as partes, IA − Determinística
//              (a recomendação) e Determinística − Persistência (as leituras), somam a principal
//   intervalo: 80%, por block bootstrap circular da média (blocos de 10 pregões, semente fixa)
//   veredito:  AGREGA se o limite inferior > 0; NAO_AGREGA se o superior < 0; senão INCONCLUSIVO
//   datas:     o início do segmento + 3 meses (só descritivo), + 6 meses (a avaliação) e + 12 meses (a final)
//
// Um SEGMENTO é um trecho com os mesmos parâmetros (a versão INICIAL ou de AJUSTE; a correção de custo não conta), o
// mesmo modelo da recomendação e a mesma versão do prompt: mudar qualquer um deles reinicia a contagem. Mudar o prompt
// ou o modelo das leituras de tendência não reinicia: fica registrado (decisão do usuário, 2026-10-14). A avaliação usa
// só os dias antes da data dela, congelada; antes dela, os números são parciais e sem veredito (decisão do usuário,
// 2026-10-14). O tipo de bootstrap (circular), o número de reamostragens e o mínimo de dias para o intervalo são
// proposta do FinMind (o ADR fixa os blocos de 10 pregões, a semente fixa e os 80%).

const METODO = Object.freeze({ bloco: 10, reamostragens: 10000, semente: 127, nivel: 0.8, minimoDias: 20 });

// Gerador pseudoaleatório com semente (mulberry32): o mesmo intervalo para os mesmos dados, em qualquer máquina.
function geradorComSemente(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// O retorno de cada dia em % do capital inicial: a variação do patrimônio sobre o dia anterior (no 1º dia, sobre o
// capital). `serie`: [{ data, patrimonio }]. -> Map data -> retorno.
function retornosDiarios(serie, capitalInicial) {
  const ordenada = [...serie].sort((a, b) => a.data.localeCompare(b.data));
  const retornos = new Map();
  let anterior = capitalInicial;
  for (const { data, patrimonio } of ordenada) {
    retornos.set(data, ((patrimonio - anterior) / capitalInicial) * 100);
    anterior = patrimonio;
  }
  return retornos;
}

// A diferença diária IA − Determinística nos dias que as duas têm. -> [{ data, diferenca }] em ordem.
function diferencasDiarias(serieIa, serieDeterministica, capitalInicial) {
  const ia = retornosDiarios(serieIa, capitalInicial);
  const det = retornosDiarios(serieDeterministica, capitalInicial);
  return [...ia.keys()]
    .filter((data) => det.has(data))
    .sort()
    .map((data) => ({ data, diferenca: ia.get(data) - det.get(data) }));
}

const media = (valores) => valores.reduce((s, v) => s + v, 0) / valores.length;

function quantil(ordenados, p) {
  const pos = (ordenados.length - 1) * p;
  const baixo = Math.floor(pos);
  const alto = Math.ceil(pos);
  return ordenados[baixo] + (ordenados[alto] - ordenados[baixo]) * (pos - baixo);
}

// O intervalo da média por block bootstrap circular: cada reamostra junta blocos de `bloco` dias consecutivos (dando a
// volta no fim da série) até ter o tamanho da original. -> { media, inferior, superior } ou null (poucos dias).
function intervaloBootstrap(valores, metodo = METODO) {
  const n = valores.length;
  if (n < metodo.minimoDias) return null;
  const sorteio = geradorComSemente(metodo.semente);
  const medias = new Array(metodo.reamostragens);
  for (let b = 0; b < metodo.reamostragens; b += 1) {
    let soma = 0;
    let k = 0;
    while (k < n) {
      const inicio = Math.floor(sorteio() * n);
      for (let j = 0; j < metodo.bloco && k < n; j += 1, k += 1) soma += valores[(inicio + j) % n];
    }
    medias[b] = soma / n;
  }
  medias.sort((x, y) => x - y);
  const cauda = (1 - metodo.nivel) / 2;
  return { media: media(valores), inferior: quantil(medias, cauda), superior: quantil(medias, 1 - cauda) };
}

function veredito(intervalo) {
  if (!intervalo) return null;
  if (intervalo.inferior > 0) return "AGREGA";
  if (intervalo.superior < 0) return "NAO_AGREGA";
  return "INCONCLUSIVO";
}

// AAAA-MM-DD + n meses (o dia que não existe no mês de destino vira o último dele: 31/08 + 6 = 28/02).
function somarMeses(iso, n) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const total = ano * 12 + (mes - 1) + n;
  const anoNovo = Math.floor(total / 12);
  const mesNovo = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anoNovo, mesNovo, 0)).getUTCDate();
  return `${anoNovo}-${String(mesNovo).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

// Os segmentos, em ordem. `dias`: [{ data, parametrosVersao, modelo, versaoPrompt }] em ordem; um campo nulo (um dia
// sem recomendação ou sem decisão) herda o do dia anterior. -> [{ inicio, fim, parametrosVersao, modelo, versaoPrompt,
// mudou: [campos que mudaram em relação ao anterior] }].
function segmentar(dias) {
  const segmentos = [];
  let atual = null;
  const campos = ["parametrosVersao", "modelo", "versaoPrompt"];
  for (const dia of dias) {
    const chave = Object.fromEntries(campos.map((c) => [c, dia[c] ?? atual?.[c] ?? null]));
    const mudou = atual ? campos.filter((c) => atual[c] != null && chave[c] != null && chave[c] !== atual[c]) : [];
    if (!atual || mudou.length) {
      atual = { inicio: dia.data, fim: dia.data, ...chave, mudou };
      segmentos.push(atual);
    } else {
      Object.assign(atual, chave, { fim: dia.data });
    }
  }
  return segmentos;
}

// O resumo de um trecho de diferenças: dias, média diária, acumulada e o intervalo (da média e da acumulada).
function resumir(diferencas, metodo) {
  const valores = diferencas.map((d) => d.diferenca);
  if (!valores.length) return { dias: 0, media: null, acumulada: 0, intervalo: null, intervaloAcumulada: null };
  const intervalo = intervaloBootstrap(valores, metodo);
  const n = valores.length;
  return {
    dias: n,
    media: media(valores),
    acumulada: valores.reduce((s, v) => s + v, 0),
    intervalo,
    intervaloAcumulada: intervalo ? { inferior: intervalo.inferior * n, superior: intervalo.superior * n } : null
  };
}

// A medida de um segmento em `hoje`: as datas, o parcial (todos os dias até agora, sem veredito) e, passada a data, a
// avaliação e a final, cada uma com os dias antes dela e o veredito.
function medirSegmento({ diferencas, inicio, hoje, metodo = METODO }) {
  const datas = { descritiva: somarMeses(inicio, 3), avaliacao: somarMeses(inicio, 6), final: somarMeses(inicio, 12) };
  const doSegmento = diferencas.filter((d) => d.data >= inicio);
  const congelada = (ate) => {
    if (hoje < ate) return null;
    const resumo = resumir(doSegmento.filter((d) => d.data < ate), metodo);
    return { ...resumo, veredito: veredito(resumo.intervalo) };
  };
  return {
    inicio,
    datas,
    parcial: resumir(doSegmento, metodo),
    avaliacao: congelada(datas.avaliacao),
    final: congelada(datas.final),
    serie: doSegmento.reduce((acc, d) => {
      const anterior = acc.length ? acc[acc.length - 1].acumulada : 0;
      acc.push({ data: d.data, diferenca: d.diferenca, acumulada: anterior + d.diferenca });
      return acc;
    }, [])
  };
}

// As mudanças de prompt ou de modelo das leituras de tendência depois de `inicio`: não abrem segmento, só ficam
// registradas (decisão do usuário, 2026-10-14). `leituras`: [{ data, ativo, versaoPrompt, modelo }]. A referência de
// cada ativo é a última leitura antes de `inicio` (ou a primeira do segmento). -> [{ data, ativo, campo, de, para }].
function mudancasDasLeituras(leituras, inicio) {
  const ordenadas = [...leituras].sort((a, b) => a.data.localeCompare(b.data) || a.ativo.localeCompare(b.ativo));
  const ultima = new Map();
  const mudancas = [];
  for (const l of ordenadas) {
    const antes = ultima.get(l.ativo);
    if (antes && l.data >= inicio) {
      for (const campo of ["versaoPrompt", "modelo"]) {
        if (antes[campo] != null && l[campo] != null && antes[campo] !== l[campo]) mudancas.push({ data: l.data, ativo: l.ativo, campo, de: antes[campo], para: l[campo] });
      }
    }
    ultima.set(l.ativo, { versaoPrompt: l.versaoPrompt ?? antes?.versaoPrompt ?? null, modelo: l.modelo ?? antes?.modelo ?? null });
  }
  return mudancas;
}

module.exports = { METODO, mudancasDasLeituras, retornosDiarios, diferencasDiarias, intervaloBootstrap, veredito, somarMeses, segmentar, medirSegmento };
