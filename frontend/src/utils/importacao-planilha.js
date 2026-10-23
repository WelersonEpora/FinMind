// O resumo de uma importação de planilha (POST da rota do catálogo, ADR 0146), em uma frase para a tela.

function dataBr(iso) {
  return iso ? iso.split('-').reverse().join('/') : '-'
}

export function resumoImportacao(importacao) {
  if (importacao.status === 'failed') return `A importação falhou: ${importacao.erro || 'veja o detalhe em Execuções.'}`
  const v = importacao.valores
  const partes = [`${v.criados} novos`]
  if (v.atualizados) partes.push(`${v.atualizados} revisados`)
  partes.push(`${v.ignorados} já existentes`)
  if (v.falhas) partes.push(`${v.falhas} com problema (veja em Execuções)`)
  return `Período de ${dataBr(importacao.periodo.de)} a ${dataBr(importacao.periodo.ate)}: ${partes.join(', ')}.`
}
