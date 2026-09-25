import { reactive, readonly } from 'vue'
import authService from '../services/auth.service.js'
import { useWorkspaceStore } from './workspace.js'
import { verificarSessao } from '../utils/sessao.js'

// Estado reativo simples, sem Pinia - a superfície de estado de
// autenticação é pequena o bastante (usuário + flags) pra não justificar
// mais uma dependência (mesmo critério de simplicidade usado no restante
// do projeto).
// `unavailable`: a sessão não pôde ser verificada (servidor lento ou fora do ar) - diferente de "não logado".
// Nesse caso `checked` continua false, para a próxima navegação verificar de novo.
const state = reactive({
  user: null,
  checked: false,
  unavailable: false
})

async function login(email, password) {
  state.user = await authService.login(email, password)
  state.checked = true
  state.unavailable = false
  // Os espaços do usuário carregam junto com a sessão.
  await useWorkspaceStore().load()
}

async function logout() {
  try {
    await authService.logout()
  } finally {
    state.user = null
    useWorkspaceStore().clear()
  }
}

// Só um 401 desloga; timeout/500/502 tentam de novo e, se persistirem, marcam `unavailable` (utils/sessao.js).
async function fetchCurrentUser() {
  const resultado = await verificarSessao(() => authService.me())
  state.unavailable = resultado.status === 'indisponivel'

  if (resultado.status === 'autenticado') {
    state.user = resultado.user
    await useWorkspaceStore().load()
  } else {
    state.user = null
    useWorkspaceStore().clear()
  }
  state.checked = !state.unavailable
}

// Atualiza o usuário em memória depois de uma edição de perfil (ver
// UsuariosView/AppTopbar) - evita precisar deslogar/logar de novo só pra
// refletir o nome novo na topbar/sidebar.
function updateUser(patch) {
  if (state.user) {
    Object.assign(state.user, patch)
  }
}

export function useAuthStore() {
  return {
    state: readonly(state),
    login,
    logout,
    fetchCurrentUser,
    updateUser
  }
}
