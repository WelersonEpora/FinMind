"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const s = require("./modelos/soja-comum");

// FATOR F1 da soja: oferta dos EUA, a safra em formação (proposta da soja v2.2, §2.5; aprovada pelo Comitê, com o
// David, em 2026-10-08, ADR 0116). O fator lê o choque NOVO sobre a produção americana (área × produtividade).
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation):
//     USDA.SOYBEANS.AREA_PLANTED          - a área plantada (mil acres): a intenção de plantio (fim de março) e o
//                                           Acreage (fim de junho), com as versões; a final do ano anterior é revista
//                                           no Prospective seguinte (ADR 0112)
//     USDA.SOYBEANS.CONDITION.GOOD/EXCELLENT - a condição da lavoura (%), semanal (Crop Progress, ADR 0110)
//     NOAA_VH.SOJA.EUA.VHI                - a saúde da vegetação sobre a soja nos EUA, semanal (ADR 0110)
//     WASDE.SOJA.EUA.PRODUCTION           - a produção dos EUA (milhões de bushels), cada edição com as versões (ADR 0111)
//     NOAA_CPC.<estado>.TEMP/PRCP_8_14    - a previsão de 8 a 14 dias nos estados do Corn Belt, só contexto (ADR 0067)
//   fator (calculado sob demanda, NUNCA gravado), um ponto por dia em que um desses dados é publicado e no dia seguinte
//   ao fim da janela:
//     R1 (janela): da intenção de plantio da safra (Prospective Plantings) ao WASDE de janeiro do ano seguinte. Fora
//        dela, o fator não pressiona.
//     Medição (§2.5), pelas publicações:
//       - até o 1º boletim de condição da safra: ÁREA, o último relatório: a intenção contra a área final do ano anterior;
//         o Acreage contra a intenção do mesmo ano (§2.8);
//       - do 1º boletim de condição ao WASDE de agosto: ÁREA e PRODUTIVIDADE (condição boa + excelente contra a mesma
//         semana dos anos anteriores), com o VHI dos EUA como confirmação da produtividade e o CPC como contexto. No
//         mesmo lado, vale o mais intenso; em lados opostos, o de posição mais extrema, limitado a fraca;
//       - do WASDE de agosto ao de janeiro: a REVISÃO DA PRODUÇÃO no WASDE contra a edição anterior, com a condição
//         (a última da safra) como confirmação.
//     Cada medida, pela posição no próprio histórico (soja-comum.js): a área e a revisão contra as do mesmo relatório
//     nos anos anteriores; a condição e o VHI contra a mesma semana. Mais oferta (área ou produção acima, lavoura melhor)
//     pressiona para baixa. Uma confirmação no lado oposto limita a fraca.
// Propriedades: determinístico, versionado, point-in-time (cada ponto só com o que tinha sido publicado até o fim do
// dia), sem IA.

const FACTOR_ID = "oferta_eua_soja";
const FACTOR_VERSION = 1;

const SERIES = Object.freeze({
  area: "USDA.SOYBEANS.AREA_PLANTED",
  boa: "USDA.SOYBEANS.CONDITION.GOOD",
  excelente: "USDA.SOYBEANS.CONDITION.EXCELLENT",
  vhi: "NOAA_VH.SOJA.EUA.VHI",
  producao: "WASDE.SOJA.EUA.PRODUCTION"
});
// As séries que marcam as edições do WASDE: o balanço dos EUA, do mundo, do Brasil, da Argentina e da China. A observation
// só ganha linha quando o valor muda; com todas elas, toda edição tem ao menos uma (em fev/2026, nenhuma das séries dos
// EUA mudou). Numa edição sem mudança na série do fator, a revisão é zero.
const CAMPOS_EUA = ["AREA_HARVESTED", "AREA_PLANTED", "BEGINNING_STOCKS", "CRUSHINGS", "ENDING_STOCKS", "EXPORTS", "IMPORTS", "PRODUCTION", "RESIDUAL", "SEED", "SUPPLY_TOTAL", "USE_TOTAL", "YIELD"];
const CAMPOS_PAIS = ["BEGINNING_STOCKS", "DOMESTIC_CRUSH", "DOMESTIC_TOTAL", "ENDING_STOCKS", "EXPORTS", "IMPORTS", "PRODUCTION"];
const SERIES_EDICAO = Object.freeze([
  ...CAMPOS_EUA.map((c) => `WASDE.SOJA.EUA.${c}`),
  ...["WORLD", "BRAZIL", "ARGENTINA", "CHINA"].flatMap((pais) => CAMPOS_PAIS.map((c) => `WASDE.SOJA.MUNDO.${pais}.${c}`))
]);

// Os estados da previsão do CPC (os do coletor noaa-cpc, ADR 0067): só contexto.
const ESTADOS_CPC = Object.freeze([
  { codigo: "EUA_IA", nome: "Iowa" },
  { codigo: "EUA_IL", nome: "Illinois" },
  { codigo: "EUA_NE", nome: "Nebraska" },
  { codigo: "EUA_MN", nome: "Minnesota" },
  { codigo: "EUA_IN", nome: "Indiana" }
]);
const SERIES_CPC = ESTADOS_CPC.flatMap((e) => [`NOAA_CPC.${e.codigo}.TEMP_8_14`, `NOAA_CPC.${e.codigo}.PRCP_8_14`]);
// Uma previsão do CPC vale até 7 dias depois de emitida.
const DIAS_PREVISAO = 7;

const PARAMETROS_PADRAO = s.PARAMETROS_POSICAO_SOJA;
// Mais oferta pressiona para baixa.
const ACIMA = s.DIRECAO.BAIXA;

const PERIODO = {
  FORA: { codigo: "FORA", rotulo: "Fora da janela (R1): da colheita encerrada à intenção de plantio" },
  AREA: { codigo: "AREA", rotulo: "Intenção e plantio: a área" },
  AREA_PRODUTIVIDADE: { codigo: "AREA_PRODUTIVIDADE", rotulo: "Desenvolvimento e fase crítica: a área e a produtividade" },
  REVISAO: { codigo: "REVISAO", rotulo: "Enchimento, colheita e número final: a revisão da produção no WASDE" }
};

const RELATORIO_AREA = { INTENCAO: "intenção de plantio (Prospective Plantings)", ACREAGE: "área plantada (Acreage)" };

// O relatório de área pelo mês da publicação: março ou abril, a intenção; junho ou julho, o Acreage.
function tipoDoRelatorio(dia) {
  const mes = s.mesDe(dia);
  if (mes === 3 || mes === 4) return "INTENCAO";
  if (mes === 6 || mes === 7) return "ACREAGE";
  return null;
}

// Por safra: o 1º relatório de cada tipo, com a variação contra o seu baseline (§2.8). A intenção contra a área final
// do ano anterior (o que se sabia no dia da intenção, que revê o ano anterior); o Acreage contra a intenção.
function relatoriosDeArea(indice) {
  const porSafra = new Map();
  for (const [safra, versoes] of indice.get(SERIES.area) || []) {
    const ano = s.anoDe(safra);
    const relatorios = {};
    for (const v of versoes) {
      const tipo = tipoDoRelatorio(v.dia);
      if (!tipo || relatorios[tipo] || s.anoDe(v.dia) !== ano) continue;
      const base =
        tipo === "INTENCAO"
          ? s.valorEm(indice, SERIES.area, s.safraDoAno(ano - 1), v.dia)
          : s.valorEm(indice, SERIES.area, safra, v.dia, { antes: true });
      relatorios[tipo] = { tipo, dia: v.dia, em: v.em, valor: v.valor, base, variacaoPct: base ? s.arredondar((v.valor / base - 1) * 100, 2) : null };
    }
    porSafra.set(ano, relatorios);
  }
  return porSafra;
}

function gePorSemana(linhas) {
  const boa = s.semanal(linhas, SERIES.boa);
  const excelente = new Map(s.semanal(linhas, SERIES.excelente).map((x) => [x.observedAt, x]));
  return boa
    .filter((b) => excelente.has(b.observedAt))
    .map((b) => {
      const e = excelente.get(b.observedAt);
      return { observedAt: b.observedAt, dia: b.dia > e.dia ? b.dia : e.dia, em: b.em > e.em ? b.em : e.em, valor: b.valor + e.valor, estimado: b.estimado || e.estimado };
    });
}

// As emissões do CPC, da mais antiga para a mais recente: [{ data, dia, texto }].
function emissoesCpc(linhas) {
  const porData = new Map();
  for (const linha of linhas) {
    const [, estado, variavel] = linha.seriesCode.split(".");
    if (!linha.seriesCode.startsWith("NOAA_CPC.")) continue;
    const emissao = porData.get(linha.observedAt) || { data: linha.observedAt, dia: s.diaDe(linha.publishedAt), estados: new Map() };
    emissao.estados.set(estado, { ...emissao.estados.get(estado), [variavel.startsWith("TEMP") ? "temp" : "prcp"]: linha.value });
    porData.set(linha.observedAt, emissao);
  }
  const categoria = (v) => (v > 0 ? `acima (${v}%)` : v < 0 ? `abaixo (${-v}%)` : "chances iguais");
  return [...porData.values()]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((e) => ({
      data: e.data,
      dia: e.dia,
      texto:
        `previsão de 8 a 14 dias do NOAA/CPC emitida em ${s.dataBr(e.data)}: ` +
        ESTADOS_CPC.filter((x) => e.estados.get(x.codigo)?.temp !== undefined && e.estados.get(x.codigo)?.prcp !== undefined)
          .map((x) => `${x.nome}, temperatura ${categoria(e.estados.get(x.codigo).temp)} e chuva ${categoria(e.estados.get(x.codigo).prcp)}`)
          .join("; ")
    }));
}

const primeiroDiaNoMes = (dias, ano, mes) => dias.find((d) => s.anoDe(d) === ano && s.mesDe(d) === mes) || null;

// A safra cuja janela pode conter `dia`: a do ano, se a intenção dela já saiu; senão, a do ano anterior.
function safraDoDia(dia, areas) {
  const ano = s.anoDe(dia);
  const intencao = areas.get(ano)?.INTENCAO;
  return intencao && dia >= intencao.dia ? ano : ano - 1;
}

// O fim da janela da safra `ano`: o WASDE de janeiro do ano seguinte; sem ele, o fim de janeiro.
function fimDaJanela(ano, edicoes) {
  return primeiroDiaNoMes(edicoes, ano + 1, 1) || `${ano + 1}-01-31`;
}

// A janela (R1) e o período do F1 num dia. Exportado para a regra R1.
function periodoDoF1(dia, { areas, edicoes, condicoes }) {
  const ano = safraDoDia(dia, areas);
  const intencao = areas.get(ano)?.INTENCAO;
  if (!intencao || dia < intencao.dia || dia > fimDaJanela(ano, edicoes)) return { ano, periodo: PERIODO.FORA };
  const primeiraCondicao = condicoes.find((c) => s.anoDe(c.observedAt) === ano);
  const agosto = primeiroDiaNoMes(edicoes, ano, 8);
  if (!primeiraCondicao || dia < primeiraCondicao.dia) return { ano, periodo: PERIODO.AREA };
  if (!agosto || dia < agosto) return { ano, periodo: PERIODO.AREA_PRODUTIVIDADE, agosto };
  return { ano, periodo: PERIODO.REVISAO, agosto };
}

// As revisões da produção dos EUA nas edições de agosto a janeiro, por edição: [{ edicao, ano, revisaoPct }].
function revisoesDeProducao(indice, edicoes) {
  const lista = [];
  for (const edicao of edicoes) {
    const mes = s.mesDe(edicao);
    if (!(mes >= 8 || mes === 1)) continue;
    const ano = mes === 1 ? s.anoDe(edicao) - 1 : s.anoDe(edicao);
    const r = s.revisaoNaEdicao(indice, [SERIES.producao], s.safraDoAno(ano), edicao);
    if (r) lista.push({ edicao, ano, ...r });
  }
  return lista;
}

const unidadeArea = (v) => `${s.fmt(v / 1000, 2)} milhões de acres`;

// Função PURA: as linhas de obterVersoesAsOf() (área e WASDE) e de obterAsOf() (condição, VHI e CPC) -> um ponto por dia
// de publicação, com a decisão do F1. `ate`: o último dia dos pontos (o do asOf; o fim de uma janela pode cair depois).
function derivarOfertaEuaSoja({ versoes, semanais }, { parametros = PARAMETROS_PADRAO, ate = null } = {}) {
  const indice = s.indexarVersoes(versoes);
  const edicoes = s.diasDePublicacao(versoes, (l) => SERIES_EDICAO.includes(l.seriesCode));
  const areas = relatoriosDeArea(indice);
  const condicoes = gePorSemana(semanais);
  const vhis = s.semanal(semanais, SERIES.vhi);
  const cpc = emissoesCpc(semanais);
  const revisoes = revisoesDeProducao(indice, edicoes);
  const contexto = { areas, edicoes, condicoes };

  // Os dias dos pontos: as publicações de cada dado e o dia seguinte ao fim de cada janela.
  const inicio = [...areas.values()].map((r) => r.INTENCAO?.dia).filter(Boolean).sort()[0];
  if (!inicio) return [];
  const dias = new Set([
    ...[...areas.values()].flatMap((r) => [r.INTENCAO?.dia, r.ACREAGE?.dia]).filter(Boolean),
    ...edicoes,
    ...condicoes.map((c) => c.dia),
    ...vhis.map((v) => v.dia),
    ...[...areas.keys()].map((ano) => s.somarDias(fimDaJanela(ano, edicoes), 1))
  ]);
  const pontos = [];
  for (const dia of [...dias].filter((d) => d >= inicio && (!ate || d <= ate)).sort()) {
    const { ano, periodo, agosto } = periodoDoF1(dia, contexto);
    const ponto = { factorId: FACTOR_ID, factorVersion: FACTOR_VERSION, observedAt: dia, safra: s.rotuloSafra(s.safraDoAno(ano)), periodo: periodo.codigo, periodoTexto: periodo.rotulo };
    const usados = [];

    if (periodo === PERIODO.FORA) {
      Object.assign(ponto, { primarioTexto: "nenhum: fora da janela da safra (R1), o fator não pressiona", confirmacaoTexto: "-", contextoTexto: "-", leituraTexto: "fora da janela: não pressiona", posicaoDecisiva: null, limitadoPor: [] });
      ponto.decisao = s.decisaoDoPonto(null, { foraDaJanela: true });
    } else {
      // Área: o último relatório da safra até o dia.
      const relatorios = areas.get(ano) || {};
      const relatorio = [relatorios.ACREAGE, relatorios.INTENCAO].find((r) => r && r.dia <= dia) || null;
      let area = null;
      if (relatorio && relatorio.variacaoPct !== null) {
        const historico = [...areas.entries()].filter(([a]) => a < ano).map(([, r]) => r[relatorio.tipo]?.variacaoPct).filter((v) => v !== null && v !== undefined);
        const pos = s.posicaoNoHistorico(relatorio.variacaoPct, historico);
        area = { rotulo: "área", dia: relatorio.dia, posicao: pos.posicao, leitura: s.decidirPosicao(pos.posicao, parametros, ACIMA) };
        usados.push(relatorio.em);
        Object.assign(ponto, {
          areaTexto:
            `${RELATORIO_AREA[relatorio.tipo]} de ${s.dataBr(relatorio.dia)}: ${unidadeArea(relatorio.valor)}, ${s.comSinal(relatorio.variacaoPct)}% contra ` +
            `${relatorio.tipo === "INTENCAO" ? "a área final do ano anterior" : "a intenção do mesmo ano"} (${unidadeArea(relatorio.base)}); ` +
            `percentil ${s.fmt(pos.percentil)} entre as ${pos.n} variações do mesmo relatório nos anos anteriores`,
          areaPosicao: pos.posicao
        });
      }

      // Produtividade: a condição da última semana da safra, e o VHI como confirmação.
      const condicao = s.semanaAte(condicoes.filter((c) => s.anoDe(c.observedAt) === ano), dia);
      let produtividade = null;
      let leituraCondicao = null;
      if (condicao) {
        const pos = s.posicaoNaMesmaSemana(condicoes, condicao);
        leituraCondicao = { rotulo: "condição da lavoura", posicao: pos.posicao, leitura: s.decidirPosicao(pos.posicao, parametros, ACIMA) };
        Object.assign(ponto, {
          condicaoTexto: `semana de ${s.dataBr(condicao.observedAt)}: ${s.fmt(condicao.valor, 0)}% boa + excelente; percentil ${s.fmt(pos.percentil)} da mesma semana em ${pos.n} anos anteriores`,
          condicaoPosicao: pos.posicao
        });
      }
      const vhi = s.semanaAte(vhis.filter((v) => s.anoDe(v.observedAt) === ano), dia);
      let leituraVhi = null;
      if (vhi) {
        const pos = s.posicaoNaMesmaSemana(vhis, vhi);
        leituraVhi = { rotulo: "VHI dos EUA", posicao: pos.posicao, leitura: s.decidirPosicao(pos.posicao, parametros, ACIMA) };
        Object.assign(ponto, { vhiTexto: `semana de ${s.dataBr(vhi.observedAt)}: VHI ${s.fmt(vhi.valor)}; percentil ${s.fmt(pos.percentil)} da mesma semana em ${pos.n} anos anteriores`, vhiPosicao: pos.posicao });
      }

      let resultado;
      if (periodo === PERIODO.AREA) {
        resultado = area?.leitura ? { ...s.aplicarConfirmacoes(area.leitura, []), decidiu: "área", conflito: false } : null;
        Object.assign(ponto, { primarioTexto: "a área", confirmacaoTexto: "nenhuma neste período", contextoTexto: "-", posicaoDecisiva: area?.posicao ?? null });
      } else if (periodo === PERIODO.AREA_PRODUTIVIDADE) {
        if (leituraCondicao?.leitura) {
          if (condicao) usados.push(condicao.em);
          const confirmada = s.aplicarConfirmacoes(leituraCondicao.leitura, leituraVhi ? [leituraVhi] : []);
          produtividade = { rotulo: "produtividade", dia: condicao.dia, posicao: leituraCondicao.posicao, leitura: { direcao: confirmada.direcao, intensidade: confirmada.intensidade }, limitadoPor: confirmada.limitadoPor };
        }
        const combinado = s.combinarComponentes(area, produtividade);
        resultado = combinado ? { ...combinado, limitadoPor: produtividade?.limitadoPor || [] } : null;
        const previsao = cpc.findLast((e) => e.dia <= dia && s.somarDias(e.data, DIAS_PREVISAO) >= dia);
        Object.assign(ponto, {
          primarioTexto: "a área e a produtividade (condição da lavoura), dois componentes",
          confirmacaoTexto: "o VHI dos EUA confirma a produtividade",
          contextoTexto: previsao ? previsao.texto : "sem previsão do NOAA/CPC recente (a coleta começou em 2026-10-05)",
          posicaoDecisiva: resultado?.decidiu === "área" ? area.posicao : produtividade?.posicao ?? area?.posicao ?? null
        });
        if (vhi) usados.push(vhi.em);
      } else {
        // REVISAO: a última edição desde agosto.
        const edicao = s.ultimaAte(edicoes.filter((e) => e >= agosto), dia);
        const revisao = revisoes.find((r) => r.edicao === edicao) || null;
        let leituraRevisao = null;
        if (revisao) {
          const historico = revisoes.filter((r) => r.ano < ano).map((r) => r.revisaoPct);
          const pos = s.posicaoNoHistorico(revisao.revisaoPct, historico);
          leituraRevisao = s.decidirPosicao(pos.posicao, parametros, ACIMA);
          usados.push(s.versaoEm(indice, SERIES.producao, s.safraDoAno(ano), edicao)?.em);
          Object.assign(ponto, {
            producaoTexto:
              `WASDE de ${s.dataBr(edicao)}, safra ${s.rotuloSafra(s.safraDoAno(ano))}: ${s.fmt(revisao.depois, 0)} milhões de bushels, ${s.comSinal(revisao.revisaoPct)}% ` +
              `contra a edição anterior (${s.fmt(revisao.antes, 0)}); percentil ${s.fmt(pos.percentil)} entre as ${pos.n} revisões de agosto a janeiro dos anos anteriores`,
            revisaoPosicao: pos.posicao,
            posicaoDecisiva: pos.posicao
          });
        }
        if (leituraCondicao && condicao) usados.push(condicao.em);
        const confirmada = leituraRevisao ? s.aplicarConfirmacoes(leituraRevisao, leituraCondicao ? [leituraCondicao] : []) : null;
        resultado = confirmada ? { ...confirmada, decidiu: "revisão da produção", conflito: false } : null;
        Object.assign(ponto, { primarioTexto: "a revisão da produção no WASDE", confirmacaoTexto: "a condição da lavoura (a última da safra)", contextoTexto: "-" });
        if (ponto.posicaoDecisiva === undefined) ponto.posicaoDecisiva = null;
      }
      ponto.limitadoPor = resultado?.limitadoPor || [];
      ponto.conflitoComponentes = Boolean(resultado?.conflito);
      ponto.decidiu = resultado?.decidiu || null;
      ponto.decisao = s.decisaoDoPonto(resultado);
      ponto.leituraTexto = resultadoEmTexto(resultado, ponto);
    }

    const usadosValidos = usados.filter(Boolean);
    ponto.disponivelEm = usadosValidos.length ? usadosValidos.reduce((a, b) => (new Date(a) > new Date(b) ? a : b)) : `${dia}T12:00:00.000Z`;
    ponto.disponivelEmEhEstimado = false;
    pontos.push(ponto);
  }
  return pontos;
}

function resultadoEmTexto(resultado, ponto) {
  if (!resultado) return "sem leitura: o primário não tem dado ou histórico mínimo";
  const partes = [`${s.descreverLeitura(resultado)}${resultado.decidiu ? `, decidida pela ${resultado.decidiu}` : ""}`];
  if (resultado.conflito) partes.push(resultado.empate ? "área e produtividade em lados opostos e igualmente extremas: vale a publicada por último (o choque novo), limitada a fraca" : "área e produtividade em lados opostos: vale a de posição mais extrema, limitada a fraca");
  if (ponto.limitadoPor?.length) partes.push(`limitada a fraca: ${ponto.limitadoPor.join(" e ")} aponta o lado oposto`);
  return partes.join("; ");
}

async function calcularOfertaEuaSoja({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const [versoes, semanais] = await Promise.all([
    servico.obterVersoesAsOf({ seriesCodes: [SERIES.area, ...SERIES_EDICAO], asOf }, deps),
    servico.obterAsOf({ seriesCodes: [SERIES.boa, SERIES.excelente, SERIES.vhi, ...SERIES_CPC], asOf }, deps)
  ]);
  return derivarOfertaEuaSoja({ versoes, semanais }, { parametros, ate: s.diaDe(asOf) });
}

// --- Camada C: explicação e exemplos ------------------------------------------------------------------------------

function explicarOfertaEuaSoja(ponto) {
  if (!ponto?.decisao) return [];
  const passos = [`Período (R1): ${ponto.periodoTexto}; safra ${ponto.safra}.`];
  if (ponto.decisao.foraDaJanela) return [...passos, "Fora da janela: o fator não pressiona → Neutra."];
  passos.push(`Primário: ${ponto.primarioTexto}. Confirmação: ${ponto.confirmacaoTexto}.`);
  if (ponto.areaTexto) passos.push(`Área: ${ponto.areaTexto}.`);
  if (ponto.condicaoTexto) passos.push(`Condição: ${ponto.condicaoTexto}.`);
  if (ponto.vhiTexto) passos.push(`VHI: ${ponto.vhiTexto}.`);
  if (ponto.producaoTexto) passos.push(`Produção: ${ponto.producaoTexto}.`);
  passos.push(`Leitura: ${ponto.leituraTexto}.`);
  return passos;
}

const EPISODIOS = [
  { data: "2012-08-10", rotulo: "Seca de 2012 no Meio-Oeste (WASDE de agosto)" },
  { data: "2019-06-30", rotulo: "Plantio atrasado pelas chuvas de 2019 (Acreage)" },
  { data: "2023-06-30", rotulo: "Acreage de 2023, área bem abaixo da intenção" },
  { data: "2025-07-27", rotulo: "Safra de 2025 em julho" }
];

function exemplosOfertaEuaSoja(pontos) {
  return s.exemplosPorData(pontos, EPISODIOS, "posicaoDecisiva");
}

const APRESENTACAO = {
  unidade: "pontos",
  quadros: [
    { camada: "A", rotulo: "Período da safra (R1)", campo: "periodoTexto" },
    { camada: "A", rotulo: "Área plantada", campo: "areaTexto" },
    { camada: "A", rotulo: "Condição da lavoura", campo: "condicaoTexto" },
    { camada: "A", rotulo: "Saúde da vegetação (VHI)", campo: "vhiTexto" },
    { camada: "A", rotulo: "Produção no WASDE", campo: "producaoTexto" },
    { camada: "B", rotulo: "Primário do período", campo: "primarioTexto" },
    { camada: "B", rotulo: "Confirmação", campo: "confirmacaoTexto" },
    { camada: "B", rotulo: "Contexto", campo: "contextoTexto" },
    { camada: "B", rotulo: "Leitura pela medição", campo: "leituraTexto" }
  ],
  graficoAB: {
    titulo: "Posição de cada medida no próprio histórico (percentil - 50)",
    unidade: "pontos",
    casas: 1,
    exigeCampo: "periodo",
    series: [
      { campo: "areaPosicao", rotulo: "Área" },
      { campo: "condicaoPosicao", rotulo: "Condição da lavoura" },
      { campo: "vhiPosicao", rotulo: "VHI" },
      { campo: "revisaoPosicao", rotulo: "Revisão da produção" }
    ]
  },
  graficoC: { titulo: "Posição do primário que decidiu (B) e as faixas da decisão (C)", campo: "posicaoDecisiva", rotulo: "Posição do primário", unidade: "pontos" },
  rotulosDecisao: s.ROTULOS_DECISAO,
  parametros: s.DESCRITORES_PARAMETROS,
  semTendencia: true,
  regra: `${s.REGRA_POSICAO}; mais oferta (área ou produção acima, lavoura melhor que a da mesma semana) pressiona para baixa; o primário muda pelas publicações (área até a 1ª condição; área e produtividade até o WASDE de agosto, no mesmo lado vale o mais intenso, em lados opostos o mais extremo limitado a fraca; depois, a revisão da produção); a confirmação no lado oposto limita a fraca; fora da janela (R1), neutra`,
  exemplos: { colunaValor: "Posição do primário (pontos)" },
  nota:
    "Um ponto por publicação, não é tempo real: a área sai no fim de março e no fim de junho, a condição toda segunda (temporada de junho a outubro), o VHI toda semana e o WASDE por volta do dia 10. Fora da janela da safra, o fator não pressiona."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "PUBLICACAO",
  calcular: calcularOfertaEuaSoja,
  explicar: explicarOfertaEuaSoja,
  exemplos: exemplosOfertaEuaSoja,
  apresentacao: APRESENTACAO
};

module.exports = {
  FACTOR_ID,
  FACTOR_VERSION,
  SERIES,
  SERIES_EDICAO,
  PERIODO,
  PARAMETROS_PADRAO,
  METODOLOGIA,
  relatoriosDeArea,
  gePorSemana,
  periodoDoF1,
  fimDaJanela,
  derivarOfertaEuaSoja,
  calcularOfertaEuaSoja
};
