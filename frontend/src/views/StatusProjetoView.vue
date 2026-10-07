<script setup>
import { onMounted, ref } from 'vue'
import AppShell from '../components/layout/AppShell.vue'
import MarkdownConteudo from '../components/MarkdownConteudo.vue'
import DocumentoModal from '../components/DocumentoModal.vue'
import statusProjetoService from '../services/status-projeto.service.js'
import { useDocumentoNaUrl } from '../composables/useDocumentoNaUrl.js'

const loading = ref(true)
const errorMessage = ref('')
const markdown = ref('')

// Documento aberto no modal (ADR, reconhecimento de fonte...), com o id na URL (`?doc=adr-0027`).
const { documentoAberto, anterior, abrirDocumento, navegarDocumento, voltarDocumento, fecharDocumento } =
  useDocumentoNaUrl()

onMounted(async () => {
  try {
    const statusProjeto = await statusProjetoService.getStatusProjeto()
    markdown.value = statusProjeto.markdown
  } catch (_err) {
    errorMessage.value = 'Não foi possível carregar o status do projeto.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <AppShell>
    <h1 class="h4 mb-1">Status do projeto</h1>
    <p class="text-muted small mb-3">
      Reflete o arquivo <code>STATUS_DO_PROJETO.md</code> do repositório, atualizado a cada entrega. Tela temporária,
      visível a todos os usuários nesta fase de desenvolvimento. As menções a ADRs e documentos (sublinhado
      pontilhado) abrem o documento aqui mesmo.
    </p>

    <div v-if="loading" class="text-muted">Carregando...</div>

    <div v-else-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <MarkdownConteudo v-else class="card card-body" :markdown="markdown" @abrir-documento="abrirDocumento" />

    <DocumentoModal
      :documento-id="documentoAberto"
      :anterior-id="anterior"
      @navegar="navegarDocumento"
      @voltar="voltarDocumento"
      @fechar="fecharDocumento"
    />
  </AppShell>
</template>

<style scoped>
.finmind-markdown {
  max-width: 1100px;
}
</style>
