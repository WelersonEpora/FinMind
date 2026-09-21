// Entrega um Blob ao usuário como download (âncora temporária). Fica isolado
// da view porque depende de DOM - o resto da exportação é testável sem ele.
export function baixarArquivo(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob)
  const ancora = document.createElement('a')
  ancora.href = url
  ancora.download = nomeArquivo
  document.body.appendChild(ancora)
  ancora.click()
  ancora.remove()
  URL.revokeObjectURL(url)
}

// `<código>[_<métrica>]_AAAA-MM-DD.csv` (data em UTC) - a métrica só existe nos cards com seletor.
export function nomeArquivoExportacao(codigo, metrica, agora = new Date()) {
  return `${[codigo, metrica, agora.toISOString().slice(0, 10)].filter(Boolean).join('_')}.csv`
}
