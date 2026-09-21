<script setup>
import { computed, onMounted, ref } from 'vue'
import AppShell from '../components/layout/AppShell.vue'
import statusProjetoService from '../services/status-projeto.service.js'
import { renderizarMarkdown } from '../utils/markdown.js'

const loading = ref(true)
const errorMessage = ref('')
const markdown = ref('')

const html = computed(() => renderizarMarkdown(markdown.value))

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
      visível a todos os usuários nesta fase de desenvolvimento.
    </p>

    <div v-if="loading" class="text-muted">Carregando...</div>

    <div v-else-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <!-- eslint-disable-next-line vue/no-v-html -->
    <article v-else class="card card-body finmind-markdown" v-html="html"></article>
  </AppShell>
</template>

<style scoped>
.finmind-markdown {
  max-width: 1100px;
}

/* O conteúdo vem de v-html, então o CSS scoped precisa de :deep. */
.finmind-markdown :deep(h1) {
  font-size: 1.5rem;
  margin-bottom: 1rem;
}
.finmind-markdown :deep(h2) {
  font-size: 1.25rem;
  margin-top: 1.75rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--bs-border-color, #dee2e6);
}
.finmind-markdown :deep(h3) {
  font-size: 1.05rem;
  margin-top: 1.25rem;
}
.finmind-markdown :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}
.finmind-markdown :deep(th),
.finmind-markdown :deep(td) {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--bs-border-color, #dee2e6);
  vertical-align: top;
}
.finmind-markdown :deep(th) {
  background: var(--bs-tertiary-bg, #f8f9fa);
  text-align: left;
}
.finmind-markdown :deep(blockquote) {
  margin: 0 0 1rem;
  padding: 0.5rem 1rem;
  border-left: 4px solid #2c4a75;
  background: var(--bs-tertiary-bg, #f8f9fa);
}
/* Seções recolhíveis (<details>): fechadas por padrão, título clicável. */
.finmind-markdown :deep(details) {
  margin-bottom: 1rem;
  border: 1px solid var(--bs-border-color, #dee2e6);
  border-radius: 0.375rem;
  padding: 0.5rem 0.9rem;
}
.finmind-markdown :deep(summary) {
  cursor: pointer;
  font-weight: 600;
}
.finmind-markdown :deep(details[open] > summary) {
  margin-bottom: 0.75rem;
}
.finmind-markdown :deep(code) {
  font-size: 0.85em;
}
.finmind-markdown :deep(pre) {
  overflow-x: auto;
}
</style>
