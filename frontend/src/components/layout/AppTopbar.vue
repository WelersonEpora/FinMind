<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import userService from '../../services/user.service.js'
import { colorForId, initials } from '../../utils/avatar.js'

defineProps({
  collapsed: { type: Boolean, default: false }
})

const emit = defineEmits(['toggle-menu'])

const router = useRouter()
const auth = useAuthStore()

async function onLogout() {
  await auth.logout()
  router.push('/login')
}

const profileModalOpen = ref(false)
const profileForm = reactive({ name: '', password: '' })
const profileError = ref('')
const savingProfile = ref(false)

function openProfileModal() {
  profileError.value = ''
  profileForm.name = auth.state.user?.name || ''
  profileForm.password = ''
  profileModalOpen.value = true
}

function closeProfileModal() {
  profileModalOpen.value = false
}

async function onSaveProfile() {
  profileError.value = ''
  savingProfile.value = true

  try {
    const payload = { name: profileForm.name }
    if (profileForm.password) payload.password = profileForm.password
    const updated = await userService.updateOwnProfile(payload)
    auth.updateUser({ name: updated.name })
    profileModalOpen.value = false
  } catch (err) {
    profileError.value = err.response?.data?.error?.message || 'Não foi possível salvar seu perfil.'
  } finally {
    savingProfile.value = false
  }
}
</script>

<template>
  <header class="finmind-topbar navbar navbar-light bg-white border-bottom px-3">
    <button
      class="finmind-icon-btn"
      type="button"
      :aria-label="collapsed ? 'Expandir menu' : 'Recolher menu'"
      @click="emit('toggle-menu')"
    >
      <span class="finmind-hamburger"><span></span><span></span><span></span></span>
    </button>

    <div class="d-flex align-items-center gap-2 ms-2">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
        <rect x="1" y="1" width="22" height="22" rx="6" fill="#1B3A6B" />
        <path d="M6 15l4-4 3 3 5-6" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
      <span class="fw-bold">FinMind</span>
    </div>

    <button
      type="button"
      class="btn d-flex align-items-center gap-2 ms-auto me-2 finmind-profile-btn"
      title="Meu perfil"
      @click="openProfileModal"
    >
      <span
        class="finmind-avatar sz-sm"
        :style="{ background: colorForId(auth.state.user?.id) }"
      >
        {{ initials(auth.state.user?.name) }}
      </span>
      <span class="navbar-text d-none d-sm-inline">{{ auth.state.user?.name }}</span>
    </button>
    <button class="btn btn-sm btn-outline-secondary" type="button" @click="onLogout">Sair</button>

    <div v-if="profileModalOpen" class="finmind-modal-backdrop" @click.self="closeProfileModal">
      <div class="modal d-block" tabindex="-1" role="dialog">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title h5">Meu perfil</h2>
              <button type="button" class="btn-close" aria-label="Fechar" @click="closeProfileModal"></button>
            </div>

            <form @submit.prevent="onSaveProfile">
              <div class="modal-body">
                <div class="d-flex justify-content-center mb-3">
                  <span class="finmind-avatar sz-lg" :style="{ background: colorForId(auth.state.user?.id) }">
                    {{ initials(profileForm.name) }}
                  </span>
                </div>

                <div class="mb-3">
                  <label for="profile-name" class="form-label">Nome</label>
                  <input id="profile-name" v-model="profileForm.name" type="text" class="form-control" required autofocus />
                </div>

                <div class="mb-3">
                  <label for="profile-email" class="form-label">E-mail</label>
                  <input id="profile-email" :value="auth.state.user?.email" type="email" class="form-control" disabled />
                </div>

                <div class="mb-3">
                  <label for="profile-password" class="form-label">Nova senha (opcional)</label>
                  <input
                    id="profile-password"
                    v-model="profileForm.password"
                    type="password"
                    class="form-control"
                    minlength="8"
                    autocomplete="new-password"
                    placeholder="Deixe em branco para manter a atual"
                  />
                  <div class="form-text">Mínimo de 8 caracteres.</div>
                </div>

                <div v-if="profileError" class="alert alert-danger py-2 small mb-0">{{ profileError }}</div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" @click="closeProfileModal">Cancelar</button>
                <button type="submit" class="btn btn-primary" :disabled="savingProfile">
                  {{ savingProfile ? 'Salvando...' : 'Salvar' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.finmind-topbar {
  grid-area: topbar;
  height: 64px;
  position: sticky;
  top: 0;
  z-index: 1030;
}

.finmind-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #495057;
  cursor: pointer;
  flex-shrink: 0;
}
.finmind-icon-btn:hover {
  background: #f1f3f5;
}

.finmind-hamburger {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 16px;
}
.finmind-hamburger span {
  height: 2px;
  background: currentColor;
  border-radius: 1px;
}

.finmind-profile-btn {
  border: none;
  background: transparent;
}
.finmind-profile-btn:hover {
  background: #f1f3f5;
}

.finmind-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1055;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
