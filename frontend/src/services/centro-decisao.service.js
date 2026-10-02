import http from './http.js'

// Centro de Decisão (ADR 0048): o preço do ativo como era conhecido na data e a leitura de geopolítica dela.
async function getCentroDecisao({ ativo, data, serie } = {}) {
  const { data: resposta } = await http.get('/api/v1/centro-decisao', { params: { ativo, data, serie } })
  return resposta
}

export default { getCentroDecisao }
