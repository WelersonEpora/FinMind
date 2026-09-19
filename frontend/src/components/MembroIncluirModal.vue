<script setup>
import { ref, watch } from 'vue'
import workspaceService from '../services/workspace.service.js'

// Inclui um membro num espaço: o usuário é escolhido numa lista (usuários
// ativos que ainda não estão no espaço - só o owner a recebe) e ganha o papel
// de Editor ou Leitor. A lista é buscada a cada abertura, então nunca fica
// desatualizada em relação a quem já foi incluído.
const props = defineProps({
  open: { type: Boolean, default: false },
  workspaceId: { type: String, required: true }
})

const emit = defineEmits(['close', 'added'])

const candidatos = ref([])
const carregando = ref(false)
const email = ref('')
const papel = ref('viewer')
const salvando = ref(false)
const errorMessage = ref('')

async function carregarCandidatos() {
  carregando.value = true
  try {
    candidatos.value = await workspaceService.listarCandidatos(props.workspaceId)
  } catch (_err) {
    candidatos.value = []
    errorMessage.value = 'Não foi possível carregar a lista de usuários.'
  } finally {
    carregando.value = false
  }
}

watch(
  () => props.open,
  (aberto) => {
    if (!aberto) return
    email.value = ''
    papel.value = 'viewer'
    errorMessage.value = ''
    candidatos.value = []
    carregarCandidatos()
  }
)

async function onSubmit() {
  errorMessage.value = ''
  salvando.value = true

  try {
    const membro = await workspaceService.adicionarMembro(props.workspaceId, { email: email.value, papel: papel.value })
    emit('added', membro)
  } catch (err) {
    errorMessage.value = err.response?.data?.error?.message || 'Não foi possível incluir o membro.'
    // A lista pode ter mudado (alguém já incluiu ou desativou o usuário).
    email.value = ''
    await carregarCandidatos()
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="finmind-modal-backdrop" @click.self="!salvando && emit('close')">
      <div class="modal d-block" tabindex="-1" role="dialog">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title h5">Incluir membro</h2>
              <button type="button" class="btn-close" aria-label="Fechar" @click="emit('close')"></button>
            </div>

            <form @submit.prevent="onSubmit">
              <div class="modal-body">
                <p class="text-muted small">
                  Escolha um usuário que já existe no FinMind. Ele passará a ver este espaço no próprio menu.
                </p>

                <div v-if="!carregando && candidatos.length === 0 && !errorMessage" class="alert alert-info py-2 small">
                  Não há outros usuários ativos para incluir. Só um administrador da plataforma cria usuários (menu
                  Sistema → Usuários); depois de criado, ele aparecerá aqui.
                </div>

                <div class="mb-3">
                  <label for="member-email" class="form-label">Usuário</label>
                  <select
                    id="member-email"
                    v-model="email"
                    class="form-select"
                    required
                    :disabled="carregando || candidatos.length === 0"
                  >
                    <option value="" disabled>{{ carregando ? 'Carregando...' : 'Selecione um usuário' }}</option>
                    <option v-for="candidato in candidatos" :key="candidato.email" :value="candidato.email">
                      {{ candidato.nome }} ({{ candidato.email }})
                    </option>
                  </select>
                </div>

                <div>
                  <label for="member-role" class="form-label">Papel no espaço</label>
                  <select id="member-role" v-model="papel" class="form-select">
                    <option value="viewer">Leitor — só visualiza</option>
                    <option value="editor">Editor — pode alterar os dados</option>
                  </select>
                </div>

                <div v-if="errorMessage" class="alert alert-danger py-2 small mt-3 mb-0">{{ errorMessage }}</div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" :disabled="salvando" @click="emit('close')">
                  Cancelar
                </button>
                <button type="submit" class="btn btn-primary" :disabled="salvando || !email">
                  {{ salvando ? 'Incluindo...' : 'Incluir' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
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
