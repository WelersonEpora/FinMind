<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import userService from '../../services/user.service.js'
import AppAvatar from '../AppAvatar.vue'

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
const photoInput = ref(null)
const uploadingPhoto = ref(false)

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

function selectPhoto() {
  photoInput.value?.click()
}

async function onPhotoSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  uploadingPhoto.value = true
  try {
    const updated = await userService.uploadMyPhoto(file)
    auth.updateUser({ hasPhoto: updated.hasPhoto })
  } catch (_err) {
    // Mensagem genérica é suficiente aqui - o motivo mais comum é formato
    // ou tamanho de arquivo inválido, já coberto pelo texto abaixo.
    profileError.value = 'Não foi possível enviar a foto (use JPEG, PNG ou WebP, até 5MB).'
  } finally {
    uploadingPhoto.value = false
  }
}

async function removePhoto() {
  uploadingPhoto.value = true
  try {
    const updated = await userService.removeMyPhoto()
    auth.updateUser({ hasPhoto: updated.hasPhoto })
  } catch (_err) {
    // Idem - erro de rede/servidor, mensagem genérica basta.
    profileError.value = 'Não foi possível remover a foto.'
  } finally {
    uploadingPhoto.value = false
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
      <AppAvatar :user-id="auth.state.user?.id" :name="auth.state.user?.name" :has-photo="auth.state.user?.hasPhoto" size="sm" />
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
                  <div class="finmind-avatar-edit">
                    <AppAvatar
                      :user-id="auth.state.user?.id"
                      :name="profileForm.name"
                      :has-photo="auth.state.user?.hasPhoto"
                      size="lg"
                    />
                    <button
                      type="button"
                      class="finmind-avatar-action finmind-avatar-action-add"
                      title="Trocar foto"
                      :disabled="uploadingPhoto"
                      @click="selectPhoto"
                    >
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 8a2 2 0 012-2h1l1-2h8l1 2h1a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
                        <circle cx="12" cy="12.5" r="3.2" />
                      </svg>
                    </button>
                    <button
                      v-if="auth.state.user?.hasPhoto"
                      type="button"
                      class="finmind-avatar-action finmind-avatar-action-remove"
                      title="Remover foto"
                      :disabled="uploadingPhoto"
                      @click="removePhoto"
                    >
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h6a1 1 0 001-1V7" />
                      </svg>
                    </button>
                    <label for="profile-photo-input" class="visually-hidden">Foto de perfil</label>
                    <input
                      id="profile-photo-input"
                      ref="photoInput"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      class="d-none"
                      @change="onPhotoSelected"
                    />
                  </div>
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

.finmind-avatar-edit {
  position: relative;
}
.finmind-avatar-action {
  position: absolute;
  bottom: -4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid #dee2e6;
  background: #fff;
  color: #495057;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
}
.finmind-avatar-action:hover {
  background: #f1f3f5;
}
.finmind-avatar-action-add {
  right: -4px;
}
.finmind-avatar-action-remove {
  left: -4px;
}
</style>
