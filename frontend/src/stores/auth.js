import { reactive, readonly } from 'vue'
import authService from '../services/auth.service.js'

// Estado reativo simples, sem Pinia - a superfície de estado de
// autenticação é pequena o bastante (usuário + flags) pra não justificar
// mais uma dependência (mesmo critério de simplicidade usado no restante
// do projeto).
const state = reactive({
  user: null,
  checked: false
})

async function login(email, password) {
  state.user = await authService.login(email, password)
  state.checked = true
}

async function logout() {
  try {
    await authService.logout()
  } finally {
    state.user = null
  }
}

async function fetchCurrentUser() {
  try {
    state.user = await authService.me()
  } catch (_err) {
    state.user = null
  } finally {
    state.checked = true
  }
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
