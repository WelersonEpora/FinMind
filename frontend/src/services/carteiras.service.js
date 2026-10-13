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

export default {
  obterOpcoes,
  listarCarteiras,
  criarCarteira,
  obterCarteira,
  registrarVersao,
  obterPainel,
  listarRodadas,
  listarPosicoes,
  listarOperacoes
}
