<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const errorMessage = ref('')
const loading = ref(false)

async function onSubmit() {
  errorMessage.value = ''
  loading.value = true

  try {
    await auth.login(email.value, password.value)
    router.push('/')
  } catch (err) {
    errorMessage.value =
      err.response?.data?.error?.message || 'Não foi possível entrar. Verifique suas credenciais.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="d-flex align-items-center justify-content-center vh-100 bg-light px-3">
    <div class="card shadow-sm" style="max-width: 380px; width: 100%">
      <div class="card-body p-4">
        <h1 class="h4 mb-1 text-center">FinMind</h1>
        <p class="text-muted text-center small mb-4">Inteligência de mercado financeiro</p>

        <form @submit.prevent="onSubmit">
          <div class="mb-3">
            <label for="email" class="form-label">E-mail</label>
            <input
              id="email"
              v-model="email"
              type="email"
              class="form-control"
              autocomplete="username"
              required
            />
          </div>

          <div class="mb-3">
            <label for="password" class="form-label">Senha</label>
            <input
              id="password"
              v-model="password"
              type="password"
              class="form-control"
              autocomplete="current-password"
              required
            />
          </div>

          <div v-if="errorMessage" class="alert alert-danger py-2 small" role="alert">
            {{ errorMessage }}
          </div>

          <button type="submit" class="btn btn-primary w-100" :disabled="loading">
            {{ loading ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
