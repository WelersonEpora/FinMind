<script setup>
import { onMounted, reactive, ref } from 'vue'
import AppShell from '../components/layout/AppShell.vue'
import userService from '../services/user.service.js'
import { colorForId, initials } from '../utils/avatar.js'

const loading = ref(true)
const errorMessage = ref('')
const users = ref([])

const modalOpen = ref(false)
const editingUser = ref(null)
const form = reactive({ name: '', email: '', password: '', role: 'colaborador', active: true })
const formError = ref('')
const submitting = ref(false)

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
  return { owner: 'Owner', colaborador: 'Colaborador' }[role] || role
}

function openNewUserModal() {
  editingUser.value = null
  formError.value = ''
  Object.assign(form, { name: '', email: '', password: '', role: 'colaborador', active: true })
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
              <th>Papel</th>
              <th>Status</th>
              <th class="text-end">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>
                <div class="d-flex align-items-center gap-2">
                  <span class="finmind-avatar sz-sm" :style="{ background: colorForId(user.id) }">
                    {{ initials(user.name) }}
                  </span>
                  {{ user.name }}
                </div>
              </td>
              <td>{{ user.email }}</td>
              <td>
                <span class="badge" :class="user.role === 'owner' ? 'text-bg-primary' : 'text-bg-secondary'">
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
                  <span
                    class="finmind-avatar sz-lg"
                    :style="{ background: colorForId(editingUser?.id) }"
                  >
                    {{ initials(form.name) }}
                  </span>
                </div>

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
                  <label for="user-role" class="form-label">Papel</label>
                  <select id="user-role" v-model="form.role" class="form-select">
                    <option value="colaborador">Colaborador</option>
                    <option value="owner">Owner</option>
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
</style>
