<script setup>
import { onMounted, ref } from 'vue'
import AppShell from '../components/layout/AppShell.vue'
import dashboardService from '../services/dashboard.service.js'

const loading = ref(true)
const errorMessage = ref('')
const dashboard = ref(null)

onMounted(async () => {
  try {
    dashboard.value = await dashboardService.getDashboard()
  } catch (_err) {
    errorMessage.value = 'Não foi possível carregar o dashboard.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <AppShell>
    <h1 class="h4 mb-3">Dashboard</h1>

    <div v-if="loading" class="text-muted">Carregando...</div>

    <div v-else-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <template v-else>
      <output class="alert alert-info d-block">
        {{ dashboard.message }}
      </output>

      <div class="row g-3">
        <div v-for="card in dashboard.cards" :key="card.id" class="col-12 col-sm-6 col-lg-3">
          <div class="card h-100 finmind-placeholder-card">
            <div class="card-body">
              <h2 class="h6 mb-2">{{ card.title }}</h2>
              <p class="text-muted small mb-0">{{ card.placeholder }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </AppShell>
</template>
