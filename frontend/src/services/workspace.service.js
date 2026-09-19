import http from './http.js'

// Espaços do usuário autenticado: [{ id, nome, pessoal, papel }].
async function listarEspacos() {
  const { data } = await http.get('/api/v1/workspaces')
  return data.espacos
}

async function criarEspaco(nome) {
  const { data } = await http.post('/api/v1/workspaces', { nome })
  return data.espaco
}

// Membros de um espaço: [{ id, nome, papel, voce, email? }] - o e-mail só vem
// para o owner do espaço.
async function listarMembros(workspaceId) {
  const { data } = await http.get(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/membros`)
  return data.membros
}

// Usuários ativos que ainda não são membros do espaço (lista de escolha do
// "adicionar membro"): [{ nome, email }]. Só o owner do espaço consegue.
async function listarCandidatos(workspaceId) {
  const { data } = await http.get(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/membros/candidatos`)
  return data.candidatos
}

async function adicionarMembro(workspaceId, { email, papel }) {
  const { data } = await http.post(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/membros`, { email, papel })
  return data.membro
}

// membroId é o id do VÍNCULO (o `id` que listarMembros devolve), não do usuário.
async function removerMembro(workspaceId, membroId) {
  await http.delete(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/membros/${encodeURIComponent(membroId)}`)
}

// O servidor exige o nome exato do espaço como confirmação.
async function excluirEspaco(workspaceId, confirmacao) {
  await http.delete(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}`, { data: { confirmacao } })
}

export default {
  listarEspacos,
  criarEspaco,
  listarMembros,
  listarCandidatos,
  adicionarMembro,
  removerMembro,
  excluirEspaco
}
