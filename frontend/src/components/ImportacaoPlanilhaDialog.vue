<script setup>
// Importação de planilha de um observável que não tem coleta automática (hoje, o Indicador do Café Arábica do Cepea,
// exportado à mão do site, ADR 0146). Genérico: a rota, o tipo de arquivo e a instrução vêm do catálogo
// (`observavel.importacao`). O desenho veio do upload de planilhas do Cepea do AgroMind.
import { ref } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import observaveisService from '../services/observaveis.service.js'
import { resumoImportacao } from '../utils/importacao-planilha.js'

const props = defineProps({ importacao: { type: Object, required: true } })
const visivel = defineModel('visivel', { type: Boolean, default: false })
const emit = defineEmits(['importado'])

const arquivos = ref([])
const enviando = ref(false)
const erro = ref('')
const resultado = ref(null)
const campoArquivo = ref(null)

function limpar() {
  arquivos.value = []
  erro.value = ''
  resultado.value = null
  if (campoArquivo.value) campoArquivo.value.value = ''
}

function aoEscolher(evento) {
  arquivos.value = [...(evento.target.files || [])]
  erro.value = ''
  resultado.value = null
}

async function enviar() {
  if (arquivos.value.length === 0) return
  enviando.value = true
  erro.value = ''
  resultado.value = null
  try {
    const { importacao } = await observaveisService.importarPlanilha(props.importacao.rota, arquivos.value)
    resultado.value = importacao
    emit('importado')
  } catch (err) {
    erro.value = err.response?.data?.error?.message || 'Não foi possível importar a planilha agora.'
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visivel" modal header="Importar planilha" :style="{ width: '32rem' }" :breakpoints="{ '640px': '95vw' }" @hide="limpar">
    <p class="small text-muted">{{ importacao.instrucao }}</p>
    <input ref="campoArquivo" type="file" class="form-control form-control-sm" :accept="importacao.aceita" multiple @change="aoEscolher" />

    <div v-if="erro" class="alert alert-danger small py-2 mt-3 mb-0">{{ erro }}</div>
    <div v-if="resultado" class="alert small py-2 mt-3 mb-0" :class="resultado.status === 'success' ? 'alert-success' : 'alert-warning'">
      {{ resumoImportacao(resultado) }}
    </div>

    <template #footer>
      <Button label="Fechar" text @click="visivel = false" />
      <Button label="Importar" icon="pi pi-upload" :loading="enviando" :disabled="arquivos.length === 0" @click="enviar" />
    </template>
  </Dialog>
</template>
