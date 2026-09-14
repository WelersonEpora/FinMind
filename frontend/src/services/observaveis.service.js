import http from './http.js'

async function listarObservaveis() {
  const { data } = await http.get('/api/v1/observaveis')
  return data
}

async function getObservavelDetalhe(codigo) {
  const { data } = await http.get(`/api/v1/observaveis/${codigo}`)
  return data
}

async function getObservavelHistorico(codigo, { pagina, tamanhoPagina, ordenarPor, ordem, dataInicio, dataFim } = {}) {
  const { data } = await http.get(`/api/v1/observaveis/${codigo}/historico`, {
    params: { pagina, tamanhoPagina, ordenarPor, ordem, dataInicio, dataFim }
  })
  return data
}

export default { listarObservaveis, getObservavelDetalhe, getObservavelHistorico }
