<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/layout/AppShell.vue'
import MarkdownConteudo from '../components/MarkdownConteudo.vue'
import DocumentoModal from '../components/DocumentoModal.vue'
import statusProjetoService from '../services/status-projeto.service.js'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const markdown = ref('')

// --- Documento aberto no modal (ADR, reconhecimento de fonte...): o id fica na URL (`?doc=adr-0027`), então o link
// é compartilhável, o F5 reabre o modal e o "voltar" do navegador fecha o modal em vez de sair da página.
// `trilha` = documentos abertos nesta sessão do modal, para o "Voltar para ..." (link de um documento para outro
// troca o conteúdo do mesmo modal, com `replace`, sem empilhar histórico).
const documentoAberto = computed(() => (typeof route.query.doc === 'string' && route.query.doc) || null)
const trilha = ref([])
const anterior = computed(() => (trilha.value.length > 1 ? trilha.value[trilha.value.length - 2] : null))
// Se o modal foi aberto por um clique nesta tela (push), fechar = voltar no histórico; se veio por link direto, tira
// o `doc` da URL (replace).
let abertoPorClique = false

watch(
  documentoAberto,
  (id) => {
    if (!id) {
      trilha.value = []
      abertoPorClique = false
    } else if (trilha.value[trilha.value.length - 1] !== id) {
      trilha.value = [id]
    }
  },
  { immediate: true }
)

function queryCom(doc) {
  const query = { ...route.query }
  delete query.doc
  return doc ? { ...query, doc } : query
}

function abrirDocumento(id) {
  trilha.value = [id]
  abertoPorClique = true
  router.push({ query: queryCom(id) })
}

function navegarDocumento(id) {
  if (id === documentoAberto.value) return
  trilha.value = [...trilha.value, id]
  router.replace({ query: queryCom(id) })
}

function voltarDocumento() {
  trilha.value = trilha.value.slice(0, -1)
  router.replace({ query: queryCom(trilha.value[trilha.value.length - 1]) })
}

function fecharDocumento() {
  if (abertoPorClique) router.back()
  else router.replace({ query: queryCom(null) })
}

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
