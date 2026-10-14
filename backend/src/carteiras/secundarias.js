"use strict";

// As MÉTRICAS SECUNDÁRIAS da medição (ADR 0127, §10; etapa 7b). Puro: recebe o que a rotina gravou e devolve números.
// São DESCRITIVAS: explicam a pergunta principal, nunca decidem nada e não têm veredito (decisão do usuário,
// 2026-10-14). Tudo no segmento em vigor (os dias a partir de `inicio`), como a principal. Três blocos:
//
//   atribuição  de onde vem a diferença IA − Determinística: os dias com posições diferentes, a diferença por ativo, as
//               recomendações contrárias à leitura, os cortes do motor e a consistência da réplica semanal
//   painel      as seis trilhas lado a lado: retorno, volatilidade, Sharpe sobre o caixa da carteira (a trilha CAIXA:
//               a Selic, ou a meta do Fed na conta internacional), maior recuo, tempo exposto e custos de operação; e a
//               diferença IA − Persistência (a IA inteira contra uma regra sem nenhuma IA), só o número
//   Cartilha    as métricas do Cap. 9.5 por trilha e ativo: operações, taxa de acerto, resultado médio em R, R:R
//               realizado contra o planejado e a aderência ao checklist (só o operador)
//
// Proposta do FinMind (o ADR só lista as métricas): a volatilidade e o Sharpe anualizados por √252, sobre o retorno de
// cada dia em relação ao patrimônio do dia anterior, e só a partir de 20 dias (o mínimo da principal); "exposto" é o
// dia com alguma posição carregada de um ajuste para o outro (entrou antes do dia e saiu nele ou depois); o R:R
// realizado é o ganho médio em R sobre a perda média em R. "Operador alinhado × contrário à recomendação" fica para
// quando houver operações do operador (decisão do usuário, 2026-10-14).

const DIAS_NO_ANO = 252;
const ORDEM_DAS_TRILHAS = ["IA", "DETERMINISTICA", "OPERADOR", "PERSISTENCIA", "COMPRAR_E_SEGURAR", "CAIXA"];
const EPSILON = 1e-9;

const media = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
function desvio(v) {
  if (v.length < 2) return null;
  const m = media(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

// A posição estava carregada no dia D (o resultado do dia dependia dela)?
const carregadaEm = (p, data) => p.dataEntrada < data && (p.dataSaida == null || p.dataSaida >= data);

// "ATIVO:LADO" das posições carregadas no dia, em ordem: a assinatura da exposição.
const exposicaoEm = (posicoes, data) =>
  posicoes
    .filter((p) => carregadaEm(p, data))
    .map((p) => `${p.ativo}:${p.lado}`)
    .sort()
    .join("|");

// O patrimônio de partida do segmento: o do último dia antes de `inicio`, ou o capital inicial.
function baseDoSegmento(serie, inicio, capital) {
  const antes = serie.filter((p) => p.data < inicio);
  return antes.length ? antes[antes.length - 1].patrimonio : capital;
}

// O retorno de cada dia sobre o patrimônio do dia anterior (fração). -> Map data -> retorno.
function retornosRelativos(pontos, base) {
  const r = new Map();
  let anterior = base;
  for (const { data, patrimonio } of pontos) {
    r.set(data, anterior ? patrimonio / anterior - 1 : 0);
    anterior = patrimonio;
  }
  return r;
}

// Uma trilha no segmento. `serie`: o patrimônio diário inteiro dela, em ordem; `caixa`: Map data -> retorno da trilha
// CAIXA (a taxa livre de risco da carteira); `posicoes`: as dela; `custos`: os lançamentos de custo do segmento.
function painelDaTrilha({ tipo, serie, posicoes = [], custos = 0, caixa, inicio, capital, minimoDias, limiteDrawdownPct }) {
  const base = baseDoSegmento(serie, inicio, capital);
  const pontos = serie.filter((p) => p.data >= inicio);
  const dias = pontos.length;
  const final = dias ? pontos[dias - 1].patrimonio : base;
  const retornos = retornosRelativos(pontos, base);
  const valores = [...retornos.values()];
  const excesso = [...retornos.entries()].map(([data, r]) => r - (caixa?.get(data) ?? 0));
  const comDias = dias >= minimoDias;
  const dp = desvio(valores);
  const dpExcesso = desvio(excesso);

  let pico = base;
  let recuo = 0;
  for (const { patrimonio } of pontos) {
    pico = Math.max(pico, patrimonio);
    recuo = Math.min(recuo, (patrimonio / pico - 1) * 100);
  }
  const expostos = pontos.filter((p) => posicoes.some((pos) => carregadaEm(pos, p.data))).length;

  return {
    tipo,
    dias,
    patrimonio: final,
    retornoPct: ((final - base) / capital) * 100,
    volatilidadePct: comDias && dp != null ? dp * Math.sqrt(DIAS_NO_ANO) * 100 : null,
    sharpe: comDias && tipo !== "CAIXA" && dpExcesso > EPSILON ? (media(excesso) / dpExcesso) * Math.sqrt(DIAS_NO_ANO) : null,
    maiorRecuoPct: recuo,
    limiteDrawdownPct: limiteDrawdownPct ?? null,
    tempoExpostoPct: dias ? (expostos / dias) * 100 : null,
    custos
  };
}

// A diferença acumulada A − B no segmento, em % do capital inicial (a mesma medida da principal), nos dias das duas.
function diferencaAcumulada(serieA, serieB, inicio, capital) {
  const variacao = (serie) => {
    const r = new Map();
    let anterior = baseDoSegmento(serie, inicio, capital);
    for (const p of serie.filter((x) => x.data >= inicio)) {
      r.set(p.data, ((p.patrimonio - anterior) / capital) * 100);
      anterior = p.patrimonio;
    }
    return r;
  };
  const a = variacao(serieA);
  const b = variacao(serieB);
  const dias = [...a.keys()].filter((d) => b.has(d));
  return { dias: dias.length, acumulada: dias.reduce((s, d) => s + a.get(d) - b.get(d), 0) };
}

// Os dias em que IA e Determinística carregavam posições diferentes (outro ativo ou outro lado) e quanto da diferença
// acumulada veio deles. `diferencas`: as diárias do segmento (a principal).
function diasDivergentes({ diferencas, posicoesIa, posicoesDet }) {
  const r = { dias: diferencas.length, divergentes: 0, acumuladaDivergentes: 0, acumuladaIguais: 0 };
  for (const { data, diferenca } of diferencas) {
    if (exposicaoEm(posicoesIa, data) !== exposicaoEm(posicoesDet, data)) {
      r.divergentes += 1;
      r.acumuladaDivergentes += diferenca;
    } else {
      r.acumuladaIguais += diferenca;
    }
  }
  return r;
}

// A diferença IA − Determinística por ativo, pelo razão: o ajuste diário e os custos de cada ativo; o rendimento do caixa
// (sem ativo) numa linha à parte. Em % do capital inicial. `lancamentos`: [{ trilhaId, data, tipo, ativo, valor }].
function atribuicaoPorAtivo({ lancamentos, iaId, detId, inicio, ativos, capital }) {
  const soma = (trilhaId, ativo) =>
    (lancamentos
      .filter((l) => l.trilhaId === trilhaId && l.data >= inicio && (l.ativo ?? null) === ativo)
      .reduce((s, l) => s + l.valor, 0) /
      capital) *
    100;
  return [...ativos, null].map((ativo) => {
    const ia = soma(iaId, ativo);
    const det = soma(detId, ativo);
    return { ativo, ia, det, diferenca: ia - det };
  });
}

// As operações encerradas de uma lista: quantas, acertos, o resultado somado (% do capital) e o R médio.
function resumoDeOperacoes(posicoes, capital) {
  const encerradas = posicoes.filter((p) => p.situacao === "ENCERRADA");
  const comR = encerradas.filter((p) => p.resultadoR != null).map((p) => p.resultadoR);
  return {
    operacoes: posicoes.length,
    encerradas: encerradas.length,
    acertos: encerradas.filter((p) => p.resultadoMoeda > 0).length,
    resultadoPct: (encerradas.reduce((s, p) => s + (p.resultadoMoeda || 0), 0) / capital) * 100,
    rMedio: media(comR)
  };
}

// As recomendações contrárias à leitura do MEDIO no segmento: em quantos dias apareceram, quantos ramos, quantas a trilha
// IA aplicou (uma entrada contra a leitura, ou manter contra ela) e o resultado das operações que nasceram delas.
// `principais`: as recomendações PRINCIPAL do segmento; `intencoesIa`: as da trilha IA, com a `data` da rodada.
function contrariasALeitura({ principais, intencoesIa, posicoesIa, capital }) {
  const comContraria = principais.filter((r) => r.contrarias && Object.keys(r.contrarias).length);
  const aplicadas = intencoesIa.filter((i) => i.referencia?.contraria === true);
  const entradas = aplicadas.filter((i) => i.acao.startsWith("ENTRAR_") && i.resultado === "ORDEM");
  const operacoes = posicoesIa.filter((p) => entradas.some((i) => i.data === p.dataEntrada && i.ativo === p.ativo));
  return {
    dias: comContraria.length,
    ramos: comContraria.reduce((s, r) => s + Object.values(r.contrarias).reduce((n, ramos) => n + ramos.length, 0), 0),
    entradas: entradas.length,
    manutencoes: aplicadas.filter((i) => i.acao === "MANTER").length,
    resultado: resumoDeOperacoes(operacoes, capital)
  };
}

// As intenções que o motor barrou, por trilha e motivo. -> [{ tipo, total, motivos: { MOTIVO: n } }], só as que têm.
function cortesDoMotor({ intencoes, tipoDaTrilha }) {
  const porTrilha = new Map();
  for (const i of intencoes.filter((x) => x.resultado === "BLOQUEADA")) {
    const tipo = tipoDaTrilha.get(i.trilhaId);
    const item = porTrilha.get(tipo) || { tipo, total: 0, motivos: {} };
    item.total += 1;
    item.motivos[i.motivoBloqueio || "SEM_MOTIVO"] = (item.motivos[i.motivoBloqueio || "SEM_MOTIVO"] || 0) + 1;
    porTrilha.set(tipo, item);
  }
  return ORDEM_DAS_TRILHAS.filter((t) => porTrilha.has(t)).map((t) => porTrilha.get(t));
}

// A consistência da réplica semanal: nos dias com a principal e a réplica válidas, quantas ações (por ativo e ramo) e
// quantas prioridades a réplica repetiu.
function consistenciaDaReplica(recomendacoes) {
  const r = { replicas: 0, comparaveis: 0, acoes: 0, acoesIguais: 0, prioridades: 0, prioridadesIguais: 0 };
  const principalDe = new Map(recomendacoes.filter((x) => x.tipo === "PRINCIPAL").map((x) => [x.data, x]));
  for (const replica of recomendacoes.filter((x) => x.tipo === "REPLICA")) {
    r.replicas += 1;
    const principal = principalDe.get(replica.data);
    if (replica.situacao !== "VALIDA" || principal?.situacao !== "VALIDA") continue;
    r.comparaveis += 1;
    const daPrincipal = new Map(principal.recomendacoes.map((x) => [x.ativo, x]));
    for (const item of replica.recomendacoes) {
      const outro = daPrincipal.get(item.ativo);
      if (!outro) continue;
      r.prioridades += 1;
      if (outro.prioridade === item.prioridade) r.prioridadesIguais += 1;
      for (const ramo of ["semPosicao", "comprado", "vendido"]) {
        r.acoes += 1;
        if (outro[ramo]?.acao === item[ramo]?.acao) r.acoesIguais += 1;
      }
    }
  }
  return r;
}

// As métricas da Cartilha (Cap. 9.5) de uma lista de posições (as que entraram no segmento).
function metricasDaCartilha(posicoes, capital) {
  const base = resumoDeOperacoes(posicoes, capital);
  const comR = posicoes.filter((p) => p.situacao === "ENCERRADA" && p.resultadoR != null).map((p) => p.resultadoR);
  const ganhos = comR.filter((r) => r > 0);
  const perdas = comR.filter((r) => r < 0);
  const planejados = posicoes.filter((p) => p.alvo2 != null && p.distancia > 0).map((p) => Math.abs(p.alvo2 - p.entrada) / p.distancia);
  return {
    ...base,
    abertas: posicoes.filter((p) => p.situacao === "ABERTA").length,
    acertoPct: base.encerradas ? (base.acertos / base.encerradas) * 100 : null,
    rrRealizado: ganhos.length && perdas.length ? media(ganhos) / Math.abs(media(perdas)) : null,
    rrPlanejado: media(planejados)
  };
}

// Por trilha (só as que operam com stop e alvo: sem o caixa e o comprar e segurar), o total e cada ativo. A aderência:
// das entradas do operador no segmento (as canceladas fora), quantas marcaram o checklist inteiro.
function cartilhaPorTrilha({ trilhas, posicoes, ordensOperador = [], ativos, inicio, capital }) {
  return trilhas
    .filter((t) => !["CAIXA", "COMPRAR_E_SEGURAR"].includes(t.tipo))
    .sort((a, b) => ORDEM_DAS_TRILHAS.indexOf(a.tipo) - ORDEM_DAS_TRILHAS.indexOf(b.tipo))
    .map((t) => {
      const dela = posicoes.filter((p) => p.trilhaId === t.id && p.dataEntrada >= inicio);
      let aderencia = null;
      if (t.tipo === "OPERADOR") {
        const entradas = ordensOperador.filter((o) => o.tipo === "ENTRADA" && o.situacao !== "CANCELADA" && o.dataExecucao >= inicio && typeof o.detalhes?.aderente === "boolean");
        aderencia = { entradas: entradas.length, aderentes: entradas.filter((o) => o.detalhes.aderente).length };
      }
      return {
        tipo: t.tipo,
        total: metricasDaCartilha(dela, capital),
        porAtivo: ativos.map((ativo) => ({ ativo, ...metricasDaCartilha(dela.filter((p) => p.ativo === ativo), capital) })),
        aderencia
      };
    });
}

module.exports = {
  ORDEM_DAS_TRILHAS,
  painelDaTrilha,
  diferencaAcumulada,
  diasDivergentes,
  atribuicaoPorAtivo,
  contrariasALeitura,
  cortesDoMotor,
  consistenciaDaReplica,
  metricasDaCartilha,
  cartilhaPorTrilha
};
