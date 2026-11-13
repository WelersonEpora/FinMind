import http from './http.js'

// As chaves do Gemini da plataforma (ADR 0156), só admin. A chave nunca volta da API: só a situação.
async function obter() {
  const { data } = await http.get('/api/v1/configuracoes/ia')
  return data.configuracaoIa
}

async function salvarChave(tipo, apiKey) {
  const { data } = await http.put(`/api/v1/configuracoes/ia/chaves/${tipo}`, { apiKey })
  return data.configuracaoIa
}

async function removerChave(tipo) {
  const { data } = await http.delete(`/api/v1/configuracoes/ia/chaves/${tipo}`)
  return data.configuracaoIa
}

export default { obter, salvarChave, removerChave }
