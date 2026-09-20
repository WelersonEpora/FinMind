// Formatação da tela de Observáveis - funções puras, testáveis sem DOM.

const formatadores = new Map()

// `casasDecimais` vem da API por observável (contratos do COT = 0; ouro = 2;
// os antigos - dólar/Selic - seguem em 4). Sem ele, 4, como sempre foi.
export function formatarValor(valor, casasDecimais = 4) {
  if (valor === null || valor === undefined) return '-'
  if (!formatadores.has(casasDecimais)) {
    formatadores.set(
      casasDecimais,
      new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casasDecimais, maximumFractionDigits: casasDecimais })
    )
  }
  return formatadores.get(casasDecimais).format(valor)
}

// Resumo honesto de quanto da data de publicação é estimada por regra
// (ver docs/adr/0008). `publicacao` = { totalVersoes, versoesEstimadas, percentualEstimado }.
export function descreverPublicacao(publicacao) {
  if (!publicacao || !publicacao.totalVersoes) return '-'
  const pct = publicacao.percentualEstimado
  if (pct === 0) return 'Real (informada pela fonte)'
  if (pct === 100) return 'Estimada por regra'
  const formatado = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(pct)
  return `${formatado}% estimada por regra`
}
