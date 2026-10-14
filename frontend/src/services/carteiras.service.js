import http from './http.js'

// Carteiras virtuais de um espaço (ADR 0127). O servidor confere o vínculo com o espaço; criar e mudar parâmetros,
// só o dono.
const base = (workspaceId) => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/carteiras`
const daCarteira = (workspaceId, carteiraId) => `${base(workspaceId)}/${encodeURIComponent(carteiraId)}`

// { contas, ativos, padroes, inicioMinimo }: o que a criação oferece.
async function obterOpcoes(workspaceId) {
  const { data } = await http.get(`${base(workspaceId)}/opcoes`)
  return data.opcoes
}

async function listarCarteiras(workspaceId) {
  const { data } = await http.get(base(workspaceId))
  return data.carteiras
}

async function criarCarteira(workspaceId, dados) {
  const { data } = await http.post(base(workspaceId), dados)
  return data.carteira
}

// A carteira com os parâmetros em vigor, as pendências, as trilhas e as versões.
async function obterCarteira(workspaceId, carteiraId) {
  const { data } = await http.get(daCarteira(workspaceId, carteiraId))
  return data.carteira
}

async function registrarVersao(workspaceId, carteiraId, { parametros, motivo }) {
  const { data } = await http.post(`${daCarteira(workspaceId, carteiraId)}/versoes`, { parametros, motivo })
  return data.versao
}

async function obterPainel(workspaceId, carteiraId) {
  const { data } = await http.get(`${daCarteira(workspaceId, carteiraId)}/painel`)
  return data.painel
}

async function listarRodadas(workspaceId, carteiraId) {
  const { data } = await http.get(`${daCarteira(workspaceId, carteiraId)}/rodadas`)
  return data.rodadas
}

async function listarPosicoes(workspaceId, carteiraId) {
  const { data } = await http.get(`${daCarteira(workspaceId, carteiraId)}/posicoes`)
  return data.posicoes
}

async function listarOperacoes(workspaceId, carteiraId) {
  const { data } = await http.get(`${daCarteira(workspaceId, carteiraId)}/operacoes`)
  return data.operacoes
}

// As recomendações da IA da carteira (a mais recente primeiro), sem os textos longos.
async function listarRecomendacoes(workspaceId, carteiraId) {
  const { data } = await http.get(`${daCarteira(workspaceId, carteiraId)}/recomendacoes`)
  return data.recomendacoes
}

// Uma recomendação inteira, com o que foi à IA (instrução, prompt) e cada resposta bruta.
async function obterRecomendacao(workspaceId, carteiraId, recomendacaoId) {
  const { data } = await http.get(`${daCarteira(workspaceId, carteiraId)}/recomendacoes/${encodeURIComponent(recomendacaoId)}`)
  return data.recomendacao
}

// O diário do operador (etapa 6): o dia aberto, o checklist e as operações dele.
async function obterDiario(workspaceId, carteiraId) {
  const { data } = await http.get(`${daCarteira(workspaceId, carteiraId)}/diario`)
  return data.diario
}

// A conferência de uma entrada sem gravar (a prévia do formulário): { aprovado, verificacoes, plano, contrato }.
async function conferirEntrada(workspaceId, carteiraId, dados) {
  const { data } = await http.post(`${daCarteira(workspaceId, carteiraId)}/diario/conferencia`, dados)
  return data.conferencia
}

async function registrarEntrada(workspaceId, carteiraId, dados) {
  const { data } = await http.post(`${daCarteira(workspaceId, carteiraId)}/diario/entradas`, dados)
  return data.ordem
}

async function editarEntrada(workspaceId, carteiraId, ordemId, dados) {
  const { data } = await http.put(`${daCarteira(workspaceId, carteiraId)}/diario/ordens/${encodeURIComponent(ordemId)}`, dados)
  return data.ordem
}

async function cancelarOrdem(workspaceId, carteiraId, ordemId) {
  const { data } = await http.post(`${daCarteira(workspaceId, carteiraId)}/diario/ordens/${encodeURIComponent(ordemId)}/cancelamento`)
  return data.ordem
}

// { acao: 'ZERAR' | 'REDUZIR', preco }
async function registrarSaida(workspaceId, carteiraId, posicaoId, dados) {
  const { data } = await http.post(`${daCarteira(workspaceId, carteiraId)}/diario/posicoes/${encodeURIComponent(posicaoId)}/saidas`, dados)
  return data.ordem
}

async function moverStop(workspaceId, carteiraId, posicaoId, stop) {
  const { data } = await http.post(`${daCarteira(workspaceId, carteiraId)}/diario/posicoes/${encodeURIComponent(posicaoId)}/stop`, { stop })
  return data.evento
}

export default {
  obterOpcoes,
  listarCarteiras,
  criarCarteira,
  obterCarteira,
  registrarVersao,
  obterPainel,
  listarRodadas,
  listarPosicoes,
  listarOperacoes,
  listarRecomendacoes,
  obterRecomendacao,
  obterDiario,
  conferirEntrada,
  registrarEntrada,
  editarEntrada,
  cancelarOrdem,
  registrarSaida,
  moverStop
}
