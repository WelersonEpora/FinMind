<script setup>
import { computed, ref, watch } from 'vue'

// Modal de confirmação de ação destrutiva. Com `requireText`, o botão só
// habilita depois que o usuário digita exatamente esse texto (ex.: o nome do
// espaço a excluir) - confirmar um "Sim" solto é fácil demais para algo
// irreversível.
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  confirmLabel: { type: String, default: 'Confirmar' },
  busy: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
  requireText: { type: String, default: '' }
})

const emit = defineEmits(['close', 'confirm'])

const typed = ref('')

watch(
  () => props.open,
  (aberto) => {
    if (aberto) typed.value = ''
  }
)

const canConfirm = computed(() => !props.busy && (!props.requireText || typed.value.trim() === props.requireText))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="finmind-modal-backdrop" @click.self="!busy && emit('close')">
      <div class="modal d-block" tabindex="-1" role="alertdialog">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title h5">{{ title }}</h2>
              <button type="button" class="btn-close" aria-label="Fechar" :disabled="busy" @click="emit('close')"></button>
            </div>

            <form @submit.prevent="canConfirm && emit('confirm')">
              <div class="modal-body">
                <slot />

                <div v-if="requireText" class="mt-3">
                  <label for="confirm-text" class="form-label">
                    Para confirmar, digite <strong>{{ requireText }}</strong>
                  </label>
                  <input
                    id="confirm-text"
                    v-model="typed"
                    type="text"
                    class="form-control"
                    autocomplete="off"
                    autofocus
                  />
                </div>

                <div v-if="errorMessage" class="alert alert-danger py-2 small mt-3 mb-0">{{ errorMessage }}</div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" :disabled="busy" @click="emit('close')">
                  Cancelar
                </button>
                <button type="submit" class="btn btn-danger" :disabled="!canConfirm">
                  {{ busy ? 'Aguarde...' : confirmLabel }}
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
