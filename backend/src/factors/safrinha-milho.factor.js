"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");

// FATOR (PROPOSTA, ADR 0056): safrinha brasileira, fator "Safrinha brasileira (2ª safra)" do FEL 1 para o milho. A
// regra é a R-SAF v0 do David ("Motor do Milho", 2026-10-02, ADR 0055), com os limiares dele; o que o FinMind acrescentou
// está marcado. Camadas A e B calculadas, C simulada.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation), Conab, um levantamento por mês, cada série com todas as revisões (ADR 0022):
//     CONAB.MILHO.BRASIL.PRODUCAO_2A / AREA_2A / PRODUTIVIDADE_2A - a 2ª safra do Brasil (mil t, mil ha, kg/ha)
//   e NOAA STAR, semanal (ADR 0025), só como CONTEXTO, fora da conta (ADR 0070):
//     NOAA_VH.MILHO.BR_MT.VHI / BR_PR.VHI - a saúde da vegetação sobre a área de milho de MT e do PR (0 a 100)
//   fator (calculado sob demanda, NUNCA gravado), um ponto por LEVANTAMENTO (o que ele dizia da safra mais nova):
//     A. a produção, a área e a produtividade; a revisão contra o levantamento anterior; a revisão acumulada contra a
//        1ª estimativa da safra
//     B. a safra anterior no MESMO levantamento (o mesmo mês, um ano antes: "mesmo estágio", não o número final dela)
//        e a variação contra ela
//     C. R-SAF v0: produção 3% ou mais abaixo da safra anterior no mesmo levantamento, OU revisão acumulada de -2% ou
//        pior em 2 levantamentos seguidos -> pressão de ALTA; 3% ou mais acima, OU acumulada de +2% ou mais em 2
//        seguidos -> de BAIXA; abaixo dos limiares, uma revisão para cima dá viés de baixa FRACO (como o David escreveu).
//        Fora da conta: o alerta agroclimático (alta) e "plantio na janela, sem alerta" (baixa). O VHI de MT e do PR
//        não serve de alerta (dispara em 19 de 27 safrinhas, inclusive nas recordes; ADR 0070): vai como contexto. A
//        geada chega pelos eventos do INMET.
//        Acréscimos do FinMind: forte com nível e revisão no mesmo sentido; opostos dão neutra
//
// O número do levantamento vem do mês (a safra da Conab começa em outubro: outubro = 1º, setembro = 12º). A observation
// só ganha linha quando o valor muda: um levantamento é a data de publicação de qualquer destas séries, e o que ele
// disse de uma série é a última versão até ele. Um levantamento que a base não tem (a fonte não publicou o arquivo:
// mar a jun/2025 e jan/2026) não vira "mesmo estágio": a comparação fica sem dado.
//
// O peso do mês (Alto de março a julho; Médio em agosto e setembro; Baixo de outubro a fevereiro) é do David e vai no
// ponto como texto, sem entrar na conta. Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "safrinha_milho_conab";
// v2 (2026-10-05): o VHI de MT e do PR como contexto, fora da conta (ADR 0070).
const FACTOR_VERSION = 2;

const SERIES = Object.freeze({
  producao: "CONAB.MILHO.BRASIL.PRODUCAO_2A",
  area: "CONAB.MILHO.BRASIL.AREA_2A",
  produtividade: "CONAB.MILHO.BRASIL.PRODUTIVIDADE_2A"
});

// O contexto climático (ADR 0070): o VHI da NOAA sobre o milho dos dois maiores estados da safrinha.
const ESTADOS_VHI = Object.freeze([
  { sigla: "MT", serie: "NOAA_VH.MILHO.BR_MT.VHI" },
  { sigla: "PR", serie: "NOAA_VH.MILHO.BR_PR.VHI" }
]);
// Abaixo disso a NOAA classifica como estresse da vegetação.
const VHI_ESTRESSE = 40;
const SEMANAS_VHI = 2;
// Uma semana do VHI só entra se for de até 21 dias antes do limite (uma semana velha não é o momento do levantamento).
const DIAS_VHI_RECENTE = 21;

// Do David (R-SAF v0): 3% contra a safra anterior; 2% de revisão acumulada em 2 levantamentos seguidos. O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarNivelPct: 3,
  limiarRevisaoPct: 2,
  levantamentosSeguidos: 2
});

const ROTULOS_TENDENCIA = { SUBINDO: "Estimativa subindo", CAINDO: "Estimativa caindo", ESTAVEL: "Estável" };

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// "2026-09" -> 12 (outubro = 1º levantamento da safra).
function numeroDoLevantamento(mes) {
  return ((mes - 10 + 12) % 12) + 1;
}

function pesoDoMes(mes) {
  if (mes >= 3 && mes <= 7) return "Alto";
  if (mes === 8 || mes === 9) return "Médio";
  return "Baixo";
}

function rotuloSafra(observedAt) {
  const ano = Number(observedAt.slice(0, 4));
  return `${ano}/${String((ano + 1) % 100).padStart(2, "0")}`;
}

// Em %, com duas casas; uma variação que arredonda para zero sai 0, não -0.
function variacaoPct(atual, base) {
  return atual !== undefined && atual !== null && base ? arredondar((atual / base - 1) * 100, 2) + 0 : null;
}

// Camada C (função pura). `entrada`: { variacaoSafraAnteriorPct, acumuladasPct (a do levantamento e as anteriores, da
// mais recente para trás; null onde não há), revisaoPct (contra o levantamento anterior) }.
function decidirSafrinha(entrada, parametros = PARAMETROS_PADRAO) {
  const { variacaoSafraAnteriorPct: nivel, acumuladasPct = [], revisaoPct = null } = entrada;
  const seguidas = acumuladasPct.slice(0, parametros.levantamentosSeguidos);
  const completas = seguidas.length === parametros.levantamentosSeguidos && seguidas.every((v) => v !== null && v !== undefined);
  if ((nivel === null || nivel === undefined) && !completas && (revisaoPct === null || revisaoPct === undefined)) return null;

  const porNivel =
    nivel === null || nivel === undefined
      ? faixa.DIRECAO.NEUTRA
      : nivel <= -parametros.limiarNivelPct
        ? faixa.DIRECAO.ALTA
        : nivel >= parametros.limiarNivelPct
          ? faixa.DIRECAO.BAIXA
          : faixa.DIRECAO.NEUTRA;
  let porRevisao = faixa.DIRECAO.NEUTRA;
  if (completas && seguidas.every((v) => v <= -parametros.limiarRevisaoPct)) porRevisao = faixa.DIRECAO.ALTA;
  else if (completas && seguidas.every((v) => v >= parametros.limiarRevisaoPct)) porRevisao = faixa.DIRECAO.BAIXA;

  const base = { tendencia: null, mudancaPp: null, porNivel, porRevisao };
  if (revisaoPct !== null && revisaoPct !== undefined) {
    base.tendencia = revisaoPct > 0 ? faixa.TENDENCIA.SUBINDO : revisaoPct < 0 ? faixa.TENDENCIA.CAINDO : faixa.TENDENCIA.ESTAVEL;
    base.mudancaPp = revisaoPct;
  }
  const opostos = porNivel !== faixa.DIRECAO.NEUTRA && porRevisao !== faixa.DIRECAO.NEUTRA && porNivel !== porRevisao;
  if (opostos) return { ...base, direcao: faixa.DIRECAO.NEUTRA, intensidade: faixa.INTENSIDADE.FRACA, conflito: true };
  if (porNivel !== faixa.DIRECAO.NEUTRA && porNivel === porRevisao) return { ...base, direcao: porNivel, intensidade: faixa.INTENSIDADE.FORTE };
  const direcao = porNivel !== faixa.DIRECAO.NEUTRA ? porNivel : porRevisao;
  if (direcao !== faixa.DIRECAO.NEUTRA) return { ...base, direcao, intensidade: faixa.INTENSIDADE.MODERADA };
  // Abaixo dos limiares: uma revisão para cima é viés de baixa fraco (R-SAF v0).
  if (revisaoPct !== null && revisaoPct > 0) return { ...base, direcao: faixa.DIRECAO.BAIXA, intensidade: faixa.INTENSIDADE.FRACA, vies: true };
  return { ...base, direcao: faixa.DIRECAO.NEUTRA, intensidade: faixa.INTENSIDADE.FRACA };
}

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const vhiFmt = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// O VHI de cada estado: [{ semana, em, valor }], da semana mais antiga para a mais recente (a versão mais recente de cada
// semana entre as que o asOf já conhece).
function vhiPorEstado(linhasVhi) {
  const porEstado = new Map(ESTADOS_VHI.map((e) => [e.serie, new Map()]));
  for (const linha of linhasVhi) {
    const semanas = porEstado.get(linha.seriesCode);
    if (!semanas) continue;
    const atual = semanas.get(linha.observedAt);
    if (!atual || linha.publishedAt > atual.em) semanas.set(linha.observedAt, { semana: linha.observedAt, em: linha.publishedAt, valor: linha.value });
  }
  return new Map([...porEstado].map(([serie, semanas]) => [serie, [...semanas.values()].sort((a, b) => a.semana.localeCompare(b.semana))]));
}

// O VHI de um levantamento, só contexto: em cada estado, as 2 semanas mais recentes publicadas antes de `limite`
// (quando o levantamento seguinte saiu; null = o último, até o asOf). null sem VHI recente.
function vhiDoLevantamento(vhi, observedAt, limite) {
  const corte = somarDias(limite ? new Date(limite).toISOString().slice(0, 10) : observedAt, -DIAS_VHI_RECENTE);
  const partes = [];
  let semana = null;
  for (const { sigla, serie } of ESTADOS_VHI) {
    const ultimas = vhi.get(serie).filter((s) => !limite || s.em < limite).slice(-SEMANAS_VHI);
    if (ultimas.length === 0 || ultimas.at(-1).semana < corte) continue;
    if (!semana || ultimas.at(-1).semana > semana) semana = ultimas.at(-1).semana;
    const abaixo = ultimas.every((s) => s.valor < VHI_ESTRESSE);
    partes.push(`${sigla} ${ultimas.map((s) => vhiFmt(s.valor)).join(" e ")}${abaixo ? " (abaixo de 40)" : ""}`);
  }
  if (partes.length === 0) return { vhiContexto: null, vhiContextoDetalhe: null };
  return {
    vhiContexto: `semanas até ${semana.split("-").reverse().join("/")}`,
    vhiContextoDetalhe:
      `${partes.join("; ")}. Só contexto, fora da conta: na área de milho desses estados o VHI fica abaixo de 40 ` +
      "em abril e maio na maioria dos anos, inclusive nos de safra recorde (a máscara não separa a safrinha)."
  };
}

// Função PURA: recebe as linhas de obterVersoesAsOf() da Conab (e, como contexto, as de obterAsOf() do VHI) e devolve
// um ponto por levantamento.
function derivarSafrinhaMilho(linhasVersoes, { parametros = PARAMETROS_PADRAO, linhasVhi = [] } = {}) {
  const vhi = vhiPorEstado(linhasVhi);
  const porEdicao = new Map();
  for (const linha of linhasVersoes) {
    const edicao = new Date(linha.publishedAt).toISOString().slice(0, 10);
    if (!porEdicao.has(edicao)) porEdicao.set(edicao, []);
    porEdicao.get(edicao).push(linha);
  }

  const estado = new Map(Object.values(SERIES).map((codigo) => [codigo, new Map()]));
  const valor = (serie, safra) => estado.get(serie).get(safra);
  // O que cada levantamento disse da produção de cada safra, por mês ("AAAA-MM"): o "mesmo estágio" um ano depois.
  const producaoNoMes = new Map();
  const primeiraEstimativa = new Map();
  const acumuladas = new Map();
  const pontos = [];
  let anterior = null;

  const edicoes = [...porEdicao.keys()].sort();
  edicoes.forEach((edicao, indice) => {
    for (const linha of porEdicao.get(edicao)) {
      estado.get(linha.seriesCode).set(linha.observedAt, linha.value);
      if (linha.seriesCode === SERIES.producao && !primeiraEstimativa.has(linha.observedAt)) {
        primeiraEstimativa.set(linha.observedAt, { valor: linha.value, edicao });
      }
    }
    const safras = [...estado.get(SERIES.producao).keys()].sort();
    const safra = safras.at(-1);
    if (!safra) return;
    const mes = Number(edicao.slice(5, 7));
    const mesAno = edicao.slice(0, 7);
    producaoNoMes.set(mesAno, new Map(estado.get(SERIES.producao)));

    const producao = valor(SERIES.producao, safra);
    const safraAnterior = `${Number(safra.slice(0, 4)) - 1}${safra.slice(4)}`;
    const mesmoMesAnoAntes = `${Number(mesAno.slice(0, 4)) - 1}${mesAno.slice(4)}`;
    const producaoSafraAnterior = producaoNoMes.get(mesmoMesAnoAntes)?.get(safraAnterior) ?? null;
    // A 1ª estimativa só vale se for do 1º levantamento (outubro): a base começa em fev/2025, no meio da safra 2024/25.
    const primeira = primeiraEstimativa.get(safra);
    const primeiraValida = primeira && Number(primeira.edicao.slice(5, 7)) === 10 ? primeira.valor : null;
    const acumulada = variacaoPct(producao, primeiraValida);
    acumuladas.set(edicao, acumulada);
    const revisao = anterior?.safra === safra ? variacaoPct(producao, anterior.producao) : null;
    const acumuladasPct = [acumulada];
    const edicoesDaSafra = pontos.filter((p) => p.safraIso === safra).map((p) => p.observedAt);
    for (let k = 1; k < parametros.levantamentosSeguidos; k += 1) acumuladasPct.push(acumuladas.get(edicoesDaSafra.at(-k)) ?? null);
    const variacaoSafraAnterior = variacaoPct(producao, producaoSafraAnterior);

    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: edicao,
      safraIso: safra,
      safra: rotuloSafra(safra),
      levantamento: `${numeroDoLevantamento(mes)}º`,
      producaoMilT: producao,
      areaMilHa: valor(SERIES.area, safra) ?? null,
      produtividadeKgHa: valor(SERIES.produtividade, safra) === undefined ? null : arredondar(valor(SERIES.produtividade, safra), 0),
      revisaoPct: revisao,
      acumuladaPct: acumulada,
      producaoSafraAnteriorMilT: producaoSafraAnterior,
      variacaoSafraAnteriorPct: variacaoSafraAnterior,
      pesoDoMes: pesoDoMes(mes),
      ...vhiDoLevantamento(vhi, edicao, edicoes[indice + 1] ? porEdicao.get(edicoes[indice + 1])[0].publishedAt : null),
      decisao: decidirSafrinha({ variacaoSafraAnteriorPct: variacaoSafraAnterior, acumuladasPct, revisaoPct: revisao }, parametros),
      disponivelEm: porEdicao.get(edicao)[0].publishedAt,
      disponivelEmEhEstimado: porEdicao.get(edicao)[0].publishedAtIsEstimated
    });
    anterior = { safra, producao };
  });
  // `safraIso` só serve para achar os levantamentos da mesma safra: não vai para fora.
  return pontos.map(({ safraIso: _safraIso, ...ponto }) => ponto);
}

async function calcularSafrinhaMilho({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const [linhas, linhasVhi] = await Promise.all([
    servico.obterVersoesAsOf({ seriesCodes: Object.values(SERIES), asOf }, deps),
    servico.obterAsOf({ seriesCodes: ESTADOS_VHI.map((e) => e.serie), asOf }, deps)
  ]);
  return derivarSafrinhaMilho(linhas, { parametros, linhasVhi });
}

// --- Camada C: explicação e exemplos ------------------------------------------------------------------------------

const pct = (n) => `${faixa.comSinal(n)}%`;
const NOME = { ALTA: "pressão de alta", BAIXA: "pressão de baixa", NEUTRA: "neutra" };

function explicarSafrinha(ponto, parametros = PARAMETROS_PADRAO) {
  const d = ponto?.decisao;
  if (!d) return [];
  const passos = [
    `${ponto.levantamento} levantamento da Conab (${ponto.observedAt.split("-").reverse().join("/")}), safra ${ponto.safra}: ` +
      `${faixa.fmt(ponto.producaoMilT, 1)} mil t na 2ª safra (A).`
  ];
  passos.push(
    ponto.variacaoSafraAnteriorPct === null
      ? "Nível: sem a safra anterior no mesmo levantamento na base → sem direção pelo nível."
      : `Nível: contra ${faixa.fmt(ponto.producaoSafraAnteriorMilT, 1)} mil t da safra anterior no mesmo levantamento, ` +
          `${pct(ponto.variacaoSafraAnteriorPct)} (B); limiar de ${faixa.fmt(parametros.limiarNivelPct, 1)}% → ${NOME[d.porNivel]}.`
  );
  passos.push(
    ponto.acumuladaPct === null
      ? "Revisão acumulada: sem a 1ª estimativa da safra na base → sem direção pela revisão."
      : `Revisão acumulada contra a 1ª estimativa: ${pct(ponto.acumuladaPct)}; a regra pede ${faixa.fmt(parametros.limiarRevisaoPct, 1)}% ` +
          `ou mais em ${parametros.levantamentosSeguidos} levantamentos seguidos → ${NOME[d.porRevisao]}.`
  );
  passos.push(
    "Fora da conta: o alerta agroclimático da regra do especialista (o VHI de MT e do PR vai só como contexto, ADR 0070; a geada chega pelos eventos do INMET) e o plantio na janela."
  );
  if (d.conflito) passos.push("Combinação: nível e revisão em sentidos opostos → Neutra.");
  else if (d.vies) passos.push(`Combinação: abaixo dos limiares, mas revisada para cima (${pct(ponto.revisaoPct)}) → viés de baixa, fraco.`);
  else passos.push(`Direção: ${faixa.ROTULOS.direcao[d.direcao]}, intensidade ${faixa.ROTULOS.intensidade[d.intensidade].toLowerCase()}.`);
  passos.push(`Peso do mês na proposta do especialista: ${ponto.pesoDoMes} (não entra na conta).`);
  return passos;
}

const EPISODIOS = [
  { data: "2026-02-12", rotulo: "5º levantamento de 2025/26, contra o de 2024/25 (que vinha baixo)" },
  { data: "2026-06-11", rotulo: "9º levantamento de 2025/26, revisada para baixo" },
  { data: "2026-09-15", rotulo: "12º levantamento de 2025/26 (o exemplo do status)" }
];
const CENARIOS = [
  { rotulo: "4% abaixo da safra anterior, revisões de -2,5% e -2,1%", variacaoSafraAnteriorPct: -4, acumuladasPct: [-2.5, -2.1], revisaoPct: -0.4 },
  { rotulo: "Na média da safra anterior, revisões de -2,2% e -2,0%", variacaoSafraAnteriorPct: 0.5, acumuladasPct: [-2.2, -2], revisaoPct: -0.2 },
  { rotulo: "5% acima da safra anterior, sem revisão acumulada", variacaoSafraAnteriorPct: 5, acumuladasPct: [0.3, 0.1], revisaoPct: 0.2 },
  { rotulo: "Na média, revisada 1% para cima (o exemplo do David)", variacaoSafraAnteriorPct: 0.1, acumuladasPct: [1.5, 0.5], revisaoPct: 1 },
  { rotulo: "4% acima da safra anterior, mas revisões de -2,5% e -2,1%", variacaoSafraAnteriorPct: 4, acumuladasPct: [-2.5, -2.1], revisaoPct: -0.4 }
];

function exemplosSafrinha(pontosTodos, parametros = PARAMETROS_PADRAO) {
  const porData = new Map(pontosTodos.map((ponto) => [ponto.observedAt, ponto]));
  return {
    episodios: EPISODIOS.map(({ data, rotulo }) => {
      const ponto = porData.get(data);
      return { data, rotulo, valor: ponto?.variacaoSafraAnteriorPct ?? null, decisao: ponto?.decisao ?? null };
    }),
    cenarios: CENARIOS.map(({ rotulo, ...entrada }) => ({
      rotulo,
      valor: entrada.variacaoSafraAnteriorPct,
      valorAnterior: null,
      decisao: decidirSafrinha(entrada, parametros)
    }))
  };
}

const APRESENTACAO = {
  unidade: "%",
  quadros: [
    { camada: "A", rotulo: "Levantamento e safra", campo: "levantamento", secundario: { prefixo: "safra", campo: "safra" } },
    {
      camada: "A",
      rotulo: "Produção da 2ª safra",
      campo: "producaoMilT",
      casas: 1,
      unidadeValor: " mil t",
      secundario: { prefixo: "revisão contra o levantamento anterior:", campo: "revisaoPct", casas: 2, sinal: true, unidadeValor: "%" }
    },
    { camada: "A", rotulo: "Área e produtividade", campo: "areaMilHa", casas: 1, unidadeValor: " mil ha", secundario: { prefixo: "produtividade de", campo: "produtividadeKgHa", casas: 0, sufixo: "kg/ha" } },
    { camada: "A", rotulo: "Revisão acumulada contra a 1ª estimativa", campo: "acumuladaPct", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Safra anterior no mesmo levantamento", campo: "producaoSafraAnteriorMilT", casas: 1, sufixo: "mil t" },
    { camada: "B", rotulo: "Variação contra a safra anterior (mesmo levantamento)", campo: "variacaoSafraAnteriorPct", casas: 2, sinal: true, unidadeValor: "%" },
    { camada: "B", rotulo: "Peso do mês na proposta do especialista (fora da conta)", campo: "pesoDoMes" },
    { camada: "B", rotulo: "Saúde da vegetação sobre o milho de MT e do PR (VHI da NOAA; contexto, fora da conta)", campo: "vhiContexto", detalhe: "vhiContextoDetalhe" }
  ],
  graficoAB: {
    titulo: "Produção da 2ª safra em cada levantamento (A) × a safra anterior no mesmo levantamento (B), em mil t",
    unidade: "mil t",
    casas: 0,
    exigeCampo: "producaoMilT",
    series: [
      { campo: "producaoMilT", rotulo: "Safra do levantamento (A)" },
      { campo: "producaoSafraAnteriorMilT", rotulo: "Safra anterior, mesmo levantamento (B)" }
    ]
  },
  graficoC: {
    titulo: "Variação contra a safra anterior no mesmo levantamento (B) e os limiares da regra (C)",
    campo: "variacaoSafraAnteriorPct",
    rotulo: "Variação contra a safra anterior (B)",
    unidade: "%",
    limiares: [
      { chave: "limiarNivelPct", sinal: 1, rotulo: "Limiar de baixa (safra maior)" },
      { chave: "limiarNivelPct", sinal: -1, rotulo: "Limiar de alta (safra menor)" }
    ]
  },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: [
    { chave: "limiarNivelPct", rotulo: "Limiar do nível", unidade: "%", explicacao: "Produção esse tanto ou mais abaixo (alta) ou acima (baixa) da safra anterior no mesmo levantamento (R-SAF v0: 3)." },
    { chave: "limiarRevisaoPct", rotulo: "Limiar da revisão acumulada", unidade: "%", explicacao: "Revisão acumulada contra a 1ª estimativa esse tanto ou mais, para baixo (alta) ou para cima (baixa) (R-SAF v0: 2)." },
    { chave: "levantamentosSeguidos", rotulo: "Levantamentos seguidos", unidade: "levantamentos", explicacao: "Em quantos levantamentos seguidos a revisão acumulada precisa passar do limiar (R-SAF v0: 2)." }
  ],
  regra:
    "pressão de alta com a produção da 2ª safra {limiarNivelPct}% ou mais abaixo da safra anterior no mesmo levantamento, ou com a revisão acumulada contra a 1ª estimativa de -{limiarRevisaoPct}% ou pior em {levantamentosSeguidos} levantamentos seguidos; de baixa com {limiarNivelPct}% ou mais acima, ou acumulada de +{limiarRevisaoPct}% ou mais em {levantamentosSeguidos} seguidos; abaixo dos limiares, uma revisão para cima dá viés de baixa fraco; forte com nível e revisão no mesmo sentido, neutra com os dois opostos; fora da conta: o alerta agroclimático da regra do especialista (o VHI de MT e do PR vai só como contexto: fica abaixo de 40 na maioria dos anos, mesmo nas safras recordes; a geada chega pelos eventos do INMET) e o plantio na janela, sem o dado",
  exemplos: { colunaValor: "Variação contra a safra anterior" },
  nota:
    "Mensal, não é tempo real: a Conab publica um levantamento por mês (o 1º em outubro, o 12º em setembro). A base tem " +
    "os levantamentos desde fev/2025 (sem mar a jun/2025 e jan/2026, que a fonte não publicou): a comparação no mesmo " +
    "levantamento e a 1ª estimativa só existem a partir da safra 2025/26."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "MENSAL",
  calcular: calcularSafrinhaMilho,
  explicar: explicarSafrinha,
  exemplos: exemplosSafrinha,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, ESTADOS_VHI, PARAMETROS_PADRAO, METODOLOGIA, numeroDoLevantamento, decidirSafrinha, derivarSafrinhaMilho, calcularSafrinhaMilho };
