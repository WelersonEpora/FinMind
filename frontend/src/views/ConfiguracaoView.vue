<script setup>
import { onMounted, ref } from 'vue'
import AppShell from '../components/layout/AppShell.vue'
import ChavesGeminiCard from '../components/ChavesGeminiCard.vue'
import statusService from '../services/status.service.js'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const loading = ref(true)
const errorMessage = ref('')
const status = ref(null)

function badgeClass(moduleStatus) {
  return moduleStatus === 'ok' ? 'text-bg-success' : 'text-bg-secondary'
}

async function carregarStatus() {
  try {
    status.value = await statusService.getStatus()
  } catch (_err) {
    errorMessage.value = 'Não foi possível carregar o status dos módulos.'
  } finally {
    loading.value = false
  }
}

onMounted(carregarStatus)
</script>

<template>
  <AppShell>
    <h1 class="h4 mb-3">Configuração do FinMind</h1>

    <div v-if="loading" class="text-muted">Carregando...</div>

    <div v-else-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <template v-else>
      <ul class="list-group mb-4">
        <li class="list-group-item d-flex justify-content-between align-items-center">
          Banco de dados
          <span class="badge" :class="badgeClass(status.database)">{{ status.database }}</span>
        </li>
        <li class="list-group-item d-flex justify-content-between align-items-center">
          Autenticação
          <span class="badge" :class="badgeClass(status.modules.auth)">{{ status.modules.auth }}</span>
        </li>
        <li class="list-group-item d-flex justify-content-between align-items-center">
          Coleta de dados
          <span class="badge" :class="badgeClass(status.modules.collectors.status)">
            {{ status.modules.collectors.status }} ({{ status.modules.collectors.registered }})
          </span>
        </li>
        <li class="list-group-item d-flex justify-content-between align-items-center">
          Motor analítico
          <span class="badge" :class="badgeClass(status.modules.analyticsEngine.status)">
            {{ status.modules.analyticsEngine.status }} ({{ status.modules.analyticsEngine.ativos }} ativos)
          </span>
        </li>
        <li class="list-group-item d-flex justify-content-between align-items-center">
          Integração com IA
          <span class="badge" :class="badgeClass(status.modules.ai.status)">
            {{ status.modules.ai.status }}
          </span>
        </li>
      </ul>

      <ChavesGeminiCard v-if="auth.state.user?.role === 'admin'" @alterada="carregarStatus" />

      <p class="text-muted small">
        Versão: {{ status.gitCommit }} · Uptime: {{ status.uptimeSeconds }}s
      </p>
    </template>
  </AppShell>
</template>
