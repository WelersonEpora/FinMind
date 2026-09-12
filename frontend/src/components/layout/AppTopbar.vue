<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'

const router = useRouter()
const auth = useAuthStore()

defineEmits(['toggle-sidebar'])

async function onLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <header class="navbar navbar-light bg-white border-bottom px-3">
    <button
      class="btn btn-outline-secondary d-md-none me-2"
      type="button"
      aria-label="Abrir menu"
      @click="$emit('toggle-sidebar')"
    >
      <span class="navbar-toggler-icon"></span>
    </button>

    <span class="navbar-text ms-auto me-3">{{ auth.state.user?.name }}</span>
    <button class="btn btn-sm btn-outline-secondary" type="button" @click="onLogout">Sair</button>
  </header>
</template>
