<script setup>
import { ref, watch } from 'vue'
import metodologiaAtivoService from '../../services/metodologia-ativo.service.js'

// O prompt diário de análise do ativo numa data (ADR 0051): a instrução do sistema (fixa, versionada) e o prompt do dia
// (a base e a leitura do motor), como a IA de tendência os recebe (ADR 0052). Gerado pelo backend; a tela só mostra:
// nenhuma IA é chamada daqui.
const props = defineProps({
  ativo: { type: String, required: true },
  data: { type: String, required: true }
})

const loading = ref(true)
const errorMessage = ref('')
const prompt = ref(null)
const copiado = ref(false)

async function carregar() {
  loading.value = true
  errorMessage.value = ''
  try {
    const { promptDiario } = await metodologiaAtivoService.getPromptDiario(props.ativo, props.data)
    prompt.value = promptDiario
  } catch (err) {
    errorMessage.value = err?.response?.data?.error?.message || 'Não foi possível montar o prompt desta data.'
  } finally {
    loading.value = false
  }
}

watch(() => [props.ativo, props.data], carregar, { immediate: true })

function textoCompleto() {
  return `${prompt.value.instrucaoDoSistema}\n\n${prompt.value.prompt}`
}

async function copiar() {
  try {
    await navigator.clipboard.writeText(textoCompleto())
    copiado.value = true
    setTimeout(() => {
      copiado.value = false
    }, 2000)
  } catch (_err) {
    errorMessage.value = 'Não foi possível copiar o texto: selecione e copie manualmente.'
  }
}
</script>

<template>
  <div class="prompt-diario">
    <div v-if="loading" class="text-muted">Montando o prompt...</div>
    <div v-else-if="errorMessage && !prompt" class="alert alert-danger mb-0">{{ errorMessage }}</div>
    <template v-else-if="prompt">
      <div v-if="errorMessage" class="alert alert-danger py-2">{{ errorMessage }}</div>
      <div class="prompt-diario__acoes">
        <span class="text-muted small">
          Prompt {{ prompt.versaoPrompt }} · metodologia {{ prompt.versaoMetodologia }} · configuração v{{ prompt.versaoConfiguracao }}
          · {{ textoCompleto().length.toLocaleString('pt-BR') }} caracteres · hash {{ prompt.hashEntrada.slice(0, 12) }}
        </span>
        <button type="button" class="btn btn-outline-secondary btn-sm" @click="copiar">
          <i class="bi" :class="copiado ? 'bi-check2' : 'bi-clipboard'"></i> {{ copiado ? 'Copiado' : 'Copiar' }}
        </button>
      </div>
      <p class="prompt-diario__aviso">
        O mesmo prompt que a leitura diária de tendência envia à IA, montado para esta data com o que se sabia até o fim dela.
        A leitura do dia aparece no Centro de Decisão.
      </p>

      <h4 class="prompt-diario__titulo">Instrução do sistema <small>fixa: papel, como analisar, limites e formato da resposta</small></h4>
      <pre class="prompt-diario__texto">{{ prompt.instrucaoDoSistema }}</pre>

      <h4 class="prompt-diario__titulo">Prompt do dia <small>a base e a leitura do motor, com o que se sabia até o fim da data</small></h4>
      <pre class="prompt-diario__texto">{{ prompt.prompt }}</pre>
    </template>
  </div>
</template>

<style scoped>
.prompt-diario {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.prompt-diario__acoes {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.prompt-diario__aviso {
  margin: 0;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.prompt-diario__titulo {
  margin: 0.5rem 0 0;
  font-size: 0.95rem;
}

.prompt-diario__titulo small {
  margin-left: 0.4rem;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
}

.prompt-diario__texto {
  margin: 0;
  padding: 0.85rem;
  white-space: pre-wrap;
  border-radius: 8px;
  background: rgba(19, 33, 59, 0.05);
  font-size: 0.78rem;
  line-height: 1.5;
}
</style>
