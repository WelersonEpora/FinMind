import http from './http.js'

// A revisão dos eventos de magnitude 3 (ADR 0149): os eventos aceitos de grau ALTA, revisados ou pendentes. A chave do
// evento vai no corpo (tem "|" e o título).
async function listar(ativo) {
  const { data } = await http.get('/api/v1/revisoes-evento', { params: { ativo } })
  return data
}

async function revisar(chave, observacao) {
  const { data } = await http.post('/api/v1/revisoes-evento', { chave, observacao })
  return data
}

async function desfazer(chave) {
  const { data } = await http.post('/api/v1/revisoes-evento/desfazer', { chave })
  return data
}

export default { listar, revisar, desfazer }
