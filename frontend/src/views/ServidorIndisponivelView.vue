<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

// A sessão não pôde ser verificada (servidor lento ou reiniciando): NÃO é "não logado" - o cookie continua válido.
// "Tentar novamente" volta para a página que o usuário pediu; o guard do router verifica a sessão de novo.
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)

async function tentarNovamente() {
  loading.value = true
  try {
    await auth.fetchCurrentUser()
    if (!auth.state.unavailable) await router.replace(route.query.destino || '/')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="d-flex align-items-center justify-content-center vh-100 bg-light px-3">
    <div class="card shadow-sm" style="max-width: 420px; width: 100%">
      <div class="card-body p-4 text-center">
        <h1 class="h4 mb-1">FinMind</h1>
        <p class="text-muted small mb-4">Inteligência de mercado financeiro</p>

        <div class="alert alert-warning small text-start" role="alert">
          <strong>Servidor indisponível no momento.</strong> Ele pode estar reiniciando ou sobrecarregado. Sua sessão
          continua válida: não é preciso entrar de novo.
        </div>

        <button type="button" class="btn btn-primary w-100" :disabled="loading" @click="tentarNovamente">
          {{ loading ? 'Tentando...' : 'Tentar novamente' }}
        </button>
      </div>
    </div>
  </div>
</template>
