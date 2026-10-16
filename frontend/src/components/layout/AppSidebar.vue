<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import { useWorkspaceStore } from '../../stores/workspace.js'
import { version as appVersion } from '../../../package.json'
import WorkspaceSwitcher from './WorkspaceSwitcher.vue'

defineProps({
  collapsed: { type: Boolean, default: false },
  mobileOpen: { type: Boolean, default: false }
})

const emit = defineEmits(['navigate'])

const auth = useAuthStore()
const route = useRoute()
const workspaces = useWorkspaceStore()

const links = [
  { to: '/', label: 'Centro de Decisão', icon: 'bi-compass' },
  { to: '/dados-mercado/metodologia', label: 'Metodologia do Ativo', icon: 'bi-diagram-3' },
  { to: '/qualidade-ia', label: 'Qualidade da IA', icon: 'bi-check2-circle' },
  { to: '/como-funciona', label: 'Como funciona', icon: 'bi-question-circle' }
]

// Grupo "Dados de Mercado" - mesmo agrupamento usado no AgroMind
// (DashboardShell.vue).
const dadosMercadoLinks = [
  // A tela de comparação (outra rota) também deixa este item ativo.
  { to: '/dados-mercado/tradingview', label: 'TradingView', icon: 'bi-bar-chart-line', rotas: ['dados-mercado-tradingview-comparar'] },
  { to: '/dados-mercado/observaveis', label: 'Observáveis', icon: 'bi-database' },
  { to: '/dados-mercado/eventos', label: 'Eventos', icon: 'bi-globe2' },
  { to: '/dados-mercado/execucoes', label: 'Execuções', icon: 'bi-arrow-repeat' }
]

// Grupo "Espaços": o seletor do espaço ativo (único lugar que mostra o nome
// do espaço) e, abaixo, o que existe DENTRO dele - trocar de espaço não muda a
// estrutura do menu, só para onde "Visão geral" aponta. Sem espaço ativo
// (falha ao carregar a lista) o grupo inteiro some. Existem "Visão geral" e
// "Carteiras" (as virtuais, ADR 0127). Os marcadores desativados (Operações,
// Posições, Patrimônio) saíram em 2026-10-14, por decisão do usuário (ADR 0007).
const espacoLinks = computed(() => {
  const active = workspaces.active.value
  if (!active) return []

  return [
    { to: { name: 'espaco', params: { workspaceId: active.id } }, label: 'Visão geral', icon: 'bi-house-door' },
    // A tela de uma carteira (outra rota) também deixa este item ativo.
    { to: { name: 'carteiras', params: { workspaceId: active.id } }, label: 'Carteiras', icon: 'bi-wallet2', rotas: ['carteira'] }
  ]
})

// Grupo "Sistema" - sempre por último no menu. Usuários só aparece pra
// admin de plataforma (só admin inclui/ajusta outros usuários - ver
// require-role na rota backend); Configuração fica visível pra todo mundo.
const systemLinks = computed(() => {
  const items = []

  if (auth.state.user?.role === 'admin') {
    items.push({ to: '/usuarios', label: 'Usuários', icon: 'bi-people' })
  }

  items.push({ to: '/status-projeto', label: 'Status do projeto', icon: 'bi-clipboard-data' })
  items.push({ to: '/configuracao', label: 'Configuração', icon: 'bi-sliders' })

  return items
})
</script>

<template>
  <nav
    class="finmind-sidebar bg-dark text-white d-flex flex-column"
    :class="{ 'finmind-sidebar-collapsed': collapsed, 'finmind-sidebar-open': mobileOpen }"
  >
    <ul class="nav nav-pills flex-column py-1 px-2 mt-2">
      <li v-for="link in links" :key="link.to" class="nav-item">
        <router-link
          :to="link.to"
          class="nav-link text-white d-flex align-items-center gap-2"
          active-class="active"
          :title="link.label"
          @click="emit('navigate')"
        >
          <i class="bi flex-shrink-0 finmind-nav-icon" :class="link.icon"></i>
          <span class="finmind-nav-label">{{ link.label }}</span>
        </router-link>
      </li>
    </ul>

    <template v-if="espacoLinks.length">
      <div class="finmind-group-label px-3 py-2 text-uppercase text-secondary small">Espaços</div>
      <ul class="nav nav-pills flex-column py-1 px-2">
        <!-- O seletor do espaço ativo é o 1º item do grupo, no nível de
             "Visão geral"; o título acima é fixo, como os dos outros grupos. -->
        <li class="nav-item">
          <WorkspaceSwitcher @navigate="emit('navigate')" />
        </li>
        <li v-for="link in espacoLinks" :key="link.label" class="nav-item">
          <router-link
            :to="link.to"
            class="nav-link text-white d-flex align-items-center gap-2"
            :class="{ active: link.rotas?.includes(route.name) }"
            active-class="active"
            :title="link.label"
            @click="emit('navigate')"
          >
            <i class="bi flex-shrink-0 finmind-nav-icon" :class="link.icon"></i>
            <span class="finmind-nav-label">{{ link.label }}</span>
          </router-link>
        </li>
      </ul>
    </template>

    <div class="finmind-group-label px-3 py-2 text-uppercase text-secondary small">Dados de Mercado</div>
    <ul class="nav nav-pills flex-column py-1 px-2">
      <li v-for="link in dadosMercadoLinks" :key="link.to" class="nav-item">
        <router-link
          :to="link.to"
          class="nav-link text-white d-flex align-items-center gap-2"
          :class="{ active: link.rotas?.includes(route.name) }"
          active-class="active"
          :title="link.label"
          @click="emit('navigate')"
        >
          <i class="bi flex-shrink-0 finmind-nav-icon" :class="link.icon"></i>
          <span class="finmind-nav-label">{{ link.label }}</span>
        </router-link>
      </li>
    </ul>

    <div class="mt-auto">
      <div class="finmind-group-label px-3 py-2 text-uppercase text-secondary small">Sistema</div>
      <ul class="nav nav-pills flex-column py-1 px-2">
        <li v-for="link in systemLinks" :key="link.to" class="nav-item">
          <router-link
            :to="link.to"
            class="nav-link text-white d-flex align-items-center gap-2"
            active-class="active"
            :title="link.label"
            @click="emit('navigate')"
          >
            <i class="bi flex-shrink-0 finmind-nav-icon" :class="link.icon"></i>
            <span class="finmind-nav-label">{{ link.label }}</span>
          </router-link>
        </li>
      </ul>

      <div class="finmind-sidebar-footer px-3 py-2 text-secondary small">
        <span class="finmind-nav-label">FinMind v{{ appVersion }}</span>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.finmind-sidebar {
  grid-area: sidebar;
  width: 216px;
  /* Fonte um pouco menor que o corpo (padrão do Bootstrap) - visual mais
     enxuto e ajuda a caber sem rolagem em telas baixas (notebook sem monitor
     externo). Herda pra dentro do WorkspaceSwitcher também (Bootstrap Reboot
     faz `button/input` herdarem font-size do ancestral). */
  font-size: 0.9rem;
  position: sticky;
  top: 64px;
  /* Acima do conteúdo posicionado do <main>: o dropdown do seletor de espaço
     (fixo, maior que a sidebar recolhida) precisa aparecer por cima dele. Abaixo
     da topbar (1030) e dos modais (1055). */
  z-index: 1020;
  align-self: stretch;
  min-height: calc(100vh - 64px);
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.18s ease;
}

.finmind-sidebar-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

/* Densidade compacta: telas baixas (notebook sem monitor externo) não sobram
   folga pra padding largo em cada item - reduzido do padrão do Bootstrap
   (0.5rem 1rem) sem tirar espaço de toque confortável. */
.finmind-sidebar .nav-link {
  padding: 0.38rem 0.75rem;
}

.finmind-group-label {
  margin-top: 0.35rem;
  padding-top: 0.35rem !important;
  padding-bottom: 0.35rem !important;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.finmind-nav-icon {
  font-size: 1rem;
  width: 18px;
  text-align: center;
}


.finmind-sidebar .nav-pills .nav-link.active {
  background-color: #2C4A75;
}

.finmind-sidebar-collapsed {
  width: 72px;
}
.finmind-sidebar-collapsed .finmind-nav-label,
.finmind-sidebar-collapsed .finmind-group-label {
  display: none;
}
.finmind-sidebar-collapsed .nav-link {
  justify-content: center;
}

@media (max-width: 767.98px) {
  .finmind-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 82%;
    max-width: 300px;
    max-height: none;
    z-index: 1045;
    transform: translateX(-100%);
    transition: transform 0.22s ease;
    box-shadow: 8px 0 24px rgba(0, 0, 0, 0.25);
  }

  .finmind-sidebar-open {
    transform: translateX(0);
  }

  /* No mobile o drawer sempre mostra o rótulo, mesmo com `collapsed` true -
     collapsed e mobileOpen são alternados juntos pelo mesmo botão (ver
     AppShell.vue), mas só um dos dois faz sentido visual por vez. */
  .finmind-sidebar-collapsed {
    width: 82%;
    max-width: 300px;
  }
  .finmind-sidebar-collapsed .finmind-nav-label,
  .finmind-sidebar-collapsed .finmind-group-label {
    display: block;
  }
  .finmind-sidebar-collapsed .nav-link {
    justify-content: flex-start;
  }
}
</style>
