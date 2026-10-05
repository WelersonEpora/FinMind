"use strict";

const pointInTimeService = require("../services/point-in-time.service");
const faixa = require("./base/decisao-por-faixa");
const { lerPtax } = require("./base/ptax");

// FATOR (PROPOSTA, ADR 0056): custo de insumos, fator "Custo de insumos (fertilizantes, diesel)" do FEL 1 para o milho,
// na versão que o David confirmou para a v1 (§5, ADR 0055): o custo agregado do IMEA, sem o preço de fertilizante ou
// diesel. A regra é a parte da margem da R-INS v0 do David ("Motor do Milho", 2026-10-02): o preço igual ou abaixo do
// custo total por saca funciona como piso. Camadas A e B calculadas, C simulada.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation):
//     IMEA.CUSTO.MILHO.SAFRA.MEDIA_MATO_GROSSO.CT / COE / PRODUTIVIDADE_MODAL - o custo total e o operacional efetivo
//       (R$/ha) e a produtividade modal (sc/ha) da média de Mato Grosso, por safra (ADR 0024)
//     B3.MILHO_ESALQ.AVISTA_BRL - o Indicador do Milho CEPEA/ESALQ, Campinas, R$/saca (ADR 0021)
//     COMEX.ADUBO.<UREIA|KCL|MAP>.IMPORT.KG / FOB_USD - a importação mensal de adubo (Comex Stat, desde 1997, ADR 0074)
//     USD_BRL venda - a PTAX (market_quote)
//   fator (calculado sob demanda, NUNCA gravado), um ponto por semana (o último pregão dela):
//     A. o custo total e o operacional efetivo por saca da safra mais nova que o IMEA tinha publicado até a semana
//        (R$/ha ÷ sc/ha); o Indicador ESALQ; o preço médio de importação da ureia do último mês publicado (US$/t e R$/t,
//        pela PTAX média do mês)
//     B. margemPct = indicador ÷ custo total por saca - 1, em %; a margem média das safras anteriores (até 5: o
//        indicador médio de julho a junho depois da colheita de cada uma ÷ o custo dela); a RELAÇÃO DE TROCA = o preço da
//        ureia em R$/t ÷ o indicador médio do mesmo mês (sacas de milho por tonelada) e o percentil dela contra os meses
//        anteriores (todos desde jun/2018, o início do indicador na base; no mínimo 60, no máximo 120: os 10 anos da
//        regra só a partir de 2028). Cloreto de potássio e MAP vão como contexto
//     C. R-INS-01 v0: a relação de troca no P75 ou acima em 2 meses seguidos, OU a margem de 0% ou menos -> pressão de
//        ALTA (piso: retenção de oferta e menos área depois). R-INS-02 v0 (ADR 0074): a relação de troca no P25 ou
//        abaixo (adubo barato) E a margem "confortável" (acima da média das safras anteriores, a comparação da proposta)
//        -> de BAIXA. Acréscimos do FinMind: forte com as duas condições de alta ou com o preço igual ou abaixo do custo
//        OPERACIONAL efetivo (o caixa); alta e baixa juntas dão neutra; tendência pela margem de 4 semanas antes
//
// RESSALVA (a da proposta): o custo é de Mato Grosso, o preço é de Campinas, onde o milho vale mais (o frete). A margem
// assim fica maior que a do produtor de MT. Propriedades: determinístico, versionado, point-in-time, sem IA.

const FACTOR_ID = "insumos_milho_imea";
// v2 (2026-10-05): a relação de troca com a ureia do Comex Stat e a regra de baixa (ADR 0074).
const FACTOR_VERSION = 2;

const PREFIXO_CUSTO = "IMEA.CUSTO.MILHO.SAFRA.MEDIA_MATO_GROSSO";
const SERIES = Object.freeze({
  custoTotal: `${PREFIXO_CUSTO}.CT`,
  custoOperacional: `${PREFIXO_CUSTO}.COE`,
  produtividade: `${PREFIXO_CUSTO}.PRODUTIVIDADE_MODAL`,
  preco: "B3.MILHO_ESALQ.AVISTA_BRL"
});
const SERIES_CUSTO = [SERIES.custoTotal, SERIES.custoOperacional, SERIES.produtividade];

// O adubo (ADR 0074): a ureia decide (escolha do FinMind, um adubo só na relação de troca); KCl e MAP são contexto.
const ADUBOS = Object.freeze([
  { codigo: "UREIA", nome: "ureia" },
  { codigo: "KCL", nome: "cloreto de potássio" },
  { codigo: "MAP", nome: "MAP" }
]);
const SERIES_ADUBO = ADUBOS.flatMap((a) => [`COMEX.ADUBO.${a.codigo}.IMPORT.KG`, `COMEX.ADUBO.${a.codigo}.IMPORT.FOB_USD`]);
const INICIO_PTAX = "2018-01-01";
// O percentil da relação de troca: todos os meses anteriores disponíveis, de 60 (5 anos) a 120 (os 10 anos da regra).
const MESES_MINIMO_PERCENTIL = 60;
const MESES_MAXIMO_PERCENTIL = 120;
// A margem média: até 5 safras anteriores, cada uma com o indicador de julho a junho depois da colheita da safrinha.
const SAFRAS_MARGEM = 5;
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Do David (R-INS-01 v0): margem de 0% ou menos. Do FinMind: a tendência (4 semanas, 5 p.p.). O Comitê ajusta.
const PARAMETROS_PADRAO = Object.freeze({
  limiarMargemPct: 0,
  // Do David (R-INS v0): a relação de troca no P75 por 2 meses (alta) e no P25 (baixa).
  limiarTrocaAltaPct: 75,
  limiarTrocaBaixaPct: 25,
  mesesTroca: 2,
  semanasTendencia: 4,
  limiarTendenciaPp: 5
});

const ROTULOS_TENDENCIA = { SUBINDO: "Margem melhorando", CAINDO: "Margem piorando", ESTAVEL: "Estável" };

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f + 0;
}

// A semana de uma data: o domingo em que ela termina (AAAA-MM-DD).
function fimDaSemana(dataIso) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

// Camada C (função pura).
// `percentisTroca`: o percentil da relação de troca nos últimos meses publicados, do mais recente para trás (null onde
// não há); `margemMediaPct`: a margem média das safras anteriores (null sem elas).
function decidirInsumos(
  { margemPct = null, precoAbaixoDoOperacional = false, margemAnterior = null, percentisTroca = [], margemMediaPct = null },
  parametros = PARAMETROS_PADRAO
) {
  const temMargem = margemPct !== null && margemPct !== undefined;
  const meses = Math.max(1, Math.round(parametros.mesesTroca));
  const ultimos = percentisTroca.slice(0, meses);
  const trocaCompleta = ultimos.length === meses && ultimos.every((p) => p !== null && p !== undefined);
  const percentil = percentisTroca[0] ?? null;
  if (!temMargem && percentil === null) return null;
  let tendencia = null;
  let mudancaPp = null;
  if (margemAnterior !== null && margemAnterior !== undefined) {
    mudancaPp = arredondar(margemPct - margemAnterior, 2);
    if (Math.abs(mudancaPp) < parametros.limiarTendenciaPp) tendencia = faixa.TENDENCIA.ESTAVEL;
    else tendencia = mudancaPp < 0 ? faixa.TENDENCIA.CAINDO : faixa.TENDENCIA.SUBINDO;
  }
  const altaPelaMargem = temMargem && margemPct <= parametros.limiarMargemPct;
  const altaPelaTroca = trocaCompleta && ultimos.every((p) => p >= parametros.limiarTrocaAltaPct);
  const margemConfortavel = temMargem && margemMediaPct !== null && margemMediaPct !== undefined && margemPct > margemMediaPct;
  const baixa = percentil !== null && percentil <= parametros.limiarTrocaBaixaPct && margemConfortavel;
  const condicoes = { altaPelaMargem, altaPelaTroca, margemConfortavel, baixa, tendencia, mudancaPp };
  const alta = altaPelaMargem || altaPelaTroca;
  if (alta && baixa) return { ...condicoes, direcao: faixa.DIRECAO.NEUTRA, intensidade: faixa.INTENSIDADE.FRACA, conflito: true };
  if (alta) {
    const forte = (altaPelaMargem && altaPelaTroca) || (altaPelaMargem && precoAbaixoDoOperacional);
    return { ...condicoes, direcao: faixa.DIRECAO.ALTA, intensidade: forte ? faixa.INTENSIDADE.FORTE : faixa.INTENSIDADE.MODERADA };
  }
  if (baixa) return { ...condicoes, direcao: faixa.DIRECAO.BAIXA, intensidade: faixa.INTENSIDADE.MODERADA };
  return { ...condicoes, direcao: faixa.DIRECAO.NEUTRA, intensidade: faixa.INTENSIDADE.FRACA };
}

const mesDeIso = (iso) => iso.slice(0, 7);
const rotuloMes = (mes) => `${MESES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
const media = (valores) => valores.reduce((a, b) => a + b, 0) / valores.length;

function percentilContra(valor, anteriores) {
  const menores = anteriores.filter((v) => v < valor).length;
  const iguais = anteriores.filter((v) => v === valor).length;
  return arredondar(((menores + iguais / 2) / anteriores.length) * 100, 1);
}

// As médias mensais de uma série diária ({ data, valor } ou linhas com observedAt/value): mês "AAAA-MM" -> média.
function mediasMensais(itens, data, valor) {
  const somas = new Map();
  for (const item of itens) {
    const mes = mesDeIso(data(item));
    const atual = somas.get(mes) || { soma: 0, n: 0 };
    somas.set(mes, { soma: atual.soma + valor(item), n: atual.n + 1 });
  }
  return new Map([...somas].map(([mes, { soma, n }]) => [mes, soma / n]));
}

// A relação de troca que se sabia até `limite`: as versões do adubo publicadas até ele (série -> mês -> valor), com a
// PTAX e o indicador médios de cada mês. Devolve { meses (ordenados), relacao(adubo, mes), precoUsdT(adubo, mes) }.
function relacoesAte(adubo, ptaxMensal, precoMensal) {
  const precoUsdT = (codigo, mes) => {
    const kg = adubo.get(`COMEX.ADUBO.${codigo}.IMPORT.KG`)?.get(mes);
    const fob = adubo.get(`COMEX.ADUBO.${codigo}.IMPORT.FOB_USD`)?.get(mes);
    return kg > 0 && fob !== undefined ? fob / (kg / 1000) : null;
  };
  const relacao = (codigo, mes) => {
    const usd = precoUsdT(codigo, mes);
    const ptax = ptaxMensal.get(mes);
    const milho = precoMensal.get(mes);
    return usd === null || !ptax || !milho ? null : (usd * ptax) / milho;
  };
  const meses = [...(adubo.get("COMEX.ADUBO.UREIA.IMPORT.KG")?.keys() || [])].sort().filter((mes) => relacao("UREIA", mes) !== null);
  return { meses, relacao, precoUsdT };
}

// O percentil da relação de troca da ureia num mês contra os meses anteriores disponíveis (null com menos de 60).
function percentilDoMes(relacoes, indice) {
  if (indice < MESES_MINIMO_PERCENTIL) return null;
  const anteriores = relacoes.meses.slice(Math.max(0, indice - MESES_MAXIMO_PERCENTIL), indice).map((m) => relacoes.relacao("UREIA", m));
  return percentilContra(relacoes.relacao("UREIA", relacoes.meses[indice]), anteriores);
}

// Função PURA: `versoesCusto` (obterVersoesAsOf das séries de custo), `linhasPreco` (obterAsOf do indicador),
// `versoesAdubo` (obterVersoesAsOf da importação de adubo) e `ptax` ({ data, valor }) -> um ponto por semana em que já se
// sabia o custo do IMEA ou a relação de troca.
function derivarInsumosMilho(versoesCusto, linhasPreco, { parametros = PARAMETROS_PADRAO, versoesAdubo = [], ptax = [] } = {}) {
  const versoes = [...versoesCusto].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  const versoesDoAdubo = [...versoesAdubo].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  const ptaxMensal = mediasMensais(ptax, (p) => p.data, (p) => p.valor);
  const precos = linhasPreco.filter((l) => l.seriesCode === SERIES.preco);
  const adubo = new Map(SERIES_ADUBO.map((serie) => [serie, new Map()]));
  let proximaVersaoAdubo = 0;
  const ultimoPregao = new Map();
  for (const linha of linhasPreco) {
    if (linha.seriesCode !== SERIES.preco) continue;
    const semana = fimDaSemana(linha.observedAt);
    const atual = ultimoPregao.get(semana);
    if (!atual || linha.observedAt > atual.observedAt) ultimoPregao.set(semana, linha);
  }

  const margens = new Map();
  const pontos = [];
  for (const semana of [...ultimoPregao.keys()].sort()) {
    const pregao = ultimoPregao.get(semana);
    // O custo que o IMEA tinha publicado até o fim do dia do pregão: série -> safra -> valor.
    const limite = new Date(`${pregao.observedAt}T23:59:59.999-03:00`);
    const custo = new Map(SERIES_CUSTO.map((s) => [s, new Map()]));
    for (const v of versoes) {
      if (new Date(v.publishedAt) > limite) break;
      custo.get(v.seriesCode)?.set(v.observedAt, v.value);
    }
    // A importação de adubo publicada até o mesmo limite (as versões em ordem: avança só o que é novo).
    while (proximaVersaoAdubo < versoesDoAdubo.length && new Date(versoesDoAdubo[proximaVersaoAdubo].publishedAt) <= limite) {
      const v = versoesDoAdubo[proximaVersaoAdubo];
      adubo.get(v.seriesCode)?.set(mesDeIso(v.observedAt), v.value);
      proximaVersaoAdubo += 1;
    }
    // O indicador médio de cada mês, só com os pregões até o desta semana.
    const precoMensal = mediasMensais(precos.filter((l) => l.observedAt <= pregao.observedAt), (l) => l.observedAt, (l) => l.value);
    const relacoes = relacoesAte(adubo, ptaxMensal, precoMensal);
    const ultimoMes = relacoes.meses.length - 1;
    const percentisTroca = [];
    for (let k = 0; k < Math.max(1, Math.round(parametros.mesesTroca)); k += 1) {
      percentisTroca.push(ultimoMes - k >= 0 ? percentilDoMes(relacoes, ultimoMes - k) : null);
    }
    const mesTroca = ultimoMes >= 0 ? relacoes.meses[ultimoMes] : null;

    const safras = [...custo.get(SERIES.custoTotal).keys()].sort();
    const safra = safras.at(-1);
    const produtividade = safra ? custo.get(SERIES.produtividade).get(safra) : undefined;
    const temCusto = Boolean(safra && produtividade);
    if (!temCusto && !mesTroca) continue;

    const custoTotalSaca = temCusto ? custo.get(SERIES.custoTotal).get(safra) / produtividade : null;
    const operacional = temCusto ? custo.get(SERIES.custoOperacional).get(safra) : undefined;
    const custoOperacionalSaca = operacional === undefined ? null : operacional / produtividade;
    const margem = temCusto ? arredondar((pregao.value / custoTotalSaca - 1) * 100, 2) : null;
    if (margem !== null) margens.set(semana, margem);
    const anterior = new Date(`${semana}T00:00:00Z`);
    anterior.setUTCDate(anterior.getUTCDate() - 7 * parametros.semanasTendencia);
    const ano = temCusto ? Number(safra.slice(0, 4)) : null;
    const margemMedia = temCusto ? margemMediaDasSafras(custo, safra, precos, pregao.observedAt) : null;
    const usdUreia = mesTroca ? relacoes.precoUsdT("UREIA", mesTroca) : null;
    const contextoTroca = mesTroca
      ? ADUBOS.filter((a) => a.codigo !== "UREIA" && relacoes.relacao(a.codigo, mesTroca) !== null)
          .map((a) => `${a.nome}: ${faixa.fmt(relacoes.relacao(a.codigo, mesTroca), 1)} sacas/t`)
          .join("; ")
      : null;

    pontos.push({
      factorId: FACTOR_ID,
      factorVersion: FACTOR_VERSION,
      observedAt: pregao.observedAt,
      safraCusto: ano === null ? null : `${ano}/${String((ano + 1) % 100).padStart(2, "0")}`,
      precoSaca: pregao.value,
      custoTotalSaca: custoTotalSaca === null ? null : arredondar(custoTotalSaca, 2),
      custoOperacionalSaca: custoOperacionalSaca === null ? null : arredondar(custoOperacionalSaca, 2),
      margemSaca: custoTotalSaca === null ? null : arredondar(pregao.value - custoTotalSaca, 2),
      margemPct: margem,
      margemMediaSafrasPct: margemMedia === null ? null : arredondar(margemMedia.media, 2),
      safrasMargemMedia: margemMedia === null ? null : margemMedia.safras,
      mesTroca: mesTroca === null ? null : rotuloMes(mesTroca),
      ureiaUsdT: usdUreia === null ? null : arredondar(usdUreia, 0),
      ureiaRsT: usdUreia === null || !ptaxMensal.get(mesTroca) ? null : arredondar(usdUreia * ptaxMensal.get(mesTroca), 0),
      relacaoTrocaUreia: mesTroca ? arredondar(relacoes.relacao("UREIA", mesTroca), 1) : null,
      percentilTroca: percentisTroca[0],
      trocaDetalhe: mesTroca
        ? `${rotuloMes(mesTroca)}; percentil contra ${Math.min(ultimoMes, MESES_MAXIMO_PERCENTIL)} meses desde ${rotuloMes(relacoes.meses[Math.max(0, ultimoMes - MESES_MAXIMO_PERCENTIL)])}` +
          `${ultimoMes < MESES_MINIMO_PERCENTIL ? " (sem percentil: menos de 60 meses)" : ""}${contextoTroca ? `. Contexto: ${contextoTroca}` : ""}.`
        : null,
      decisao: decidirInsumos(
        {
          margemPct: margem,
          precoAbaixoDoOperacional: custoOperacionalSaca !== null && pregao.value <= custoOperacionalSaca,
          margemAnterior: margens.get(anterior.toISOString().slice(0, 10)) ?? null,
          percentisTroca,
          margemMediaPct: margemMedia === null ? null : margemMedia.media
        },
        parametros
      ),
      disponivelEm: pregao.publishedAt,
      disponivelEmEhEstimado: pregao.publishedAtIsEstimated
    });
  }
  return pontos;
}

// A margem média das safras anteriores à `safra` (até 5), com o custo que se sabia e o indicador até `ate`: em cada
// uma, o indicador médio de julho a junho depois da colheita da safrinha ÷ o custo total por saca dela - 1. Só entram
// as safras com a janela inteira já passada. null sem nenhuma.
function margemMediaDasSafras(custo, safra, precos, ate) {
  const margensSafras = [];
  for (let k = 1; k <= SAFRAS_MARGEM; k += 1) {
    const anterior = `${Number(safra.slice(0, 4)) - k}${safra.slice(4)}`;
    const produtividade = custo.get(SERIES.produtividade).get(anterior);
    const total = custo.get(SERIES.custoTotal).get(anterior);
    if (!produtividade || total === undefined) continue;
    const ano = Number(anterior.slice(0, 4));
    const inicio = `${ano + 1}-07-01`;
    const fim = `${ano + 2}-06-30`;
    if (fim > ate) continue;
    const janela = precos.filter((l) => l.observedAt >= inicio && l.observedAt <= fim).map((l) => l.value);
    if (janela.length === 0) continue;
    margensSafras.push((media(janela) / (total / produtividade) - 1) * 100);
  }
  return margensSafras.length ? { media: media(margensSafras), safras: margensSafras.length } : null;
}

async function calcularInsumosMilho({ asOf, parametros = PARAMETROS_PADRAO }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  const [versoesCusto, linhasPreco, versoesAdubo, ptax] = await Promise.all([
    servico.obterVersoesAsOf({ seriesCodes: SERIES_CUSTO, asOf }, deps),
    servico.obterAsOf({ seriesCodes: [SERIES.preco], asOf }, deps),
    servico.obterVersoesAsOf({ seriesCodes: SERIES_ADUBO, asOf }, deps),
    lerPtax({ desde: INICIO_PTAX, asOf }, deps)
  ]);
  return derivarInsumosMilho(versoesCusto, linhasPreco, { parametros, versoesAdubo, ptax });
}

// --- Camada C: explicação e exemplos ------------------------------------------------------------------------------

const reais = (n) => `R$ ${faixa.fmt(n, 2)}`;

function explicarInsumos(ponto, parametros = PARAMETROS_PADRAO) {
  const d = ponto?.decisao;
  if (!d) return [];
  const dia = ponto.observedAt.split("-").reverse().join("/");
  const passos = [];
  if (ponto.margemPct === null) {
    passos.push(`Indicador ESALQ (Campinas) de ${reais(ponto.precoSaca)} por saca em ${dia}; sem o custo do IMEA na base nesta data (A): sem margem.`);
  } else {
    passos.push(
      `Indicador ESALQ (Campinas) de ${reais(ponto.precoSaca)} por saca em ${dia}, contra o custo total de ` +
        `${reais(ponto.custoTotalSaca)} por saca em Mato Grosso (IMEA, safra ${ponto.safraCusto}) (A): margem de ${faixa.comSinal(ponto.margemPct)}% (B); ` +
        (ponto.margemMediaSafrasPct === null
          ? "sem a margem média das safras anteriores."
          : `margem média das ${ponto.safrasMargemMedia} safras anteriores de ${faixa.comSinal(ponto.margemMediaSafrasPct)}% → ${d.margemConfortavel ? "confortável (acima da média)" : "não confortável"}.`)
    );
  }
  if (ponto.relacaoTrocaUreia === null) {
    passos.push("Relação de troca: sem a importação de ureia na base nesta data.");
  } else {
    passos.push(
      `Relação de troca (${ponto.mesTroca}): a ureia importada a US$ ${faixa.fmt(ponto.ureiaUsdT, 0)}/t (R$ ${faixa.fmt(ponto.ureiaRsT, 0)}/t) custa ` +
        `${faixa.fmt(ponto.relacaoTrocaUreia, 1)} sacas de milho por tonelada (B)` +
        (ponto.percentilTroca === null
          ? "; sem percentil (menos de 60 meses de histórico)."
          : `, no percentil ${faixa.fmt(ponto.percentilTroca, 0)} dos meses anteriores (adubo caro no P${faixa.fmt(parametros.limiarTrocaAltaPct, 0)} ou acima por ` +
            `${Math.round(parametros.mesesTroca)} meses; barato no P${faixa.fmt(parametros.limiarTrocaBaixaPct, 0)} ou abaixo).`)
    );
  }
  if (d.conflito) {
    passos.push("Combinação: alta e baixa ao mesmo tempo → Neutra.");
  } else if (d.direcao === faixa.DIRECAO.ALTA) {
    const motivos = [d.altaPelaMargem && "a margem chegou ao custo, um piso", d.altaPelaTroca && "o adubo está caro em relação ao milho"].filter(Boolean).join(" e ");
    passos.push(`Direção: ${motivos} → Pressão de alta, ${d.intensidade === faixa.INTENSIDADE.FORTE ? "forte" : "moderada"}.`);
  } else if (d.direcao === faixa.DIRECAO.BAIXA) {
    passos.push("Direção: adubo barato com margem confortável (incentivo a mais área e tecnologia na safra seguinte) → Pressão de baixa, moderada.");
  } else {
    passos.push("Direção: sem piso de margem, sem adubo caro por 2 meses e sem adubo barato com margem confortável → Neutra.");
  }
  passos.push("Ressalva: o custo é de Mato Grosso e o preço é de Campinas, onde o milho vale mais (o frete); a margem do produtor de MT é menor.");
  if (d.tendencia) passos.push(`Tendência: há ${parametros.semanasTendencia} semanas a margem era ${faixa.comSinal(ponto.margemPct - d.mudancaPp)}% → ${ROTULOS_TENDENCIA[d.tendencia]}.`);
  return passos;
}

const CENARIOS = [
  { rotulo: "Preço 15% acima do custo total", margemPct: 15 },
  { rotulo: "Preço 2% acima do custo total", margemPct: 2 },
  { rotulo: "Preço igual ao custo total", margemPct: 0 },
  { rotulo: "Preço 8% abaixo do custo total, acima do operacional", margemPct: -8 },
  { rotulo: "Preço abaixo do custo operacional efetivo", margemPct: -25, precoAbaixoDoOperacional: true },
  { rotulo: "Margem de 15%, adubo caro (P80 e P85) há 2 meses", margemPct: 15, percentisTroca: [80, 85], margemMediaPct: 10 },
  { rotulo: "Margem de 20%, acima da média (10%), adubo barato (P20)", margemPct: 20, percentisTroca: [20, 30], margemMediaPct: 10 },
  { rotulo: "Margem de 5%, abaixo da média (10%), adubo barato (P20)", margemPct: 5, percentisTroca: [20, 30], margemMediaPct: 10 }
];

const EPISODIOS = [
  { mes: "2024-06", rotulo: "Meados de 2024, adubo em queda" },
  { mes: "2025-06", rotulo: "Meados de 2025" }
];

function exemplosInsumos(_pontosTodos, parametros = PARAMETROS_PADRAO) {
  // A relação de troca existe desde 2018 (com percentil, desde 2023); o custo, só desde a 1ª coleta (2026-09-15).
  const porMes = new Map(_pontosTodos.map((p) => [p.observedAt.slice(0, 7), p]));
  return {
    episodios: EPISODIOS.map(({ mes, rotulo }) => {
      const ponto = porMes.get(mes);
      return { data: ponto?.observedAt ?? `${mes}-01`, rotulo, valor: ponto?.percentilTroca ?? null, decisao: ponto?.decisao ?? null };
    }),
    cenarios: CENARIOS.map(({ rotulo, ...entrada }) => ({ rotulo, valor: entrada.margemPct, valorAnterior: null, decisao: decidirInsumos(entrada, parametros) }))
  };
}

const APRESENTACAO = {
  unidade: "%",
  quadros: [
    { camada: "A", rotulo: "Indicador CEPEA/ESALQ (Campinas)", campo: "precoSaca", casas: 2, sufixo: "R$/saca" },
    {
      camada: "A",
      rotulo: "Custo total por saca em MT (IMEA)",
      campo: "custoTotalSaca",
      casas: 2,
      secundario: { prefixo: "R$/saca, safra", campo: "safraCusto" }
    },
    { camada: "A", rotulo: "Custo operacional efetivo por saca em MT", campo: "custoOperacionalSaca", casas: 2, sufixo: "R$/saca" },
    { camada: "B", rotulo: "Margem por saca", campo: "margemSaca", casas: 2, sinal: true, sufixo: "R$/saca" },
    { camada: "B", rotulo: "Margem sobre o custo total", campo: "margemPct", casas: 2, sinal: true, unidadeValor: "%" },
    {
      camada: "B",
      rotulo: "Margem média das safras anteriores (a referência da margem confortável)",
      campo: "margemMediaSafrasPct",
      casas: 2,
      sinal: true,
      unidadeValor: "%",
      secundario: { prefixo: "safras:", campo: "safrasMargemMedia", casas: 0 }
    },
    {
      camada: "A",
      rotulo: "Ureia importada (Comex Stat)",
      campo: "ureiaUsdT",
      casas: 0,
      sufixo: "US$/t",
      secundario: { prefixo: "R$", campo: "ureiaRsT", casas: 0, sufixo: "/t" }
    },
    {
      camada: "B",
      rotulo: "Relação de troca: sacas de milho por tonelada de ureia",
      campo: "relacaoTrocaUreia",
      casas: 1,
      secundario: { prefixo: "percentil", campo: "percentilTroca", casas: 0 },
      detalhe: "trocaDetalhe"
    }
  ],
  graficoAB: {
    titulo: "Indicador ESALQ (A) × o custo total e o operacional efetivo por saca em MT (A), em R$/saca",
    unidade: "R$/saca",
    casas: 2,
    exigeCampo: "custoTotalSaca",
    series: [
      { campo: "precoSaca", rotulo: "Indicador ESALQ (A)" },
      { campo: "custoTotalSaca", rotulo: "Custo total (A)" },
      { campo: "custoOperacionalSaca", rotulo: "Custo operacional efetivo (A)" }
    ]
  },
  graficoC: {
    titulo: "Margem sobre o custo total (B) e o limiar da regra (C)",
    campo: "margemPct",
    rotulo: "Margem (B)",
    limiares: [{ chave: "limiarMargemPct", sinal: 1, rotulo: "Limiar do piso (alta abaixo dele)" }]
  },
  rotulosDecisao: { ...faixa.ROTULOS, tendencia: ROTULOS_TENDENCIA },
  parametros: [
    { chave: "limiarMargemPct", rotulo: "Limiar do piso", unidade: "%", explicacao: "Margem sobre o custo total igual ou abaixo deste valor pesa para alta (R-INS-01 v0: 0, o preço no custo)." },
    { chave: "limiarTrocaAltaPct", rotulo: "Adubo caro (percentil)", unidade: "%", explicacao: "Relação de troca nesse percentil ou acima, pelos meses seguidos abaixo, pesa para alta (R-INS-01 v0: 75)." },
    { chave: "mesesTroca", rotulo: "Meses seguidos (adubo caro)", unidade: "meses", explicacao: "Por quantos meses seguidos a relação de troca precisa ficar no percentil de adubo caro (R-INS-01 v0: 2)." },
    { chave: "limiarTrocaBaixaPct", rotulo: "Adubo barato (percentil)", unidade: "%", explicacao: "Relação de troca nesse percentil ou abaixo, com a margem acima da média das safras anteriores, pesa para baixa (R-INS-02 v0: 25)." },
    { chave: "semanasTendencia", rotulo: "Janela da tendência", unidade: "semanas", explicacao: "Contra quantas semanas atrás a margem é comparada para dizer se está melhorando ou piorando." },
    { chave: "limiarTendenciaPp", rotulo: "Mudança mínima da tendência", unidade: "p.p.", explicacao: "Quanto a margem precisa mudar na janela para não ser considerada estável." }
  ],
  regra:
    "pressão de alta com a margem do Indicador ESALQ sobre o custo total por saca do IMEA (MT) em {limiarMargemPct}% ou menos (o preço no custo, um piso), ou com a relação de troca (sacas de milho por tonelada de ureia importada) no percentil {limiarTrocaAltaPct} ou acima em {mesesTroca} meses seguidos (adubo caro); forte com as duas, ou com o preço no custo operacional efetivo ou abaixo; pressão de baixa com a relação de troca no percentil {limiarTrocaBaixaPct} ou abaixo (adubo barato) e a margem acima da média das safras anteriores (confortável); alta e baixa juntas dão neutra; o percentil é contra os meses anteriores desde jun/2018 (no mínimo 60, os 10 anos só a partir de 2028); tendência pela margem de {semanasTendencia} semanas antes, mudança mínima de {limiarTendenciaPp} p.p.; ressalva: o custo é de MT e o preço é de Campinas, onde o milho vale mais",
  exemplos: { colunaValor: "Margem" },
  nota:
    "Semanal (o último pregão da semana), não é tempo real. O custo por safra do IMEA (média de MT) é conhecido na base " +
    "desde a 1ª coleta, em 2026-09-15: antes, o fator só tem a relação de troca (point-in-time). A importação de adubo é " +
    "mensal (Comex Stat, publicada por volta do dia 15 do mês seguinte). O preço é de Campinas; o custo, de MT."
};

const METODOLOGIA = {
  factorId: FACTOR_ID,
  factorVersion: FACTOR_VERSION,
  parametrosPadrao: PARAMETROS_PADRAO,
  periodicidade: "SEMANAL",
  calcular: calcularInsumosMilho,
  explicar: explicarInsumos,
  exemplos: exemplosInsumos,
  apresentacao: APRESENTACAO
};

module.exports = { FACTOR_ID, FACTOR_VERSION, SERIES, SERIES_ADUBO, PARAMETROS_PADRAO, METODOLOGIA, decidirInsumos, derivarInsumosMilho, calcularInsumosMilho };
