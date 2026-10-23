// O teste de captura dos eventos (ADR 0144): funções puras da tela, testáveis sem DOM.

export const ATIVOS_CAPTURA = [
  { codigo: 'MILHO', rotulo: 'Milho' },
  { codigo: 'CAFE', rotulo: 'Café' },
  { codigo: 'SOJA', rotulo: 'Soja' }
]

function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// O período padrão: os 30 dias que terminam ontem (a leitura de hoje pode não ter rodado).
export function periodoPadrao(hoje, dias = 30) {
  const fim = somarDias(hoje, -1)
  return { dataInicio: somarDias(fim, -(dias - 1)), dataFim: fim }
}

const FORMATADOR = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
export const formatarPct = (v) => (v === null || v === undefined ? '—' : `${FORMATADOR.format(v)}%`)

export function rotuloRelevante(relevante) {
  if (relevante === true) return 'Relevante'
  if (relevante === false) return 'Não relevante'
  return 'A avaliar'
}

export function rotuloCaptura(item) {
  if (item.relevante !== true) return '—'
  if (item.captura === 'CAPTURADO') return 'Capturado'
  if (item.captura === 'NAO_CAPTURADO') return 'Não capturado'
  return 'A conferir'
}

// A situação do período contra a meta, em palavras: o número só vale com tudo avaliado, num período de 30 dias.
export function situacaoDaMeta(resumo, criterio) {
  if (!resumo || resumo.pctCaptura === null) return { classe: 'neutra', texto: 'Sem evento relevante conferido no período.' }
  const ressalvas = [
    !resumo.completo && 'há eventos a avaliar ou a conferir',
    !resumo.periodoDoCriterio && `o período tem ${resumo.diasDoPeriodo} dias, não ${criterio.periodoDias}`
  ].filter(Boolean)
  const base = resumo.atingeMeta
    ? `Atinge a meta de ${criterio.metaPct}%`
    : `Abaixo da meta de ${criterio.metaPct}%`
  return {
    classe: ressalvas.length ? 'parcial' : resumo.atingeMeta ? 'atinge' : 'abaixo',
    texto: ressalvas.length ? `${base}, ainda provisório: ${ressalvas.join(' e ')}.` : `${base}.`
  }
}
