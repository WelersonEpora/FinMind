<script setup>
import { ref } from 'vue'
import AppSidebar from './AppSidebar.vue'
import AppTopbar from './AppTopbar.vue'
import { useSidebarCollapsed } from '../../composables/useSidebarCollapsed.js'

// `collapsed` é global (singleton, sobrevive a navegação e a F5 - ver
// useSidebarCollapsed.js), já que cada View inclui seu próprio <AppShell>.
// `mobileOpen` é local: só faz sentido dentro desta montagem do shell.
// Os dois são alternados juntos pelo mesmo botão (ver toggleMenu) - cada um
// só tem efeito visual dentro do seu próprio breakpoint (ver AppSidebar.vue).
const collapsed = useSidebarCollapsed()
const mobileOpen = ref(false)

function toggleMenu() {
  collapsed.value = !collapsed.value
  mobileOpen.value = !mobileOpen.value
}

function closeMobileMenu() {
  mobileOpen.value = false
}
</script>

<template>
  <div class="finmind-shell">
    <AppTopbar :collapsed="collapsed" @toggle-menu="toggleMenu" />

    <div
      class="finmind-drawer-backdrop d-md-none"
      :class="{ 'finmind-drawer-backdrop-visible': mobileOpen }"
      @click="closeMobileMenu"
    ></div>

    <AppSidebar :collapsed="collapsed" :mobile-open="mobileOpen" @navigate="closeMobileMenu" />

    <main class="finmind-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.finmind-shell {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: 64px 1fr;
  grid-template-areas: 'topbar topbar' 'sidebar main';
  min-height: 100vh;
}

.finmind-main {
  grid-area: main;
  padding: 1.5rem;
  min-width: 0;
}

.finmind-drawer-backdrop {
  display: none;
}

@media (max-width: 767.98px) {
  .finmind-shell {
    grid-template-columns: 1fr;
    grid-template-areas: 'topbar' 'main';
  }

  .finmind-drawer-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    z-index: 1040;
  }

  .finmind-drawer-backdrop-visible {
    opacity: 1;
    pointer-events: auto;
  }

  .finmind-main {
    padding: 1rem;
  }
}
</style>
