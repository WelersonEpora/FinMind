import http from './http.js'

// O teste de captura dos eventos (ADR 0144): a lista de eventos de referência, a geração dos candidatos e a avaliação.
async function listar({ ativo, dataInicio, dataFim }) {
  const { data } = await http.get('/api/v1/captura-eventos', { params: { ativo, dataInicio, dataFim } })
  return data
}

async function gerarCandidatos({ ativo, dataInicio, dataFim }) {
  const { data } = await http.post('/api/v1/captura-eventos/candidatos', { ativo, dataInicio, dataFim })
  return data
}

async function criarManual({ ativo, data: dataEvento, titulo, observacao }) {
  const { data } = await http.post('/api/v1/captura-eventos', { ativo, data: dataEvento, titulo, observacao })
  return data
}

// `campos`: só o que muda ({ relevante }, { captura, capturaEvento }, { observacao }).
async function avaliar(id, campos) {
  const { data } = await http.patch(`/api/v1/captura-eventos/${id}`, campos)
  return data
}

async function remover(id) {
  await http.delete(`/api/v1/captura-eventos/${id}`)
}

export default { listar, gerarCandidatos, criarManual, avaliar, remover }
