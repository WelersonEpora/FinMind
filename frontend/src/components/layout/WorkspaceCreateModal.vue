<script setup>
import { ref, watch } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace.js'

const props = defineProps({
  open: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'created'])

const workspaces = useWorkspaceStore()

const nome = ref('')
const errorMessage = ref('')
const saving = ref(false)

// Cada abertura começa limpa.
watch(
  () => props.open,
  (aberto) => {
    if (aberto) {
      nome.value = ''
      errorMessage.value = ''
    }
  }
)

async function onSubmit() {
  errorMessage.value = ''
  saving.value = true

  try {
    const espaco = await workspaces.create(nome.value)
    emit('created', espaco)
  } catch (err) {
    errorMessage.value = err.response?.data?.error?.message || 'Não foi possível criar o espaço.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <!-- Teleport: a topbar é sticky com z-index próprio; o modal precisa
       ficar acima de todo o resto da página. -->
  <Teleport to="body">
    <div v-if="open" class="finmind-modal-backdrop" @click.self="emit('close')">
      <div class="modal d-block" tabindex="-1" role="dialog">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title h5">Criar espaço</h2>
              <button type="button" class="btn-close" aria-label="Fechar" @click="emit('close')"></button>
            </div>

            <form @submit.prevent="onSubmit">
              <div class="modal-body">
                <p class="text-muted small">
                  Um espaço reúne os dados patrimoniais de uma pessoa, família ou cliente. Você será o proprietário e
                  poderá adicionar outros usuários depois.
                </p>

                <label for="workspace-name" class="form-label">Nome do espaço</label>
                <input
                  id="workspace-name"
                  v-model="nome"
                  type="text"
                  class="form-control"
                  maxlength="120"
                  required
                  autofocus
                  placeholder="Ex.: Família Souza"
                />

                <div v-if="errorMessage" class="alert alert-danger py-2 small mt-3 mb-0">{{ errorMessage }}</div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" @click="emit('close')">Cancelar</button>
                <button type="submit" class="btn btn-primary" :disabled="saving || !nome.trim()">
                  {{ saving ? 'Criando...' : 'Criar espaço' }}
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
