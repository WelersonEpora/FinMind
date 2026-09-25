// Verificação da sessão ao abrir/recarregar a página (`/auth/me`). Só um 401 de verdade significa "não está
// logado": timeout, 500 ou 502 (servidor lento sob carga, backend reiniciando num deploy) NÃO desloga — a sessão
// continua válida no cookie. Nesses casos tenta de novo, com espera crescente, o bastante para atravessar um deploy;
// se ainda assim não responder, devolve "indisponivel" e a tela diz isso (em vez de pedir login à toa).
export const ESPERAS_PADRAO_MS = [1000, 3000, 5000]

const esperarPadrao = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function ehNaoAutenticado(erro) {
  return erro?.response?.status === 401
}

// `buscar` devolve o usuário (ou lança o erro do axios). Resultado:
//   { status: 'autenticado', user } | { status: 'nao-autenticado' } | { status: 'indisponivel', erro }
export async function verificarSessao(buscar, { esperas = ESPERAS_PADRAO_MS, esperar = esperarPadrao } = {}) {
  let ultimoErro = null
  for (let tentativa = 0; tentativa <= esperas.length; tentativa += 1) {
    if (tentativa > 0) await esperar(esperas[tentativa - 1])
    try {
      return { status: 'autenticado', user: await buscar() }
    } catch (erro) {
      if (ehNaoAutenticado(erro)) return { status: 'nao-autenticado' }
      ultimoErro = erro
    }
  }
  return { status: 'indisponivel', erro: ultimoErro }
}
