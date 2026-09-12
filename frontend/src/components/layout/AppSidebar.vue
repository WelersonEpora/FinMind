<script setup>
defineProps({
  collapsed: { type: Boolean, default: false }
})

const emit = defineEmits(['navigate'])

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/configuracao', label: 'Configuração' }
]

const futureLinks = ['Ativos', 'Análises', 'Sinais', 'Resultados']
</script>

<template>
  <nav
    class="finmind-sidebar bg-dark text-white d-flex flex-column"
    :class="{ 'finmind-sidebar-collapsed': collapsed }"
  >
    <div class="px-3 py-3 border-bottom border-secondary">
      <span class="fw-bold">FinMind</span>
    </div>

    <ul class="nav nav-pills flex-column mb-auto p-2">
      <li v-for="link in links" :key="link.to" class="nav-item">
        <router-link
          :to="link.to"
          class="nav-link text-white"
          active-class="active"
          @click="emit('navigate')"
        >
          {{ link.label }}
        </router-link>
      </li>
    </ul>

    <div class="px-3 py-2 text-uppercase text-secondary small">Módulos futuros</div>
    <ul class="nav flex-column p-2">
      <li v-for="item in futureLinks" :key="item" class="nav-item">
        <span class="nav-link text-secondary disabled" title="Aguardando definições do especialista">
          {{ item }}
        </span>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.finmind-sidebar {
  width: 240px;
  min-height: 100vh;
}

@media (max-width: 767.98px) {
  .finmind-sidebar {
    width: 100%;
    min-height: auto;
  }
}
</style>
