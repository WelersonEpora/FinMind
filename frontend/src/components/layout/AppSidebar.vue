<script setup>
import { computed } from 'vue'
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
const workspaces = useWorkspaceStore()

const links = [
  { to: '/', label: 'Dashboard', icon: 'bi-grid-1x2-fill' },
  { to: '/como-funciona', label: 'Como funciona', icon: 'bi-question-circle' }
]

// Grupo "Dados de Mercado" - mesmo agrupamento usado no AgroMind
// (DashboardShell.vue).
const dadosMercadoLinks = [
  { to: '/dados-mercado/observaveis', label: 'Observáveis', icon: 'bi-database' },
  { to: '/dados-mercado/execucoes', label: 'Execuções', icon: 'bi-arrow-repeat' }
]

// Grupo "Espaço": o seletor do espaço ativo (único lugar que mostra o nome
// do espaço) e, abaixo, o que existe DENTRO dele - trocar de espaço não muda a
// estrutura do menu, só para onde "Visão geral" aponta. Sem espaço ativo
// (falha ao carregar a lista) o grupo inteiro some. Só "Visão geral" existe;
// os demais são entidades privadas ainda não implementadas (ver ADR 0007).
const espacoLinks = computed(() => {
  const active = workspaces.active.value
  if (!active) return []

  return [{ to: { name: 'espaco', params: { workspaceId: active.id } }, label: 'Visão geral', icon: 'bi-house-door' }]
})

const espacoFutureLinks = [
  { label: 'Carteiras', icon: 'bi-wallet2' },
  { label: 'Operações', icon: 'bi-arrow-left-right' },
  { label: 'Posições', icon: 'bi-pie-chart' },
  { label: 'Patrimônio', icon: 'bi-bank' }
]

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
      <!-- Sem rótulo de texto: o seletor já é o cabeçalho do grupo (mostra o
           nome, o tipo e o papel do espaço) e um "ESPAÇO" acima de "Espaço
           pessoal" só repetiria. Fica a linha divisória. -->
      <div class="finmind-group-divider"></div>
      <WorkspaceSwitcher @navigate="emit('navigate')" />
      <ul class="nav nav-pills flex-column py-1 px-2">
        <li v-for="link in espacoLinks" :key="link.label" class="nav-item">
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
        <li v-for="item in espacoFutureLinks" :key="item.label" class="nav-item">
          <span
            class="nav-link text-secondary disabled d-flex align-items-center gap-2 finmind-future-link"
            :title="`${item.label} — em breve`"
          >
            <i class="bi flex-shrink-0 finmind-nav-icon" :class="item.icon"></i>
            <span class="finmind-nav-label">{{ item.label }}</span>
          </span>
        </li>
      </ul>
    </template>

    <div class="finmind-group-label px-3 py-2 text-uppercase text-secondary small">Dados de Mercado</div>
    <ul class="nav nav-pills flex-column py-1 px-2">
      <li v-for="link in dadosMercadoLinks" :key="link.to" class="nav-item">
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
  width: 240px;
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

/* Mesma linha divisória do rótulo, para o grupo cujo cabeçalho é o seletor. */
.finmind-group-divider {
  margin-top: 0.35rem;
  margin-bottom: 0.4rem;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.finmind-nav-icon {
  font-size: 1.1rem;
  width: 18px;
  text-align: center;
}

/* Placeholders do grupo Espaço (Carteiras/Operações/Posições/Patrimônio):
   continuam 4 itens separados (ADR 0007), só mais discretos e baixos, já que
   ainda não fazem nada. */
.finmind-future-link {
  padding-top: 0.18rem !important;
  padding-bottom: 0.18rem !important;
  font-size: 0.82rem;
  opacity: 0.75;
}
.finmind-future-link .finmind-nav-icon {
  font-size: 0.95rem;
}

.finmind-sidebar .nav-pills .nav-link.active {
  background-color: #2C4A75;
}

.finmind-sidebar-collapsed {
  width: 72px;
}
.finmind-sidebar-collapsed .finmind-nav-label,
.finmind-sidebar-collapsed .finmind-group-label,
.finmind-sidebar-collapsed .finmind-group-divider {
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
  .finmind-sidebar-collapsed .finmind-group-label,
  .finmind-sidebar-collapsed .finmind-group-divider {
    display: block;
  }
  .finmind-sidebar-collapsed .nav-link {
    justify-content: flex-start;
  }
}
</style>
