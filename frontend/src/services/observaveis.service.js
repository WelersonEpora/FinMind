import http from './http.js'

async function listarObservaveis() {
  const { data } = await http.get('/api/v1/observaveis')
  return data
}

async function getObservavelDetalhe(codigo) {
  const { data } = await http.get(`/api/v1/observaveis/${codigo}`)
  return data
}

async function getObservavelHistorico(codigo, { pagina, tamanhoPagina, ordenarPor, ordem, dataInicio, dataFim, modality, campo, itens } = {}) {
  const { data } = await http.get(`/api/v1/observaveis/${codigo}/historico`, {
    params: { pagina, tamanhoPagina, ordenarPor, ordem, dataInicio, dataFim, modality, campo, itens }
  })
  return data
}

// Série completa (não só a página da tabela) em CSV, com os mesmos filtros da
// tabela. Devolve o Blob para o navegador salvar. Timeout maior que o padrão:
// séries longas (ex.: dólar desde 1994) varrem o histórico inteiro no servidor.
const TIMEOUT_EXPORTACAO_MS = 120000

async function exportarHistoricoCsv(codigo, { modality, campo, itens } = {}) {
  const { data } = await http.get(`/api/v1/observaveis/${codigo}/exportacao.csv`, {
    params: { modality, campo, itens },
    responseType: 'blob',
    timeout: TIMEOUT_EXPORTACAO_MS
  })
  return data
}

// Planilha de um observável sem coleta automática (ADR 0146): a rota vem do catálogo (`observavel.importacao.rota`).
// Timeout maior: 30 anos de pregões são lidos e gravados na hora.
const TIMEOUT_IMPORTACAO_MS = 120000

async function importarPlanilha(rota, arquivos) {
  const formData = new FormData()
  for (const arquivo of arquivos) formData.append('arquivos', arquivo)
  const { data } = await http.post(rota, formData, { timeout: TIMEOUT_IMPORTACAO_MS })
  return data
}

export default { listarObservaveis, getObservavelDetalhe, getObservavelHistorico, exportarHistoricoCsv, importarPlanilha }
