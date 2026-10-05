"use strict";

const analiseDiariaRepository = require("../repositories/analise-diaria.repository");
const analiseDiariaService = require("./analise-diaria.service");
const realizadoAnaliseService = require("./realizado-analise.service");
const { ATIVOS } = require("./centro-decisao.service");
const { ATIVOS_COM_ANALISE_DIARIA, configuracaoDoAtivo } = require("../shared/analise-diaria");
const { classificarNaFaixa, TENDENCIA_DA_FAIXA } = require("../shared/analise-diaria-base");
const { ValidationError } = require("../shared/errors");

// Qualidade da IA (ADR 0064): cada leitura de tendência × horizonte contra o que o preço de fato fez, com duas medidas
// (direção e faixa) e dois benchmarks calculados nas MESMAS linhas. Tudo sob demanda, nada gravado: as leituras vêm de
// `analise_diaria` e o realizado da camada point-in-time (realizado-analise.service.js). Cada número da tela sai das
// linhas devolvidas junto, para ser auditado.
//
// Uma linha entra na métrica só se: os horizontes contam da data da análise; o horizonte está APURADO; houve pregão na
// própria data da análise (sem isso, as leituras de sexta, sábado e domingo mediriam a mesma janela); a IA leu o
// horizonte (INSUFICIENTE vira cobertura, não erro); e a leitura tem a variação passada do horizonte (a Persistência).
// Os motivos de ficar fora são verificados nessa ordem; a linha conta só no primeiro.

const MOTIVOS_FORA = Object.freeze([
  "REFERENCIA_ANTIGA",
  "A_APURAR",
  "AGUARDANDO_DADO",
  "SEM_PRECO",
  "SEM_PREGAO",
  "SEM_BASE",
  "SEM_PREGAO_NA_DATA",
  "INSUFICIENTE",
  "SEM_BENCHMARK"
]);

// Os três "previsores" medidos nas mesmas linhas: a IA e os dois benchmarks.
const PREVISORES = Object.freeze(["IA", "SEMPRE_LATERAL", "PERSISTENCIA"]);

// O passado da janela do gráfico (90 dias; frontend/src/utils/leque-leituras.js): o preço vem desde então, mesmo antes
// da leitura mais antiga do período.
const DIAS_DE_PRECO = 90;

// Os ativos com leitura diária na ordem do Centro de Decisão: sem ativo no filtro, o 1º (como lá).
const ATIVOS_DA_TELA = ATIVOS.filter((a) => ATIVOS_COM_ANALISE_DIARIA.includes(a.codigo)).map((a) => a.codigo);

// A escala ordinal das faixas: a distância entre a lida e a realizada vai de 0 a 4.
const POSICAO_DA_FAIXA = Object.freeze({ BAIXA_FORTE: -2, BAIXA_LEVE: -1, LATERAL: 0, ALTA_LEVE: 1, ALTA_FORTE: 2 });

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

// O resultado de uma faixa prevista contra a realizada: a direção bateu? a faixa exata? a que distância?
function comparar(prevista, realizada) {
  return {
    faixa: prevista,
    direcao: TENDENCIA_DA_FAIXA[prevista] === TENDENCIA_DA_FAIXA[realizada],
    faixaExata: prevista === realizada,
    distancia: Math.abs(POSICAO_DA_FAIXA[prevista] - POSICAO_DA_FAIXA[realizada])
  };
}

// A Persistência de um horizonte: a variação passada de mesmo prazo, como a IA a recebeu (termina no preço que ela
// viu; recalculá-la até a base da avaliação daria ao benchmark o que a IA não teve), na faixa do horizonte.
function persistencia(variacoes, { dias, t1, t2 }) {
  const percentual = variacoes?.[`d${dias}`]?.percentual;
  if (!Number.isFinite(percentual) || t1 == null || t2 == null) return null;
  return { variacaoPct: percentual, faixa: classificarNaFaixa(percentual, { t1, t2 }) };
}

function motivoFora({ referencia, situacao, base, lida, faixaRealizada, persistida }) {
  if (referencia !== "DATA_DA_ANALISE") return "REFERENCIA_ANTIGA";
  if (situacao !== "APURADO") return situacao;
  if (!faixaRealizada) return "SEM_BASE";
  if (!base?.naDataDaAnalise) return "SEM_PREGAO_NA_DATA";
  if (!lida || POSICAO_DA_FAIXA[lida.faixa] === undefined) return "INSUFICIENTE";
  if (!persistida) return "SEM_BENCHMARK";
  return null;
}

// Uma linha da tabela: a leitura × um horizonte, com tudo o que forma o número.
function montarLinha(registro, leitura, realizado, horizonte) {
  const preco = leitura.precoReferencia;
  const apurado = realizado.horizontes.find((r) => r.horizonte === horizonte.codigo) || { situacao: "SEM_BASE" };
  const lida = (leitura.leituras || []).find((l) => l.horizonte === horizonte.codigo) || null;
  const persistida = persistencia(registro.entrada?.precoReferencia?.variacoes, horizonte);
  const motivo = motivoFora({
    referencia: leitura.referenciaHorizontes.tipo,
    situacao: apurado.situacao,
    base: realizado.base,
    lida,
    faixaRealizada: apurado.faixa,
    persistida
  });
  return {
    dataAnalise: leitura.data,
    horizonte: horizonte.codigo,
    rotulo: horizonte.rotulo,
    dias: horizonte.dias,
    dataAlvo: horizonte.dataAlvo,
    t1: horizonte.t1,
    t2: horizonte.t2,
    versoes: { prompt: registro.versao_prompt, metodologia: registro.versao_metodologia, configuracao: registro.versao_configuracao },
    serie: preco?.serie ?? null,
    contrato: preco?.contrato?.ticker ?? null,
    seriesCode: realizado.seriesCode ?? null,
    referenciaHorizontes: leitura.referenciaHorizontes.tipo,
    precoRecebido: preco ? { valor: preco.valor, data: preco.dataReferencia } : null,
    base: realizado.base ? { valor: realizado.base.valor, data: realizado.base.data, confirmada: realizado.base.confirmada } : null,
    lida: lida ? { tendencia: lida.tendencia, faixa: lida.faixa ?? null, confianca: lida.confianca ?? null } : null,
    realizado: {
      situacao: apurado.situacao,
      preco: apurado.preco ?? null,
      data: apurado.dataPreco ?? null,
      variacaoPct: apurado.variacaoPct ?? null,
      faixa: apurado.faixa ?? null,
      tendencia: apurado.faixa ? TENDENCIA_DA_FAIXA[apurado.faixa] : null
    },
    persistencia: persistida,
    motivoFora: motivo,
    resultado:
      motivo === null
        ? {
            IA: comparar(lida.faixa, apurado.faixa),
            SEMPRE_LATERAL: comparar("LATERAL", apurado.faixa),
            PERSISTENCIA: comparar(persistida.faixa, apurado.faixa)
          }
        : null
  };
}

function medir(resultados) {
  const n = resultados.length;
  if (n === 0) return { direcao: { k: 0, pct: null }, faixaExata: { k: 0, pct: null }, distanciaMedia: null };
  const direcao = resultados.filter((r) => r.direcao).length;
  const faixaExata = resultados.filter((r) => r.faixaExata).length;
  return {
    direcao: { k: direcao, pct: (direcao / n) * 100 },
    faixaExata: { k: faixaExata, pct: (faixaExata / n) * 100 },
    distanciaMedia: resultados.reduce((soma, r) => soma + r.distancia, 0) / n
  };
}

// Uma célula ativo × horizonte: n, cobertura, linhas fora por motivo, as medidas dos três previsores e a síntese (a IA
// contra o MELHOR benchmark em cada medida: p.p. no acerto, faixas na distância; negativo na distância é melhor).
function resumirHorizonte(horizonte, linhas) {
  const avaliadas = linhas.filter((l) => l.motivoFora === null);
  const fora = Object.fromEntries(MOTIVOS_FORA.map((m) => [m, linhas.filter((l) => l.motivoFora === m).length]));
  const medidas = Object.fromEntries(PREVISORES.map((p) => [p, medir(avaliadas.map((l) => l.resultado[p]))]));
  const benchmarks = PREVISORES.filter((p) => p !== "IA").map((p) => medidas[p]);
  const n = avaliadas.length;
  return {
    horizonte: horizonte.codigo,
    rotulo: horizonte.rotulo,
    dias: horizonte.dias,
    totalLinhas: linhas.length,
    n,
    // Sobre as linhas que entrariam na métrica se a IA tivesse lido (as respondidas e as INSUFICIENTE).
    cobertura: { respondidas: n + fora.SEM_BENCHMARK, total: n + fora.SEM_BENCHMARK + fora.INSUFICIENTE },
    fora,
    medidas,
    sintese:
      n === 0
        ? null
        : {
            direcaoPp: medidas.IA.direcao.pct - Math.max(...benchmarks.map((b) => b.direcao.pct)),
            faixaExataPp: medidas.IA.faixaExata.pct - Math.max(...benchmarks.map((b) => b.faixaExata.pct)),
            distancia: medidas.IA.distanciaMedia - Math.min(...benchmarks.map((b) => b.distanciaMedia))
          }
  };
}

function validarFiltros({ ativo, desde, ate, versaoConfiguracao } = {}) {
  const codigo = String(ativo || ATIVOS_DA_TELA[0]).trim().toUpperCase();
  if (!ATIVOS_COM_ANALISE_DIARIA.includes(codigo)) {
    throw new ValidationError(`"ativo" deve ser um entre: ${ATIVOS_COM_ANALISE_DIARIA.join(", ")}.`);
  }
  for (const [campo, valor] of [["desde", desde], ["ate", ate]]) {
    if (valor && !REGEX_DATA.test(valor)) throw new ValidationError(`"${campo}" deve estar em AAAA-MM-DD.`);
  }
  let versao = null;
  if (versaoConfiguracao !== undefined && versaoConfiguracao !== "") {
    versao = Number(versaoConfiguracao);
    if (!Number.isInteger(versao) || versao < 1) throw new ValidationError('"versaoConfiguracao" deve ser um inteiro positivo.');
  }
  return { ativo: codigo, desde: desde || null, ate: ate || null, versaoConfiguracao: versao };
}

// GET /api/v1/qualidade-ia?ativo=&desde=&ate=&versaoConfiguracao=
async function obterQualidadeIa(filtros = {}, deps = {}) {
  const agora = deps.agora || new Date();
  const { ativo, desde, ate, versaoConfiguracao } = validarFiltros(filtros);
  const repo = deps.analiseDiariaRepository || analiseDiariaRepository;
  const [registros, versoesConfiguracao] = await Promise.all([
    repo.listarParaAvaliacao({ ativo, desde, ate, versaoConfiguracao }),
    repo.listarVersoesConfiguracao(ativo)
  ]);

  const leituras = registros.map((r) => analiseDiariaService.leituraGravada(ativo, r));
  const { realizados, pontosPorSerie, hoje } = await (deps.realizadoAnaliseService || realizadoAnaliseService).apurarRealizadosComPontos(
    leituras,
    { agora, diasDePreco: DIAS_DE_PRECO },
    deps
  );
  const linhas = leituras.flatMap((leitura, i) => leitura.horizontes.map((h) => montarLinha(registros[i], leitura, realizados[i], h)));

  // Os horizontes na ordem da configuração atual; um código que só exista em leituras antigas vem no fim.
  const ordem = configuracaoDoAtivo(ativo).HORIZONTES.map((h) => ({ codigo: h.codigo, rotulo: h.rotulo, dias: h.dias }));
  for (const l of linhas) {
    if (!ordem.some((h) => h.codigo === l.horizonte)) ordem.push({ codigo: l.horizonte, rotulo: l.rotulo, dias: l.dias });
  }

  const definicao = ATIVOS.find((a) => a.codigo === ativo);
  return {
    qualidadeIa: {
      ativo: { codigo: ativo, nome: definicao?.nome || ativo },
      ativos: ATIVOS_DA_TELA.map((codigo) => ({ codigo, nome: ATIVOS.find((a) => a.codigo === codigo)?.nome || codigo })),
      calculadoEm: agora.toISOString(),
      hoje,
      filtros: { desde, ate, versaoConfiguracao },
      versoesConfiguracao,
      totalLeituras: registros.length,
      horizontes: ordem.map((h) => resumirHorizonte(h, linhas.filter((l) => l.horizonte === h.codigo))),
      linhas,
      // O preço de cada série ou contrato das leituras (o gráfico desenha a linha do contrato que as leituras de cada dia
      // usavam), da base mais antiga até hoje, na versão mais recente.
      precos: [...pontosPorSerie].map(([seriesCode, pontos]) => ({
        seriesCode,
        contrato: linhas.find((l) => l.seriesCode === seriesCode)?.contrato ?? null,
        pontos
      }))
    }
  };
}

module.exports = { obterQualidadeIa, montarLinha, resumirHorizonte, comparar, persistencia, MOTIVOS_FORA, PREVISORES, POSICAO_DA_FAIXA };
