// O último ativo que a pessoa analisou, para o Centro de Decisão, a Metodologia do Ativo e a Qualidade da IA abrirem
// sempre no mesmo (preferência de cada navegador, no localStorage). Um ativo na URL vale mais: um link aberto com ele
// mostra o ativo do link e passa a ser o lembrado. Sem armazenamento (janela privada, bloqueado), as telas seguem com o
// padrão delas.

const CHAVE = 'finmind:ativo'

function armazenamento() {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

export function lerAtivoPreferido(storage = armazenamento()) {
  try {
    return storage?.getItem(CHAVE) || null
  } catch {
    return null
  }
}

export function salvarAtivoPreferido(codigo, storage = armazenamento()) {
  if (!codigo) return
  try {
    storage?.setItem(CHAVE, codigo)
  } catch {
    // sem armazenamento: só não lembra
  }
}
