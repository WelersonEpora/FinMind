<script setup>
import { computed, ref, watch } from 'vue'
import LineChart from '../charts/LineChart.vue'
import DecisaoEstoquesPetroleo from './DecisaoEstoquesPetroleo.vue'
import metodologiaAtivoService from '../../services/metodologia-ativo.service.js'
import { formatarValor } from '../../utils/observaveis-format.js'
import { PERIODOS_CALCULO, desdeDoPeriodo, seriesEstoquesPetroleo } from '../../utils/metodologia.js'

// A proposta do fator de estoques calculada (ADR 0050), com as mesmas letras do "Como medir": A. Medir (o estoque e
// a variação da semana) e B. Ler (a média da mesma semana nos 5 anos anteriores e o desvio contra ela) neste card; a
// C. Decidir (simulação, com parâmetros ajustáveis) no card de baixo. Só o que entra na conta do fator: o preço fica
// de fora.
const props = defineProps({
  ativo: { type: String, required: true },
  fator: { type: String, required: true }
})

const SERIES_LABELS = { estoque: 'Estoque (A)', media5Anos: 'Média de 5 anos (B)' }

const periodo = ref('3A')
const loading = ref(true)
const errorMessage = ref('')
const calculo = ref(null)
const parametros = ref(null)
const simulando = ref(false)

function hojeLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Na 1ª carga a seção mostra "Calculando..."; ao trocar o período ou simular, o conteúdo fica na tela até a resposta.
async function carregar() {
  if (calculo.value) simulando.value = true
  else loading.value = true
  errorMessage.value = ''
  try {
    const desde = desdeDoPeriodo(periodo.value, hojeLocal())
    const { calculo: payload } = await metodologiaAtivoService.getCalculoFator(props.ativo, props.fator, {
      desde,
      parametros: parametros.value
    })
    calculo.value = payload
  } catch (err) {
    errorMessage.value = err?.response?.data?.error?.message || 'Não foi possível calcular a proposta deste fator.'
  } finally {
    loading.value = false
    simulando.value = false
  }
}

function simular(novos) {
  parametros.value = novos
  carregar()
}

watch(periodo, carregar)
watch(
  () => props.fator,
  () => {
    calculo.value = null
    parametros.value = null
    carregar()
  },
  { immediate: true }
)

const linhas = computed(() => seriesEstoquesPetroleo(calculo.value?.pontos))
const ultimo = computed(() => calculo.value?.pontos.at(-1) || null)

function sinalizado(valor, casas) {
  if (valor === null || valor === undefined) return '-'
  return `${valor > 0 ? '+' : ''}${formatarValor(valor, casas)}`
}

function dataBr(iso) {
  return iso ? iso.split('-').reverse().join('/') : '-'
}
</script>

<template>
  <section class="calculo">
    <div class="calculo__topo">
      <h4>Proposta calculada <small>a receita do "Como medir" aplicada aos dados</small></h4>
      <div class="btn-group btn-group-sm" role="group" aria-label="Período">
        <button
          v-for="p in PERIODOS_CALCULO"
          :key="p.codigo"
          type="button"
          class="btn"
          :class="periodo === p.codigo ? 'btn-secondary' : 'btn-outline-secondary'"
          @click="periodo = p.codigo"
        >
          {{ p.rotulo }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-muted">Calculando...</div>
    <div v-else-if="errorMessage && !calculo" class="alert alert-danger mb-0">{{ errorMessage }}</div>
    <template v-else-if="calculo">
      <div v-if="errorMessage" class="alert alert-danger py-2">{{ errorMessage }}</div>
      <template v-if="ultimo">
        <p class="calculo__semana">Semana encerrada em {{ dataBr(ultimo.observedAt) }}</p>
        <div class="calculo__resumo">
          <div class="calculo__quadro">
            <span class="calculo__camada">A. Medir</span>
            <span>Estoque sem a SPR</span>
            <strong>{{ formatarValor(ultimo.estoque, 0) }}</strong>
            <small>{{ calculo.unidade }}</small>
          </div>
          <div class="calculo__quadro">
            <span class="calculo__camada">A. Medir</span>
            <span>Contra a semana anterior</span>
            <strong>{{ sinalizado(ultimo.variacaoSemanal, 0) }}</strong>
            <small>{{ calculo.unidade }}</small>
          </div>
          <div class="calculo__quadro">
            <span class="calculo__camada">B. Ler</span>
            <span>Média de 5 anos (mesma semana)</span>
            <strong>{{ formatarValor(ultimo.media5Anos, 0) }}</strong>
            <small>{{ calculo.unidade }}</small>
          </div>
          <div class="calculo__quadro">
            <span class="calculo__camada">B. Ler</span>
            <span>Desvio contra a média</span>
            <strong>{{ sinalizado(ultimo.desvioPct, 2) }}%</strong>
            <small>{{ sinalizado(ultimo.desvio, 0) }} {{ calculo.unidade }}</small>
          </div>
        </div>
      </template>

      <p class="calculo__titulo-grafico">Estoque sem a SPR (A) × média da mesma semana nos 5 anos anteriores (B)</p>
      <LineChart :pontos="linhas" :unidade="calculo.unidade" :casas-decimais="0" :series-labels="SERIES_LABELS" />

      <p class="calculo__nota">
        Semanal, não é tempo real: a EIA publica na quarta (quinta com feriado) a semana encerrada na sexta anterior.
        Fator {{ calculo.factorId }} v{{ calculo.factorVersion }}, calculado na hora a partir dos dados coletados, sem
        gravar nada.
      </p>
    </template>
  </section>

  <DecisaoEstoquesPetroleo
    v-if="calculo"
    :ativo="ativo"
    :fator="fator"
    :calculo="calculo"
    :simulando="simulando"
    @simular="simular"
    @salvo="simular(null)"
  />
</template>

<style scoped>
.calculo {
  background: rgba(211, 154, 23, 0.04);
  border: 1px dashed rgba(211, 154, 23, 0.6);
  border-radius: 12px;
  padding: 1rem;
}

.calculo__topo {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.calculo__topo h4 {
  margin: 0;
  font-size: 1rem;
}

.calculo__topo h4 small {
  margin-left: 0.4rem;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
}

.calculo__semana {
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  font-weight: 600;
}

.calculo__resumo {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.calculo__quadro {
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid rgba(19, 33, 59, 0.08);
  border-radius: 10px;
  padding: 0.65rem 0.8rem;
}

.calculo__quadro span,
.calculo__quadro small {
  font-size: 0.72rem;
  color: var(--p-text-muted-color);
}

.calculo__quadro .calculo__camada {
  align-self: flex-start;
  margin-bottom: 0.3rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(19, 33, 59, 0.07);
  color: #13213b;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.calculo__quadro strong {
  font-size: 1.1rem;
}

.calculo__titulo-grafico {
  margin: 0.5rem 0 0;
  font-size: 0.82rem;
  font-weight: 600;
}

.calculo__nota {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
