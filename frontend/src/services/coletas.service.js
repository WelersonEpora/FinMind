import http from './http.js'

async function listarExecucoes({ coletor, status, dataInicio, dataFim, pagina, tamanhoPagina, ordenarPor, ordem } = {}) {
  const { data } = await http.get('/api/v1/coletas', {
    params: { coletor, status, dataInicio, dataFim, pagina, tamanhoPagina, ordenarPor, ordem }
  })
  return data
}

async function getExecucaoDetalhe(id) {
  const { data } = await http.get(`/api/v1/coletas/${id}`)
  return data
}

async function executarColeta() {
  const { data } = await http.post('/api/v1/coletas')
  return data
}

export default { listarExecucoes, getExecucaoDetalhe, executarColeta }
