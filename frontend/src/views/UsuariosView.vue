<script setup>
import { onMounted, reactive, ref } from 'vue'
import AppShell from '../components/layout/AppShell.vue'
import userService from '../services/user.service.js'
import AppAvatar from '../components/AppAvatar.vue'

const loading = ref(true)
const errorMessage = ref('')
const users = ref([])

const modalOpen = ref(false)
const editingUser = ref(null)
const form = reactive({ name: '', email: '', password: '', role: 'user', active: true })
const formError = ref('')
const submitting = ref(false)
const photoInput = ref(null)
const uploadingPhoto = ref(false)

async function loadUsers() {
  loading.value = true
  errorMessage.value = ''
  try {
    users.value = await userService.listUsers()
  } catch (_err) {
    errorMessage.value = 'Não foi possível carregar os usuários.'
  } finally {
    loading.value = false
  }
}

function roleLabel(role) {
  return { admin: 'Administrador', user: 'Usuário' }[role] || role
}

function openNewUserModal() {
  editingUser.value = null
  formError.value = ''
  Object.assign(form, { name: '', email: '', password: '', role: 'user', active: true })
  modalOpen.value = true
}

function openEditUserModal(user) {
  editingUser.value = user
  formError.value = ''
  Object.assign(form, { name: user.name, email: user.email, password: '', role: user.role, active: user.active })
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
}

async function onSubmit() {
  formError.value = ''
  submitting.value = true

  try {
    if (editingUser.value) {
      const payload = { name: form.name, email: form.email, role: form.role, active: form.active }
      if (form.password) payload.password = form.password
      await userService.updateUser(editingUser.value.id, payload)
    } else {
      await userService.createUser({ name: form.name, email: form.email, password: form.password, role: form.role })
    }
    modalOpen.value = false
    await loadUsers()
  } catch (err) {
    formError.value = err.response?.data?.error?.message || 'Não foi possível salvar o usuário.'
  } finally {
    submitting.value = false
  }
}

function selectPhoto() {
  photoInput.value?.click()
}

async function onPhotoSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !editingUser.value) return

  uploadingPhoto.value = true
  try {
    const updated = await userService.uploadUserPhoto(editingUser.value.id, file)
    editingUser.value = updated
    await loadUsers()
  } catch (_err) {
    // Mensagem genérica - motivo mais comum é formato/tamanho inválido.
    formError.value = 'Não foi possível enviar a foto (use JPEG, PNG ou WebP, até 5MB).'
  } finally {
    uploadingPhoto.value = false
  }
}

async function removePhoto() {
  if (!editingUser.value) return

  uploadingPhoto.value = true
  try {
    const updated = await userService.removeUserPhoto(editingUser.value.id)
    editingUser.value = updated
    await loadUsers()
  } catch (_err) {
    // Erro de rede/servidor - mensagem genérica basta.
    formError.value = 'Não foi possível remover a foto.'
  } finally {
    uploadingPhoto.value = false
  }
}

onMounted(loadUsers)
</script>

<template>
  <AppShell>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h1 class="h4 mb-0">Usuários</h1>
      <button type="button" class="btn btn-primary" @click="openNewUserModal">+ Novo usuário</button>
    </div>

    <div v-if="loading" class="text-muted">Carregando...</div>
    <div v-else-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <div v-else class="card">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel na plataforma</th>
              <th>Status</th>
              <th class="text-end">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>
                <div class="d-flex align-items-center gap-2">
                  <AppAvatar :user-id="user.id" :name="user.name" :has-photo="user.hasPhoto" size="sm" />
                  {{ user.name }}
                </div>
              </td>
              <td>{{ user.email }}</td>
              <td>
                <span class="badge" :class="user.role === 'admin' ? 'text-bg-primary' : 'text-bg-secondary'">
                  {{ roleLabel(user.role) }}
                </span>
              </td>
              <td>
                <span class="badge" :class="user.active ? 'text-bg-success' : 'text-bg-secondary'">
                  {{ user.active ? 'Ativo' : 'Inativo' }}
                </span>
              </td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="openEditUserModal(user)">
                  Editar
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!users.length" class="text-muted text-center py-4">Nenhum usuário cadastrado ainda.</div>
      </div>
    </div>

    <div v-if="modalOpen" class="finmind-modal-backdrop" @click.self="closeModal">
      <div class="modal d-block" tabindex="-1" role="dialog">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title h5">{{ editingUser ? 'Editar usuário' : 'Novo usuário' }}</h2>
              <button type="button" class="btn-close" aria-label="Fechar" @click="closeModal"></button>
            </div>

            <form @submit.prevent="onSubmit">
              <div class="modal-body">
                <div class="d-flex justify-content-center mb-3">
                  <div class="finmind-avatar-edit">
                    <AppAvatar :user-id="editingUser?.id" :name="form.name" :has-photo="editingUser?.hasPhoto" size="lg" />
                    <template v-if="editingUser">
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
                        v-if="editingUser.hasPhoto"
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
                      <label for="user-photo-input" class="visually-hidden">Foto do usuário</label>
                      <input
                        id="user-photo-input"
                        ref="photoInput"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        class="d-none"
                        @change="onPhotoSelected"
                      />
                    </template>
                  </div>
                </div>
                <p v-if="!editingUser" class="text-muted small text-center mb-3">
                  A foto pode ser adicionada depois de criar o usuário.
                </p>

                <div class="mb-3">
                  <label for="user-name" class="form-label">Nome</label>
                  <input id="user-name" v-model="form.name" type="text" class="form-control" required autofocus />
                </div>

                <div class="mb-3">
                  <label for="user-email" class="form-label">E-mail</label>
                  <input id="user-email" v-model="form.email" type="email" class="form-control" required />
                </div>

                <div class="mb-3">
                  <label for="user-password" class="form-label">
                    {{ editingUser ? 'Nova senha (opcional)' : 'Senha' }}
                  </label>
                  <input
                    id="user-password"
                    v-model="form.password"
                    type="password"
                    class="form-control"
                    minlength="8"
                    autocomplete="new-password"
                    :required="!editingUser"
                    :placeholder="editingUser ? 'Deixe em branco para manter a atual' : ''"
                  />
                  <div class="form-text">Mínimo de 8 caracteres.</div>
                </div>

                <div class="mb-3">
                  <label for="user-role" class="form-label">Papel na plataforma</label>
                  <select id="user-role" v-model="form.role" class="form-select">
                    <option value="user">Usuário</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <div v-if="editingUser" class="form-check">
                  <input id="user-active" v-model="form.active" type="checkbox" class="form-check-input" />
                  <label for="user-active" class="form-check-label">Conta ativa</label>
                </div>

                <div v-if="formError" class="alert alert-danger py-2 small mt-3 mb-0">{{ formError }}</div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" @click="closeModal">Cancelar</button>
                <button type="submit" class="btn btn-primary" :disabled="submitting">
                  {{ submitting ? 'Salvando...' : 'Salvar' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
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
