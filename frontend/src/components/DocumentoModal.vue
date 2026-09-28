<script setup>
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import MarkdownConteudo from './MarkdownConteudo.vue'
import documentosService from '../services/documentos.service.js'
import { rotuloDoId } from '../utils/documentos.js'

// Um documento do projeto (ADR, reconhecimento de fonte, docs/*.md, CLAUDE.md) num modal da tela "Status do
// projeto". Quem abre, navega e fecha é a tela (o id do documento fica na URL, `?doc=<id>`); o modal só mostra o
// documento de `documentoId`. Um link para outro documento troca o conteúdo DESTE modal (emite `navegar`), e
// `anteriorId` mostra o "voltar" para o documento de onde se veio.
const props = defineProps({
  documentoId: { type: String, default: null },
  anteriorId: { type: String, default: null }
})
const emit = defineEmits(['navegar', 'voltar', 'fechar'])

const carregados = ref({})
const loading = ref(false)
const errorMessage = ref('')

const documento = computed(() => (props.documentoId ? carregados.value[props.documentoId] : null))
const pastaBase = computed(() => (documento.value ? documento.value.caminho.split('/').slice(0, -1).join('/') : ''))
const titulo = computed(() => documento.value?.titulo || rotuloDoId(props.documentoId))
const rotuloAnterior = computed(() => carregados.value[props.anteriorId]?.titulo || rotuloDoId(props.anteriorId))

async function carregar(id) {
  errorMessage.value = ''
  if (!id || carregados.value[id]) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const doc = await documentosService.obterDocumento(id)
    carregados.value = { ...carregados.value, [id]: doc }
  } catch (err) {
    if (id !== props.documentoId) return
    errorMessage.value =
      err?.response?.status === 404
        ? `O documento "${rotuloDoId(id)}" não foi encontrado.`
        : 'Não foi possível carregar o documento.'
  } finally {
    if (id === props.documentoId) loading.value = false
  }
}

watch(() => props.documentoId, carregar, { immediate: true })

// Volta ao topo ao trocar de documento (o conteúdo rola dentro do modal).
const corpo = ref(null)
watch(documento, () => corpo.value?.closest('.p-dialog-content')?.scrollTo?.(0, 0))
</script>

<template>
  <Dialog
    :visible="!!documentoId"
    modal
    maximizable
    dismissable-mask
    :draggable="false"
    :style="{ width: 'min(1100px, 92vw)' }"
    :breakpoints="{ '768px': '100vw' }"
    @update:visible="(visivel) => !visivel && emit('fechar')"
  >
    <template #header>
      <div class="documento-modal__cabecalho">
        <div class="documento-modal__titulo">{{ titulo }}</div>
        <div v-if="documento" class="documento-modal__caminho"><code>{{ documento.caminho }}</code></div>
      </div>
    </template>

    <div ref="corpo">
      <Button
        v-if="anteriorId"
        class="mb-2"
        size="small"
        text
        icon="pi pi-arrow-left"
        :label="`Voltar para ${rotuloAnterior}`"
        @click="emit('voltar')"
      />

      <div v-if="loading && !documento" class="text-muted">Carregando...</div>
      <div v-else-if="errorMessage" class="alert alert-danger mb-0">{{ errorMessage }}</div>
      <MarkdownConteudo
        v-else-if="documento"
        class="documento-modal__conteudo"
        :markdown="documento.markdown"
        :pasta-base="pastaBase"
        @abrir-documento="(id) => emit('navegar', id)"
      />
    </div>
  </Dialog>
</template>

<style scoped>
.documento-modal__cabecalho {
  min-width: 0;
}
.documento-modal__titulo {
  font-size: 1.1rem;
  font-weight: 600;
}
/* O título do documento já está no cabeçalho do modal: o "# título" do markdown não se repete. */
.documento-modal__conteudo > :deep(h1:first-child) {
  display: none;
}
.documento-modal__caminho {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}
</style>
