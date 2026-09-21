import http from './http.js'

async function getStatusProjeto() {
  const { data } = await http.get('/api/v1/status-projeto')
  return data.statusProjeto
}

export default { getStatusProjeto }
