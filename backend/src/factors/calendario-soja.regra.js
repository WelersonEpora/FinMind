"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const s = require("./modelos/soja-comum");
const f1 = require("./oferta-eua-soja.factor");
const f2 = require("./oferta-america-sul-soja.factor");

// REGRA R1 da soja: o calendário da safra (proposta da soja v2.2, §2.4 e §2.6; aprovada pelo Comitê, com o David, em
// 2026-10-08, ADR 0116). Regra de APLICABILIDADE: diz em que fase está a cultura em cada país e se o F1 e o F2 estão na
// janela; fora dela, o fator não pressiona. Sem peso e sem direção.
//
//   EUA: a fase pelo Crop Progress (plantado, florescendo, formando vagens, colhido) na semana mais recente do ano, até 14
//        dias antes; sem boletim recente, pelo calendário da §2.4. A janela do F1: da intenção de plantio ao WASDE de
//        janeiro (oferta-eua-soja.factor.js::periodoDoF1).
//   Brasil e Argentina: o calendário fixo da §2.4 (o andamento semanal da Conab não é coletado). A janela do F2: de 1º de
//        novembro a 30 de junho.
// Um ponto por dia em que o Crop Progress, a área ou o WASDE é publicado, no 1º dia de cada mês e no dia seguinte ao fim
// da janela do F1. Determinístico, point-in-time, sem IA.

const FACTOR_ID = "calendario_soja";
const FACTOR_VERSION = 1;

const SERIES_PROGRESSO = Object.freeze({
  plantado: "USDA.SOYBEANS.PROGRESS.PLANTED",
  florescendo: "USDA.SOYBEANS.PROGRESS.BLOOMING",
  vagens: "USDA.SOYBEANS.PROGRESS.SETTING_PODS",
  colhido: "USDA.SOYBEANS.PROGRESS.HARVESTED"
});
const DIAS_BOLETIM_RECENTE = 14;

// O calendário da §2.4, mês a mês (1 a 12). Os meses de duas fases dizem as duas.
const CALENDARIO = {
  EUA: ["entressafra", "entressafra", "intenção de plantio", "intenção e plantio", "plantio", "plantio e área", "fase crítica (floração e enchimento)", "fase crítica (floração e enchimento)", "colheita", "colheita", "colheita", "entressafra"],
  BRASIL: ["fase crítica e início da colheita", "fase crítica e colheita", "colheita", "colheita", "entressafra", "entressafra", "entressafra", "entressafra", "plantio", "plantio", "plantio", "plantio e início da fase crítica"],
  ARGENTINA: ["fim do plantio e fase crítica", "fase crítica", "fase crítica e início da colheita", "colheita", "colheita", "colheita", "entressafra", "entressafra", "entressafra", "plantio", "plantio", "plantio"]
};

const PARAMETROS_PADRAO = Object.freeze({});

// A fase dos EUA num dia: o Crop Progress recente, ou o calendário.
function faseEua(progresso, dia) {
  const ano = s.anoDe(dia);
  const desde = s.somarDias(dia, -DIAS_BOLETIM_RECENTE);
  const ultimo = (campo) => s.semanaAte(progresso[campo].filter((p) => s.anoDe(p.observedAt) === ano), dia, { desde });
  const [plantado, florescendo, vagens, colhido] = ["plantado", "florescendo", "vagens", "colhido"].map(ultimo);
  if (colhido && colhido.valor > 0) return { fase: `colheita (${s.fmt(colhido.valor, 0)}% colhido em ${s.dataBr(colhido.observedAt)})`, fonte: "Crop Progress", em: colhido.em };
  if (florescendo && florescendo.valor > 0) {
    return {
      fase: `fase crítica: ${s.fmt(florescendo.valor, 0)}% em floração${vagens ? ` e ${s.fmt(vagens.valor, 0)}% formando vagens` : ""} em ${s.dataBr(florescendo.observedAt)}`,
      fonte: "Crop Progress",
      em: florescendo.em
    };
  }
  if (plantado && plantado.valor > 0) return { fase: `plantio (${s.fmt(plantado.valor, 0)}% plantado em ${s.dataBr(plantado.observedAt)})`, fonte: "Crop Progress", em: plantado.em };
  return { fase: CALENDARIO.EUA[s.mesDe(dia) - 1], fonte: "calendário", em: null };
}

const ESTADOS = {
  F1_F2: { codigo: "F1_F2", rotulo: "F1 e F2 na janela" },
  F1: { codigo: "F1", rotulo: "Só o F1 na janela" },
  F2: { codigo: "F2", rotulo: "Só o F2 na janela" },
  NENHUM: { codigo: "NENHUM", rotulo: "F1 e F2 fora da janela" }
};

// Função PURA: as versões (área e WASDE) e as séries semanais (condição e progresso) -> um ponto por dia. `ate`: o último
// dia dos pontos.
function derivarCalendarioSoja({ versoes, semanais }, { ate = null } = {}) {
  const indice = s.indexarVersoes(versoes);
  const edicoes = s.diasDePublicacao(versoes, (l) => l.seriesCode.startsWith("WASDE."));
  const areas = f1.relatoriosDeArea(indice);
  const condicoes = f1.gePorSemana(semanais);
  const progresso = Object.fromEntries(Object.entries(SERIES_PROGRESSO).map(([campo, serie]) => [campo, s.semanal(semanais, serie)]));
  const contexto = { areas, edicoes, condicoes };

  const inicio = [...areas.values()].map((r) => r.INTENCAO?.dia).filter(Boolean).sort()[0];
  if (!inicio) return [];
  const anos = [...new Set([...areas.keys()])];
  const primeiros = [];
  for (let a = s.anoDe(inicio); a <= s.anoDe(ate || inicio) + 1; a += 1) for (let m = 1; m <= 12; m += 1) primeiros.push(`${a}-${String(m).padStart(2, "0")}-01`);
  const dias = new Set([
    ...primeiros,
    ...edicoes,
    ...[...areas.values()].flatMap((r) => [r.INTENCAO?.dia, r.ACREAGE?.dia]).filter(Boolean),
    ...Object.values(progresso).flatMap((lista) => lista.map((p) => p.dia)),
    ...anos.map((ano) => s.somarDias(f1.fimDaJanela(ano, edicoes), 1))
  ]);

  return [...dias]
    .filter((d) => d >= inicio && (!ate || d <= ate))
    .sort()
    .map((dia) => {
      const doF1 = f1.periodoDoF1(dia, contexto);
      const doF2 = f2.periodoDoF2(dia);
      const f1Janela = doF1.periodo.codigo !== "FORA";
      const f2Janela = doF2.periodo.codigo !== "FORA";
      const estado = f1Janela && f2Janela ? ESTADOS.F1_F2 : f1Janela ? ESTADOS.F1 : f2Janela ? ESTADOS.F2 : ESTADOS.NENHUM;
      const eua = faseEua(progresso, dia);
      const mes = s.mesDe(dia);
      return {
        factorId: FACTOR_ID,
        factorVersion: FACTOR_VERSION,
        observedAt: dia,
        euaTexto: `${eua.fase} (${eua.fonte})`,
        brasilTexto: `${CALENDARIO.BRASIL[mes - 1]} (calendário)`,
        argentinaTexto: `${CALENDARIO.ARGENTINA[mes - 1]} (calendário)`,
        f1Texto: f1Janela ? `na janela, safra ${s.rotuloSafra(s.safraDoAno(doF1.ano))}: ${doF1.periodo.rotulo}` : "fora da janela: da colheita encerrada (WASDE de janeiro) à intenção de plantio",
        f2Texto: f2Janela ? `na janela, safra ${s.rotuloSafra(s.safraDoAno(doF2.ano))}: ${doF2.periodo.rotulo}` : "fora da janela: de julho a outubro",
        fatoresNaJanela: (f1Janela ? 1 : 0) + (f2Janela ? 1 : 0),
        estado: { codigo: estado.codigo, rotulo: estado.rotulo },
        estadoTexto: `${estado.rotulo}. F1: ${f1Janela ? "na janela" : "fora"}; F2: ${f2Janela ? "na janela" : "fora"}. F3 e F4 valem o ano todo.`,
        efeitoTexto: "aplicabilidade: um fator fora da janela não pressiona em nenhum horizonte (cai para relevância baixa ou nula); a fase escolhe o observável primário de F1 e F2",
        decisao: null,
        disponivelEm: eua.em || `${dia}T12:00:00.000Z`,
        disponivelEmEhEstimado: false
      };
    });
}

async function calcularCalendarioSoja({ asOf }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const [versoes, semanais] = await Promise.all([
    servico.obterVersoesAsOf({ seriesCodes: [f1.SERIES.area, ...f1.SERIES_EDICAO], asOf }, deps),
    servico.obterAsOf({ seriesCodes: [f1.SERIES.boa, f1.SERIES.excelente, ...Object.values(SERIES_PROGRESSO)], asOf }, deps)
  ]);
  return derivarCalendarioSoja({ versoes, semanais }, { ate: s.diaDe(asOf) });
}

function explicarCalendarioSoja(ponto) {
  if (!ponto?.estado) return [];
  return [
    `EUA: ${ponto.euaTexto}. Brasil: ${ponto.brasilTexto}. Argentina: ${ponto.argentinaTexto}.`,
    `F1 (oferta dos EUA): ${ponto.f1Texto}.`,
    `F2 (oferta da América do Sul): ${ponto.f2Texto}.`,
    `Estado: ${ponto.estadoTexto}`
  ];
}

const EPISODIOS = [
  { data: "2026-02-15", rotulo: "Fevereiro: fase crítica na América do Sul" },
  { data: "2026-07-20", rotulo: "Julho: fase crítica nos EUA" },
  { data: "2026-11-15", rotulo: "Novembro: colheita nos EUA, plantio no Brasil" }
];

function exemplosCalendarioSoja(pontos) {
  return s.exemplosPorData(pontos, EPISODIOS, "fatoresNaJanela");
}

const APRESENTACAO = {
  unidade: "fatores",
  quadros: [
    { camada: "A", rotulo: "Fase nos EUA", campo: "euaTexto" },
    { camada: "A", rotulo: "Fase no Brasil", campo: "brasilTexto" },
    { camada: "A", rotulo: "Fase na Argentina", campo: "argentinaTexto" },
    { camada: "B", rotulo: "Janela do F1 (oferta dos EUA)", campo: "f1Texto" },
    { camada: "B", rotulo: "Janela do F2 (oferta da América do Sul)", campo: "f2Texto" }
  ],
  graficoAB: {
    titulo: "Fatores de oferta na janela da safra (0, 1 ou 2)",
    unidade: "fatores",
    casas: 0,
    exigeCampo: "fatoresNaJanela",
    series: [{ campo: "fatoresNaJanela", rotulo: "F1 e F2 na janela" }]
  },
  graficoC: { titulo: "Fatores de oferta na janela", campo: "fatoresNaJanela", rotulo: "Na janela", unidade: "fatores", limiares: [] },
  rotulosDecisao: s.ROTULOS_DECISAO,
  parametros: [],
  semTendencia: true,
  regra:
    "a fase de cada país (EUA pelo Crop Progress, Brasil e Argentina pelo calendário da proposta) e a janela de cada fator de oferta: o F1 da intenção de plantio ao WASDE de janeiro; o F2 de 1º de novembro a 30 de junho; fora da janela, o fator não pressiona",
  exemplos: { colunaValor: "Fatores na janela" },
  nota: "Muda pelas publicações (Crop Progress, área, WASDE) e pelo calendário. Não tem peso nem direção: diz quando F1 e F2 se aplicam."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "PUBLICACAO",
  calcular: calcularCalendarioSoja,
  explicar: explicarCalendarioSoja,
  exemplos: exemplosCalendarioSoja,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, CALENDARIO, METODOLOGIA, faseEua, derivarCalendarioSoja, calcularCalendarioSoja };
