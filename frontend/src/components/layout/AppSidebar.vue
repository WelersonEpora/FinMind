<script setup>
import { computed } from 'vue'
import { useAuthStore } from '../../stores/auth.js'

defineProps({
  collapsed: { type: Boolean, default: false },
  mobileOpen: { type: Boolean, default: false }
})

const emit = defineEmits(['navigate'])

const auth = useAuthStore()

const links = [
  {
    to: '/',
    label: 'Dashboard',
    icon: 'M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z'
  }
]

const futureLinks = [
  { label: 'Ativos', icon: 'M4.5 6a1 1 0 100 2 1 1 0 000-2zM9 6h11M4.5 12a1 1 0 100 2 1 1 0 000-2zM9 12h11M4.5 18a1 1 0 100 2 1 1 0 000-2zM9 18h11' },
  { label: 'Análises', icon: 'M5 19V13M12 19V8M19 19V4' },
  { label: 'Sinais', icon: 'M6 10a6 6 0 0112 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10zM10 18.5a2 2 0 004 0' },
  { label: 'Resultados', icon: 'M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v4h4' }
]

// Grupo "Sistema" - sempre por último no menu. Usuários só aparece pra
// owner (só owner inclui/ajusta outros usuários - ver require-role na rota
// backend); Configuração fica visível pra todo mundo.
const systemLinks = computed(() => {
  const items = []

  if (auth.state.user?.role === 'owner') {
    items.push({
      to: '/usuarios',
      label: 'Usuários',
      icon: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 2.5-5 6-5s6 2 6 5M17 11a3 3 0 100-6M17.5 15c2 .3 3.5 1.8 3.5 5'
    })
  }

  items.push({
    to: '/configuracao',
    label: 'Configuração',
    icon: 'M4 6h16M4 6a2 2 0 104 0 2 2 0 00-4 0zm16 6H4m16 0a2 2 0 11-4 0 2 2 0 014 0zM4 18h16m-16 0a2 2 0 104 0 2 2 0 00-4 0z'
  })

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
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0">
            <path :d="link.icon" />
          </svg>
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
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0">
            <path :d="item.icon" />
          </svg>
          <span class="finmind-nav-label">{{ item.label }}</span>
        </span>
      </li>
    </ul>

    <div class="mt-auto">
      <div class="finmind-group-label px-3 py-2 text-uppercase text-secondary small">Sistema</div>
      <ul class="nav flex-column p-2">
        <li v-for="link in systemLinks" :key="link.to" class="nav-item">
          <router-link
            :to="link.to"
            class="nav-link text-white d-flex align-items-center gap-2"
            active-class="active"
            :title="link.label"
            @click="emit('navigate')"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0">
              <path :d="link.icon" />
            </svg>
            <span class="finmind-nav-label">{{ link.label }}</span>
          </router-link>
        </li>
      </ul>
    </div>
  </nav>
</template>

<style scoped>
.finmind-sidebar {
  grid-area: sidebar;
  width: 240px;
  position: sticky;
  top: 64px;
  align-self: start;
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.18s ease;
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
