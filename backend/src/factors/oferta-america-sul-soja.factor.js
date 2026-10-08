"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const s = require("./modelos/soja-comum");

// FATOR F2 da soja: oferta da América do Sul, a safra concorrente (proposta da soja v2.2, §2.5; aprovada pelo Comitê,
// com o David, em 2026-10-08, ADR 0116). Brasil e Argentina somam mais da metade da exportação mundial: a safra deles
// disputa a demanda com a americana e move Chicago. O fator lê o choque NOVO na produção somada dos dois.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation):
//     WASDE.SOJA.MUNDO.BRAZIL/ARGENTINA.PRODUCTION - a produção (milhões de t), cada edição com as versões (ADR 0111)
//     CONAB.SOJA.BRASIL.PRODUCAO_TOTAL             - a produção do Brasil (mil t), cada levantamento (ADR 0114)
//     NOAA_VH.SOJA.<BRASIL|ARGENTINA>.VHI           - a saúde da vegetação sobre a soja, semanal (ADR 0110); as UFs e as
//                                                    províncias, só contexto
//   fator (calculado sob demanda, NUNCA gravado), um ponto por dia de publicação e nas trocas de período:
//     R1 (janela): de 1º de novembro a 30 de junho, a safra plantada no ano de novembro. Fora dela, não pressiona.
//     Medição (§2.5):
//       - novembro e de abril a junho: a REVISÃO da produção de Brasil + Argentina no WASDE contra a edição anterior,
//         com a revisão da Conab (Brasil) como confirmação;
//       - de dezembro a março: o VHI no percentil da mesma semana dos anos anteriores (dezembro, o Brasil; janeiro e
//         fevereiro, Brasil e Argentina ponderados pela produção da safra anterior no WASDE; março, a Argentina), com o
//         WASDE e a Conab como confirmação e as UFs e as províncias como contexto.
//     Cada medida pela posição no próprio histórico (soja-comum.js). Mais oferta pressiona para baixa; uma confirmação
//     no lado oposto limita a fraca.
// Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "oferta_america_sul_soja";
const FACTOR_VERSION = 1;

const SERIES = Object.freeze({
  brasil: "WASDE.SOJA.MUNDO.BRAZIL.PRODUCTION",
  argentina: "WASDE.SOJA.MUNDO.ARGENTINA.PRODUCTION",
  conab: "CONAB.SOJA.BRASIL.PRODUCAO_TOTAL",
  vhiBrasil: "NOAA_VH.SOJA.BRASIL.VHI",
  vhiArgentina: "NOAA_VH.SOJA.ARGENTINA.VHI"
});
// As séries que marcam os dias das edições do WASDE (as do F1) e dos levantamentos da Conab.
const { SERIES_EDICAO } = require("./oferta-eua-soja.factor");
const SERIES_LEVANTAMENTO = Object.freeze(["CONAB.SOJA.BRASIL.AREA_TOTAL", "CONAB.SOJA.BRASIL.PRODUTIVIDADE_TOTAL", "CONAB.SOJA.BALANCO.ESTOQUE_FINAL"]);
// As regiões de contexto do VHI (as do card, ADR 0110).
const REGIOES_CONTEXTO = Object.freeze([
  { codigo: "BR_MT", nome: "MT" },
  { codigo: "BR_PR", nome: "PR" },
  { codigo: "BR_RS", nome: "RS" },
  { codigo: "BR_GO", nome: "GO" },
  { codigo: "AR_BUENOS_AIRES", nome: "Buenos Aires" },
  { codigo: "AR_CORDOBA", nome: "Córdoba" },
  { codigo: "AR_SANTA_FE", nome: "Santa Fe" }
]);
const serieVhiRegiao = (codigo) => `NOAA_VH.SOJA.${codigo}.VHI`;
// Uma semana do VHI vale como a "semana atual" até 21 dias depois dela (a NOAA publica com atraso).
const DIAS_VHI_RECENTE = 21;

const PARAMETROS_PADRAO = s.PARAMETROS_POSICAO_SOJA;
const ACIMA = s.DIRECAO.BAIXA;

const PERIODO = {
  FORA: { codigo: "FORA", rotulo: "Fora da janela (R1): de julho a outubro" },
  PLANTIO: { codigo: "PLANTIO", rotulo: "Plantio no Brasil (novembro): a revisão do WASDE" },
  FASE_CRITICA: { codigo: "FASE_CRITICA", rotulo: "Fase crítica (dezembro a março): a saúde da vegetação" },
  COLHEITA: { codigo: "COLHEITA", rotulo: "Colheita (abril a junho): a revisão do WASDE" }
};

// O período e a safra (o ano do plantio) de um dia.
function periodoDoF2(dia) {
  const mes = s.mesDe(dia);
  const ano = s.anoDe(dia);
  if (mes >= 7 && mes <= 10) return { ano, periodo: PERIODO.FORA };
  if (mes === 11) return { ano, periodo: PERIODO.PLANTIO };
  if (mes === 12) return { ano, periodo: PERIODO.FASE_CRITICA };
  if (mes <= 3) return { ano: ano - 1, periodo: PERIODO.FASE_CRITICA };
  return { ano: ano - 1, periodo: PERIODO.COLHEITA };
}

// Os países do VHI no mês: dezembro, o Brasil; janeiro e fevereiro, os dois; março, a Argentina.
function paisesDoVhi(dia) {
  const mes = s.mesDe(dia);
  if (mes === 12) return ["BRASIL"];
  if (mes === 1 || mes === 2) return ["BRASIL", "ARGENTINA"];
  if (mes === 3) return ["ARGENTINA"];
  return [];
}

// A safra em foco numa edição (o mesmo critério do período): o ano do plantio da safra sul-americana do mês da edição.
const anoDaEdicao = (edicao) => periodoDoF2(edicao).ano;

// As revisões de Brasil + Argentina em cada edição da janela (novembro a junho), na safra em foco.
function revisoesWasde(indice, edicoes) {
  return edicoes
    .filter((e) => periodoDoF2(e).periodo !== PERIODO.FORA)
    .map((edicao) => ({ edicao, ano: anoDaEdicao(edicao), ...s.revisaoNaEdicao(indice, [SERIES.brasil, SERIES.argentina], s.safraDoAno(anoDaEdicao(edicao)), edicao) }))
    .filter((r) => r.revisaoPct !== undefined && r.revisaoPct !== null);
}

// As revisões da Conab: cada levantamento contra o anterior, na safra mais nova dele.
function revisoesConab(indice, levantamentos) {
  const lista = [];
  for (const dia of levantamentos) {
    const safras = [...(indice.get(SERIES.conab)?.keys() || [])].filter((safra) => s.versaoEm(indice, SERIES.conab, safra, dia)).sort();
    const safra = safras.at(-1);
    if (!safra) continue;
    const r = s.revisaoNaEdicao(indice, [SERIES.conab], safra, dia);
    if (r) lista.push({ dia, safra, ...r });
  }
  return lista;
}

const mt = (v) => s.fmt(v, 1);

// Função PURA: as versões (WASDE e Conab) e as séries semanais (VHI) -> um ponto por dia de publicação e de troca de
// período, com a decisão do F2. `ate`: o último dia dos pontos.
function derivarOfertaAmericaSulSoja({ versoes, semanais }, { parametros = PARAMETROS_PADRAO, ate = null } = {}) {
  const indice = s.indexarVersoes(versoes);
  // Todas as edições e todos os levantamentos (numa edição sem mudança na América do Sul, a revisão é zero, não a da
  // edição anterior): as séries que mudam em toda edição marcam o dia.
  const edicoes = s.diasDePublicacao(versoes, (l) => l.seriesCode.startsWith("WASDE."));
  const levantamentos = s.diasDePublicacao(versoes, (l) => l.seriesCode.startsWith("CONAB."));
  const vhi = { BRASIL: s.semanal(semanais, SERIES.vhiBrasil), ARGENTINA: s.semanal(semanais, SERIES.vhiArgentina) };
  const regioes = new Map(REGIOES_CONTEXTO.map((r) => [r.codigo, s.semanal(semanais, serieVhiRegiao(r.codigo))]));
  const revWasde = revisoesWasde(indice, edicoes);
  const revConab = revisoesConab(indice, levantamentos);

  const inicio = edicoes[0];
  if (!inicio) return [];
  const anos = [];
  for (let a = s.anoDe(inicio); a <= s.anoDe(ate || "9999-12-31") && a <= 2100; a += 1) anos.push(a);
  const trocas = anos.flatMap((a) => [`${a}-11-01`, `${a}-12-01`, `${a}-01-01`, `${a}-03-01`, `${a}-04-01`, `${a}-07-01`]);
  const dias = new Set([...edicoes, ...levantamentos, ...vhi.BRASIL.map((v) => v.dia), ...vhi.ARGENTINA.map((v) => v.dia), ...trocas]);

  const pontos = [];
  for (const dia of [...dias].filter((d) => d >= inicio && (!ate || d <= ate)).sort()) {
    const { ano, periodo } = periodoDoF2(dia);
    const safra = s.safraDoAno(ano);
    const ponto = { factorId: FACTOR_ID, factorVersion: FACTOR_VERSION, observedAt: dia, safra: s.rotuloSafra(safra), periodo: periodo.codigo, periodoTexto: periodo.rotulo };
    const usados = [];

    if (periodo === PERIODO.FORA) {
      Object.assign(ponto, { primarioTexto: "nenhum: fora da janela (R1), o fator não pressiona", confirmacaoTexto: "-", contextoTexto: "-", leituraTexto: "fora da janela: não pressiona", posicaoDecisiva: null, limitadoPor: [] });
      ponto.decisao = s.decisaoDoPonto(null, { foraDaJanela: true });
    } else {
      // WASDE: a revisão de Brasil + Argentina na última edição até o dia, se for da safra em foco.
      const edicao = s.ultimaAte(edicoes, dia);
      const rw = revWasde.find((r) => r.edicao === edicao && r.ano === ano) || null;
      let wasde = null;
      if (rw) {
        const pos = s.posicaoNoHistorico(rw.revisaoPct, revWasde.filter((r) => r.ano < ano).map((r) => r.revisaoPct));
        wasde = { rotulo: "a revisão do WASDE", posicao: pos.posicao, leitura: s.decidirPosicao(pos.posicao, parametros, ACIMA) };
        usados.push(s.versaoEm(indice, SERIES.brasil, safra, edicao)?.em);
        Object.assign(ponto, {
          wasdeTexto:
            `WASDE de ${s.dataBr(edicao)}, safra ${s.rotuloSafra(safra)}: Brasil + Argentina ${mt(rw.depois)} milhões de t, ${s.comSinal(rw.revisaoPct)}% contra a edição anterior ` +
            `(${mt(rw.antes)}); percentil ${s.fmt(pos.percentil)} entre as ${pos.n} revisões de novembro a junho dos anos anteriores`,
          wasdePosicao: pos.posicao
        });
      }
      // Conab: a revisão do último levantamento até o dia, se for da safra em foco.
      const levantamento = s.ultimaAte(levantamentos, dia);
      const rc = revConab.find((r) => r.dia === levantamento && r.safra === safra) || null;
      let conab = null;
      if (rc) {
        const pos = s.posicaoNoHistorico(rc.revisaoPct, revConab.filter((r) => r.dia < rc.dia).map((r) => r.revisaoPct));
        conab = { rotulo: "a revisão da Conab", posicao: pos.posicao, leitura: s.decidirPosicao(pos.posicao, parametros, ACIMA) };
        Object.assign(ponto, {
          conabTexto:
            `Conab de ${s.dataBr(rc.dia)}: Brasil ${mt(rc.depois / 1000)} milhões de t, ${s.comSinal(rc.revisaoPct)}% contra o levantamento anterior; ` +
            (pos.percentil === null ? `sem histórico mínimo de revisões (${pos.n} de ${s.MINIMO_HISTORICO})` : `percentil ${s.fmt(pos.percentil)} entre ${pos.n} revisões anteriores`),
          conabPosicao: pos.posicao
        });
      }

      let primaria = null;
      let confirmacoes = [];
      if (periodo === PERIODO.FASE_CRITICA) {
        const vhiPaises = paisesDoVhi(dia).map((pais) => {
          const semana = s.semanaAte(vhi[pais], dia, { desde: s.somarDias(dia, -DIAS_VHI_RECENTE) });
          if (!semana) return null;
          const pos = s.posicaoNaMesmaSemana(vhi[pais], semana);
          const peso = s.valorEm(indice, pais === "BRASIL" ? SERIES.brasil : SERIES.argentina, s.safraDoAno(ano - 1), dia);
          usados.push(semana.em);
          return { pais, semana, pos, peso };
        });
        const validos = vhiPaises.filter((v) => v && v.pos.posicao !== null && v.peso);
        const faltando = vhiPaises.length !== validos.length;
        if (validos.length && !faltando) {
          const total = validos.reduce((soma, v) => soma + v.peso, 0);
          const posicao = s.arredondar(validos.reduce((soma, v) => soma + v.pos.posicao * v.peso, 0) / total, 1);
          primaria = { posicao, leitura: s.decidirPosicao(posicao, parametros, ACIMA) };
        }
        ponto.vhiTexto =
          vhiPaises
            .map((v, i) =>
              v
                ? `${v.pais === "BRASIL" ? "Brasil" : "Argentina"}, semana de ${s.dataBr(v.semana.observedAt)}: VHI ${s.fmt(v.semana.valor)}, percentil ${s.fmt(v.pos.percentil)} da mesma semana em ${v.pos.n} anos` +
                  (vhiPaises.length > 1 && v.peso ? ` (peso ${s.fmt(v.peso, 1)} milhões de t, a produção da safra anterior)` : "")
                : `${paisesDoVhi(dia)[i] === "BRASIL" ? "Brasil" : "Argentina"}: sem VHI recente`
            )
            .join("; ") + (faltando ? " — sem um dos países, o primário fica sem leitura" : "");
        ponto.vhiPosicao = primaria?.posicao ?? null;
        confirmacoes = [wasde, conab].filter(Boolean);
        const contexto = REGIOES_CONTEXTO.map((r) => {
          const semana = s.semanaAte(regioes.get(r.codigo), dia, { desde: s.somarDias(dia, -DIAS_VHI_RECENTE) });
          if (!semana) return null;
          const pos = s.posicaoNaMesmaSemana(regioes.get(r.codigo), semana);
          return pos.percentil === null ? null : `${r.nome} ${s.fmt(pos.percentil, 0)}`;
        }).filter(Boolean);
        Object.assign(ponto, {
          primarioTexto: `o VHI (${paisesDoVhi(dia).map((p) => (p === "BRASIL" ? "Brasil" : "Argentina")).join(" e ")})`,
          confirmacaoTexto: "a revisão do WASDE (Brasil + Argentina) e a da Conab (Brasil)",
          contextoTexto: contexto.length ? `VHI por região, percentil da mesma semana: ${contexto.join("; ")}` : "-"
        });
      } else {
        primaria = wasde ? { posicao: wasde.posicao, leitura: wasde.leitura } : null;
        confirmacoes = [conab].filter(Boolean);
        Object.assign(ponto, { primarioTexto: "a revisão da produção de Brasil + Argentina no WASDE", confirmacaoTexto: "a revisão da Conab (Brasil)", contextoTexto: "-" });
      }

      const resultado = primaria?.leitura ? s.aplicarConfirmacoes(primaria.leitura, confirmacoes) : null;
      ponto.posicaoDecisiva = primaria?.posicao ?? null;
      ponto.limitadoPor = resultado?.limitadoPor || [];
      ponto.decisao = s.decisaoDoPonto(resultado);
      ponto.leituraTexto = !resultado
        ? "sem leitura: o primário não tem dado ou histórico mínimo"
        : `${s.descreverLeitura(resultado)}${ponto.limitadoPor.length ? `; limitada a fraca: ${ponto.limitadoPor.join(" e ")} aponta o lado oposto` : ""}`;
    }

    const usadosValidos = usados.filter(Boolean);
    ponto.disponivelEm = usadosValidos.length ? usadosValidos.reduce((a, b) => (new Date(a) > new Date(b) ? a : b)) : `${dia}T12:00:00.000Z`;
    ponto.disponivelEmEhEstimado = false;
    pontos.push(ponto);
  }
  return pontos;
}

async function calcularOfertaAmericaSulSoja({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const [versoes, semanais] = await Promise.all([
    servico.obterVersoesAsOf({ seriesCodes: [SERIES.brasil, SERIES.argentina, SERIES.conab, ...SERIES_EDICAO, ...SERIES_LEVANTAMENTO], asOf }, deps),
    servico.obterAsOf({ seriesCodes: [SERIES.vhiBrasil, SERIES.vhiArgentina, ...REGIOES_CONTEXTO.map((r) => serieVhiRegiao(r.codigo))], asOf }, deps)
  ]);
  return derivarOfertaAmericaSulSoja({ versoes, semanais }, { parametros, ate: s.diaDe(asOf) });
}

// --- Camada C: explicação e exemplos ------------------------------------------------------------------------------

function explicarOfertaAmericaSulSoja(ponto) {
  if (!ponto?.decisao) return [];
  const passos = [`Período (R1): ${ponto.periodoTexto}; safra ${ponto.safra}.`];
  if (ponto.decisao.foraDaJanela) return [...passos, "Fora da janela: o fator não pressiona → Neutra."];
  passos.push(`Primário: ${ponto.primarioTexto}. Confirmação: ${ponto.confirmacaoTexto}.`);
  if (ponto.vhiTexto) passos.push(`VHI: ${ponto.vhiTexto}.`);
  if (ponto.wasdeTexto) passos.push(`WASDE: ${ponto.wasdeTexto}.`);
  if (ponto.conabTexto) passos.push(`Conab: ${ponto.conabTexto}.`);
  passos.push(`Leitura: ${ponto.leituraTexto}.`);
  return passos;
}

const EPISODIOS = [
  { data: "2012-02-15", rotulo: "Seca de 2011/12 no sul do Brasil e na Argentina" },
  { data: "2022-01-20", rotulo: "Seca de 2021/22 no sul do Brasil (La Niña)" },
  { data: "2023-03-15", rotulo: "Seca de 2022/23 na Argentina" },
  { data: "2026-05-20", rotulo: "Colheita da safra 2025/26" }
];

function exemplosOfertaAmericaSulSoja(pontos) {
  return s.exemplosPorData(pontos, EPISODIOS, "posicaoDecisiva");
}

const APRESENTACAO = {
  unidade: "pontos",
  quadros: [
    { camada: "A", rotulo: "Período da safra (R1)", campo: "periodoTexto" },
    { camada: "A", rotulo: "Saúde da vegetação (VHI)", campo: "vhiTexto" },
    { camada: "A", rotulo: "Produção no WASDE", campo: "wasdeTexto" },
    { camada: "A", rotulo: "Produção na Conab", campo: "conabTexto" },
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
      { campo: "vhiPosicao", rotulo: "VHI (ponderado)" },
      { campo: "wasdePosicao", rotulo: "Revisão do WASDE" },
      { campo: "conabPosicao", rotulo: "Revisão da Conab" }
    ]
  },
  graficoC: { titulo: "Posição do primário (B) e as faixas da decisão (C)", campo: "posicaoDecisiva", rotulo: "Posição do primário", unidade: "pontos" },
  rotulosDecisao: s.ROTULOS_DECISAO,
  parametros: s.DESCRITORES_PARAMETROS,
  semTendencia: true,
  regra: `${s.REGRA_POSICAO}; mais oferta (produção revista para cima, lavoura melhor que a da mesma semana) pressiona para baixa; de 1º de novembro a 30 de junho (fora disso, neutra); o primário é a revisão de Brasil + Argentina no WASDE em novembro e de abril a junho, e o VHI de dezembro a março (dezembro o Brasil, janeiro e fevereiro os dois ponderados pela produção da safra anterior, março a Argentina); a confirmação no lado oposto limita a fraca`,
  exemplos: { colunaValor: "Posição do primário (pontos)" },
  nota:
    "Um ponto por publicação, não é tempo real: o WASDE sai por volta do dia 10, a Conab no meio do mês e o VHI toda semana, com atraso. A safra é a plantada no ano de novembro. Fora da janela (julho a outubro), o fator não pressiona."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "PUBLICACAO",
  calcular: calcularOfertaAmericaSulSoja,
  explicar: explicarOfertaAmericaSulSoja,
  exemplos: exemplosOfertaAmericaSulSoja,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, PERIODO, PARAMETROS_PADRAO, METODOLOGIA, periodoDoF2, paisesDoVhi, derivarOfertaAmericaSulSoja, calcularOfertaAmericaSulSoja };
