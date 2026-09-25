import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { useWorkspaceStore } from '../stores/workspace.js'
import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import ComoFuncionaView from '../views/ComoFuncionaView.vue'
import ConfiguracaoView from '../views/ConfiguracaoView.vue'
import UsuariosView from '../views/UsuariosView.vue'
import ObservaveisView from '../views/ObservaveisView.vue'
import ObservavelDetalheView from '../views/ObservavelDetalheView.vue'
import ExecucoesView from '../views/ExecucoesView.vue'
import EspacoView from '../views/EspacoView.vue'
import StatusProjetoView from '../views/StatusProjetoView.vue'
import NotFoundView from '../views/NotFoundView.vue'
import ServidorIndisponivelView from '../views/ServidorIndisponivelView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/indisponivel', name: 'indisponivel', component: ServidorIndisponivelView, meta: { public: true } },
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/como-funciona', name: 'como-funciona', component: ComoFuncionaView },
    { path: '/dados-mercado/observaveis', name: 'dados-mercado-observaveis', component: ObservaveisView },
    {
      path: '/dados-mercado/observaveis/:codigo',
      name: 'dados-mercado-observavel-detalhe',
      component: ObservavelDetalheView
    },
    { path: '/dados-mercado/execucoes', name: 'dados-mercado-execucoes', component: ExecucoesView },
    // Tudo que é privado a um espaço vive sob /e/:workspaceId/... (futuras
    // rotas de carteira etc. entram como filhas/irmãs desta) - o guard abaixo
    // valida o :workspaceId de qualquer rota assim. Páginas de mercado
    // (/dados-mercado/...) são globais e não levam espaço na URL.
    { path: '/e/:workspaceId', name: 'espaco', component: EspacoView },
    { path: '/configuracao', name: 'configuracao', component: ConfiguracaoView },
    { path: '/status-projeto', name: 'status-projeto', component: StatusProjetoView },
    { path: '/usuarios', name: 'usuarios', component: UsuariosView, meta: { requiresAdmin: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView, meta: { public: true } }
  ],
  scrollBehavior() {
    return { top: 0 }
  }
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.state.checked && to.name !== 'indisponivel') {
    await auth.fetchCurrentUser()
  }

  // Servidor não respondeu (nem depois das novas tentativas): não é "não logado", então não manda para o login.
  if (auth.state.unavailable && !to.meta.public) {
    return { name: 'indisponivel', query: { destino: to.fullPath } }
  }

  if (!to.meta.public && !auth.state.user) {
    return { name: 'login' }
  }

  if (to.name === 'login' && auth.state.user) {
    return { name: 'dashboard' }
  }

  // Um :workspaceId na URL só vale se for de um espaço do próprio usuário
  // (id inexistente e id de outro usuário dão a mesma resposta). Isto é UX,
  // não segurança: o servidor é quem checa o vínculo quando houver dado
  // privado (ver ADR 0007, §6).
  if (to.params.workspaceId) {
    const workspaces = useWorkspaceStore()
    if (!workspaces.setActive(to.params.workspaceId)) {
      return { name: 'dashboard' }
    }
  }

  if (to.meta.requiresAdmin && auth.state.user?.role !== 'admin') {
    return { name: 'dashboard' }
  }

  return true
})

export default router
