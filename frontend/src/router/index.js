import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import ConfiguracaoView from '../views/ConfiguracaoView.vue'
import UsuariosView from '../views/UsuariosView.vue'
import NotFoundView from '../views/NotFoundView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/configuracao', name: 'configuracao', component: ConfiguracaoView },
    { path: '/usuarios', name: 'usuarios', component: UsuariosView, meta: { requiresOwner: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView, meta: { public: true } }
  ],
  scrollBehavior() {
    return { top: 0 }
  }
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.state.checked) {
    await auth.fetchCurrentUser()
  }

  if (!to.meta.public && !auth.state.user) {
    return { name: 'login' }
  }

  if (to.name === 'login' && auth.state.user) {
    return { name: 'dashboard' }
  }

  if (to.meta.requiresOwner && auth.state.user?.role !== 'owner') {
    return { name: 'dashboard' }
  }

  return true
})

export default router
