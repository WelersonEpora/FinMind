<script setup>
import { onMounted, reactive, ref } from 'vue'
import configuracaoIaService from '../services/configuracao-ia.service.js'

// As chaves do Gemini da plataforma (ADR 0156), só para o admin: a gratuita é tentada primeiro e a paga é a reserva
// (e a única da recomendação das carteiras). Quem paga a IA é o dono da chave paga, pelo projeto dela no Google.
const emit = defineEmits(['alterada'])

const TIPOS = [
  { tipo: 'gratuita', rotulo: 'Chave gratuita', ajuda: 'Tentada primeiro em todas as leituras da IA.' },
  { tipo: 'paga', rotulo: 'Chave paga', ajuda: 'Reserva quando a gratuita falha; a única da recomendação das carteiras. A cobrança vai para o projeto do Google dono desta chave.' }
]

const loading = ref(true)
const errorMessage = ref('')
const situacao = ref(null)
const novas = reactive({ gratuita: '', paga: '' })
const salvando = reactive({ gratuita: false, paga: false })
const mensagens = reactive({ gratuita: null, paga: null })

function formatarData(iso) {
  return iso ? new Date(iso).toLocaleString('pt-BR') : '-'
}

async function carregar() {
  try {
    situacao.value = await configuracaoIaService.obter()
  } catch (_err) {
    errorMessage.value = 'Não foi possível carregar as chaves do Gemini.'
  } finally {
    loading.value = false
  }
}

async function executar(tipo, acao, sucesso) {
  salvando[tipo] = true
  mensagens[tipo] = null
  try {
    situacao.value = await acao()
    novas[tipo] = ''
    mensagens[tipo] = { classe: 'text-success', texto: sucesso }
    emit('alterada')
  } catch (err) {
    mensagens[tipo] = { classe: 'text-danger', texto: err.response?.data?.error?.message || 'Não foi possível concluir.' }
  } finally {
    salvando[tipo] = false
  }
}

function salvar(tipo) {
  return executar(tipo, () => configuracaoIaService.salvarChave(tipo, novas[tipo]), 'Chave testada no Gemini e salva.')
}

function remover(tipo) {
  if (!window.confirm('Remover esta chave? As leituras da IA que dependem dela param até uma nova ser cadastrada.')) return
  return executar(tipo, () => configuracaoIaService.removerChave(tipo), 'Chave removida.')
}

onMounted(carregar)
</script>

<template>
  <div class="card mb-4">
    <div class="card-body">
      <h2 class="h6 mb-1">Chaves do Gemini</h2>
      <p class="text-muted small mb-3">
        Uma chave para toda a plataforma, criada no
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>.
        Ao salvar, a chave é testada no Gemini e guardada cifrada; ela nunca é mostrada de volta.
      </p>

      <div v-if="loading" class="text-muted small">Carregando...</div>
      <div v-else-if="errorMessage" class="alert alert-danger mb-0">{{ errorMessage }}</div>

      <template v-else>
        <div v-if="!situacao.cifraDisponivel" class="alert alert-warning small">
          O servidor não tem <code>CONFIG_ENCRYPTION_KEY</code> no <code>.env</code>: sem ela, nenhuma chave pode ser salva.
        </div>

        <div v-for="item in TIPOS" :key="item.tipo" class="mb-3">
          <div class="d-flex justify-content-between align-items-baseline">
            <label class="form-label fw-semibold mb-1" :for="`chave-${item.tipo}`">{{ item.rotulo }}</label>
            <span v-if="situacao.chaves[item.tipo].configurada" class="badge text-bg-success">
              Cadastrada · final {{ situacao.chaves[item.tipo].final }}
            </span>
            <span v-else class="badge text-bg-secondary">Não cadastrada</span>
          </div>
          <div class="form-text mt-0 mb-1">
            {{ item.ajuda }}
            <template v-if="situacao.chaves[item.tipo].configurada">
              Alterada em {{ formatarData(situacao.chaves[item.tipo].atualizadaEm) }}<template v-if="situacao.chaves[item.tipo].atualizadaPor"> por {{ situacao.chaves[item.tipo].atualizadaPor }}</template>.
            </template>
          </div>
          <form class="d-flex gap-2" @submit.prevent="salvar(item.tipo)">
            <input
              :id="`chave-${item.tipo}`"
              v-model="novas[item.tipo]"
              type="password"
              class="form-control form-control-sm"
              autocomplete="off"
              :placeholder="situacao.chaves[item.tipo].configurada ? 'Nova chave para substituir' : 'Cole a chave'"
              :disabled="!situacao.cifraDisponivel || salvando[item.tipo]"
            />
            <button type="submit" class="btn btn-sm btn-primary text-nowrap" :disabled="!novas[item.tipo].trim() || salvando[item.tipo]">
              {{ salvando[item.tipo] ? 'Testando...' : 'Testar e salvar' }}
            </button>
            <button
              v-if="situacao.chaves[item.tipo].configurada"
              type="button"
              class="btn btn-sm btn-outline-danger"
              :disabled="salvando[item.tipo]"
              @click="remover(item.tipo)"
            >
              Remover
            </button>
          </form>
          <div v-if="mensagens[item.tipo]" class="small mt-1" :class="mensagens[item.tipo].classe">{{ mensagens[item.tipo].texto }}</div>
        </div>

        <p class="text-muted small mb-0">
          O modelo usado e os preços da recomendação continuam no <code>.env</code> do servidor.
        </p>
      </template>
    </div>
  </div>
</template>
