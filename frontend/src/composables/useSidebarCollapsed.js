import { ref, watch } from 'vue'

// Estado global (singleton), não local ao componente: cada View inclui seu
// próprio <AppShell> (não há um layout único envolvendo o router-view), então
// sem isso a sidebar "esqueceria" que estava recolhida a cada navegação.
// Persistido em localStorage pra sobreviver a um F5 também.
const STORAGE_KEY = 'finmind:sidebar-collapsed'

function readInitial() {
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

const collapsed = ref(readInitial())

watch(collapsed, (value) => localStorage.setItem(STORAGE_KEY, String(value)))

export function useSidebarCollapsed() {
  return collapsed
}
