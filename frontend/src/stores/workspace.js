import { computed, reactive, readonly } from 'vue'
import workspaceService from '../services/workspace.service.js'
import { escolherEspacoAtivo } from '../utils/workspace.js'

// Espaços do usuário + qual está ativo. O espaço ativo vive AQUI (e na URL,
// em rotas /e/:workspaceId/...), nunca no JWT - um token guardando o espaço
// ficaria desatualizado quando um vínculo fosse revogado (ver ADR 0007, §6).
// É só contexto de interface: quem decide o que o usuário pode ver é o
// servidor, checando o vínculo, não este estado.
const STORAGE_KEY = 'finmind.espacoAtivo'

const state = reactive({
  list: [],
  activeId: null
})

const active = computed(() => state.list.find((espaco) => espaco.id === state.activeId) || null)

// localStorage pode não existir (testes em Node) ou lançar (modo privado).
function lerSalvo() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) || null
  } catch (_err) {
    return null
  }
}

function gravarSalvo(id) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, id)
  } catch (_err) {
    // Só perde a lembrança da escolha entre sessões - sem impacto funcional.
  }
}

// Nunca lança: uma falha ao carregar os espaços não deve derrubar o login,
// só deixa a interface sem seletor (lista vazia).
async function load() {
  try {
    state.list = await workspaceService.listarEspacos()
  } catch (_err) {
    state.list = []
  }
  state.activeId = escolherEspacoAtivo(state.list, { salvoId: lerSalvo() })
}

// Cria um espaço e o torna o ativo. Recarrega a lista do servidor (que já
// vem ordenada) em vez de inserir localmente. Lança em caso de erro, para o
// formulário mostrar a mensagem.
async function create(nome) {
  const espaco = await workspaceService.criarEspaco(nome)
  await load()
  setActive(espaco.id)
  return espaco
}

// Exclui um espaço (só o owner; nunca o pessoal - o servidor confere) e
// recarrega a lista. Como o espaço excluído deixa de existir, o ativo volta
// para o último usado válido ou o pessoal. Lança em caso de erro.
async function remove(workspaceId, confirmacao) {
  await workspaceService.excluirEspaco(workspaceId, confirmacao)
  await load()
}

function has(id) {
  return state.list.some((espaco) => espaco.id === id)
}

// Devolve false (sem alterar nada) se o id não é de um espaço do usuário.
function setActive(id) {
  if (!has(id)) return false
  state.activeId = id
  gravarSalvo(id)
  return true
}

function clear() {
  state.list = []
  state.activeId = null
}

export function useWorkspaceStore() {
  return {
    state: readonly(state),
    active,
    load,
    create,
    remove,
    has,
    setActive,
    clear
  }
}
