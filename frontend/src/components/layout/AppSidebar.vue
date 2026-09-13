<script setup>
import { computed } from 'vue'
import { useAuthStore } from '../../stores/auth.js'
import { version as appVersion } from '../../../package.json'

defineProps({
  collapsed: { type: Boolean, default: false },
  mobileOpen: { type: Boolean, default: false }
})

const emit = defineEmits(['navigate'])

const auth = useAuthStore()

const links = [
  { to: '/', label: 'Dashboard', icon: 'bi-grid-1x2-fill' },
  { to: '/como-funciona', label: 'Como funciona', icon: 'bi-question-circle' }
]

const futureLinks = [
  { label: 'Ativos', icon: 'bi-briefcase' },
  { label: 'Análises', icon: 'bi-bar-chart-line' },
  { label: 'Sinais', icon: 'bi-broadcast' },
  { label: 'Resultados', icon: 'bi-file-earmark-text' }
]

// Grupo "Sistema" - sempre por último no menu. Usuários só aparece pra
// owner (só owner inclui/ajusta outros usuários - ver require-role na rota
// backend); Configuração fica visível pra todo mundo.
const systemLinks = computed(() => {
  const items = []

  if (auth.state.user?.role === 'owner') {
    items.push({ to: '/usuarios', label: 'Usuários', icon: 'bi-people' })
  }

  items.push({ to: '/configuracao', label: 'Configuração', icon: 'bi-sliders' })

  return items
})
</script>

<template>
  <nav
    class="finmind-sidebar bg-dark text-white d-flex flex-column"
    :class="{ 'finmind-sidebar-collapsed': collapsed, 'finmind-sidebar-open': mobileOpen }"
  >
    <ul class="nav nav-pills flex-column p-2 mt-2">
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

    <div class="finmind-group-label px-3 py-2 text-uppercase text-secondary small">Módulos futuros</div>
    <ul class="nav flex-column p-2">
      <li v-for="item in futureLinks" :key="item.label" class="nav-item">
        <span
          class="nav-link text-secondary disabled d-flex align-items-center gap-2"
          :title="`${item.label} — aguardando definições do especialista`"
        >
          <i class="bi flex-shrink-0 finmind-nav-icon" :class="item.icon"></i>
          <span class="finmind-nav-label">{{ item.label }}</span>
        </span>
      </li>
    </ul>

    <div class="mt-auto">
      <div class="finmind-group-label px-3 py-2 text-uppercase text-secondary small">Sistema</div>
      <ul class="nav nav-pills flex-column p-2">
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

.finmind-nav-icon {
  font-size: 1.1rem;
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
