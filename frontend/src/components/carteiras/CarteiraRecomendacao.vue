<script setup>
import { computed, ref, watch } from 'vue'
import carteirasService from '../../services/carteiras.service.js'
import { RAMOS, consistencia, corDaAcao, formatarData, formatarUsd, nomeAtivo, rotulo } from '../../utils/carteiras.js'

// A recomendação diária da IA (ADR 0127, §4): por ativo, os três ramos (sem posição, se comprado, se vendido), a
// prioridade, o porquê, as evidências e o que invalida a tese. A mesma resposta serve ao operador e à trilha IA, que
// aplica o ramo do estado dela; o motor de risco roda por cima. Nunca preço, stop ou quantidade. "O que foi à IA" mostra
// a instrução, o prompt e cada resposta bruta, como foram.
const props = defineProps({
  recomendacoes: { type: Array, required: true },
  workspaceId: { type: String, required: true },
  carteiraId: { type: String, required: true }
})

const principais = computed(() => props.recomendacoes.filter((r) => r.tipo === 'PRINCIPAL'))
const dataSelecionada = ref(null)
watch(
  principais,
  (lista) => {
    if (!lista.some((r) => r.data === dataSelecionada.value)) dataSelecionada.value = lista[0]?.data ?? null
  },
  { immediate: true }
)

const atual = computed(() => principais.value.find((r) => r.data === dataSelecionada.value) || null)
const replica = computed(() => props.recomendacoes.find((r) => r.tipo === 'REPLICA' && r.data === dataSelecionada.value) || null)
const consistenciaDoDia = computed(() => consistencia(atual.value, replica.value))
const contraria = (ativo, ramo) => (atual.value?.contrarias?.[ativo] || []).includes(ramo)

// "O que foi à IA": carregado sob demanda.
const detalhe = ref(null)
const detalheAberto = ref(false)
const detalheCarregando = ref(false)
const detalheErro = ref('')

watch(dataSelecionada, () => {
  detalhe.value = null
  detalheAberto.value = false
})

async function alternarDetalhe() {
  detalheAberto.value = !detalheAberto.value
  if (!detalheAberto.value || detalhe.value || !atual.value) return
  detalheCarregando.value = true
  detalheErro.value = ''
  try {
    detalhe.value = await carteirasService.obterRecomendacao(props.workspaceId, props.carteiraId, atual.value.id)
  } catch (_err) {
    detalheErro.value = 'Não foi possível carregar o que foi à IA.'
  } finally {
    detalheCarregando.value = false
  }
}
</script>

<template>
  <div>
    <p v-if="!principais.length" class="text-muted">
      Nenhuma recomendação ainda: a primeira sai na decisão da primeira rodada, depois das leituras de tendência do dia.
    </p>
    <template v-else>
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <label for="rec-data" class="small text-muted mb-0">Dia</label>
        <select id="rec-data" v-model="dataSelecionada" class="form-select form-select-sm w-auto">
          <option v-for="r in principais" :key="r.id" :value="r.data">
            {{ formatarData(r.data) }}{{ r.situacao === 'FALHA' ? ' (falhou)' : '' }}
          </option>
        </select>
        <span class="badge" :class="atual.situacao === 'VALIDA' ? 'text-bg-success' : 'text-bg-danger'">{{ rotulo(atual.situacao) }}</span>
        <span class="small text-muted">
          {{ atual.modeloDevolvido || atual.modeloPedido || 'sem modelo' }} · {{ atual.versaoPrompt || '—' }}
          <template v-if="atual.tokens"> · {{ atual.tokens.total.toLocaleString('pt-BR') }} tokens</template>
          · custo {{ formatarUsd(atual.custoUsd) }}
        </span>
      </div>

      <div v-if="atual.situacao === 'FALHA'" class="alert alert-warning small">
        <i class="bi bi-exclamation-triangle me-1"></i>
        {{ rotulo(atual.motivoFalha) }}<template v-if="atual.detalhes?.erro">: {{ atual.detalhes.erro }}</template>.
        Neste dia, a trilha IA ficou no fallback "manter": nenhuma entrada nova; as posições, os stops e os alvos seguiram.
      </div>

      <div v-else class="row g-3">
        <div v-for="r in atual.recomendacoes" :key="r.ativo" class="col-lg-6 col-xxl-4">
          <div class="card h-100">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <h3 class="h6 mb-0">{{ nomeAtivo(r.ativo) }}</h3>
                <span class="badge text-bg-secondary" title="Ordem para novas entradas quando não há vaga para todos">Prioridade {{ r.prioridade }}</span>
              </div>
              <div v-for="ramo in RAMOS" :key="ramo.chave" class="mb-2">
                <div class="d-flex align-items-center gap-2">
                  <span class="small text-muted ramo-nome">{{ ramo.nome }}</span>
                  <span class="badge" :class="corDaAcao(r[ramo.chave].acao)">{{ rotulo(r[ramo.chave].acao) }}</span>
                  <span v-if="contraria(r.ativo, ramo.chave)" class="badge text-bg-warning" title="Contra a tendência da leitura do MÉDIO: marcada e medida, não recusada">contra a leitura</span>
                </div>
                <div class="small">{{ r[ramo.chave].porque }}</div>
              </div>
              <div class="small mt-2"><span class="text-muted">Invalida se:</span> {{ r.invalidaSe }}</div>
              <div class="small mt-1">
                <span class="text-muted">Evidências:</span>
                <span v-for="e in r.evidencias" :key="e" class="badge text-bg-light border ms-1">{{ e }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p v-if="replica" class="small text-muted mt-3 mb-0">
        <i class="bi bi-arrow-repeat me-1"></i>
        Réplica semanal (a mesma entrada, de novo; não decide nada):
        <template v-if="consistenciaDoDia">repetiu {{ consistenciaDoDia.iguais }} de {{ consistenciaDoDia.total }} ramos.</template>
        <template v-else>{{ rotulo(replica.situacao).toLowerCase() }}{{ replica.motivoFalha ? ` (${rotulo(replica.motivoFalha)})` : '' }}.</template>
      </p>

      <div class="mt-3">
        <button type="button" class="btn btn-outline-secondary btn-sm" @click="alternarDetalhe">
          <i class="bi" :class="detalheAberto ? 'bi-chevron-up' : 'bi-chevron-down'"></i> O que foi à IA
        </button>
        <div v-if="detalheAberto" class="mt-2">
          <div v-if="detalheCarregando" class="text-muted small">Carregando...</div>
          <div v-else-if="detalheErro" class="alert alert-danger small">{{ detalheErro }}</div>
          <template v-else-if="detalhe">
            <p v-if="!detalhe.prompt" class="small text-muted">Nada foi à IA neste dia ({{ rotulo(detalhe.motivoFalha) }}).</p>
            <template v-else>
              <h4 class="h6 small text-uppercase text-muted mt-2">Instrução do sistema</h4>
              <pre class="texto-ia">{{ detalhe.instrucao }}</pre>
              <h4 class="h6 small text-uppercase text-muted">Prompt</h4>
              <pre class="texto-ia">{{ detalhe.prompt }}</pre>
              <template v-for="(resposta, i) in detalhe.respostas" :key="i">
                <h4 class="h6 small text-uppercase text-muted">
                  Resposta {{ i + 1 }}<template v-if="resposta.modelo"> ({{ resposta.modelo }})</template>
                  <span v-if="resposta.erros.length" class="badge text-bg-danger ms-1">recusada</span>
                </h4>
                <ul v-if="resposta.erros.length" class="small text-danger">
                  <li v-for="e in resposta.erros" :key="e">{{ e }}</li>
                </ul>
                <pre class="texto-ia">{{ resposta.texto }}</pre>
              </template>
            </template>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ramo-nome {
  min-width: 6.5rem;
}

.texto-ia {
  white-space: pre-wrap;
  font-size: 0.8rem;
  background: var(--bs-tertiary-bg);
  border: 1px solid var(--bs-border-color);
  border-radius: 0.375rem;
  padding: 0.75rem;
  max-height: 24rem;
  overflow: auto;
}
</style>
