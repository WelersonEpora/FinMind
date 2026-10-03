<script setup>
import { computed, ref, watch } from 'vue'
import LineChart from '../charts/LineChart.vue'
import DecisaoFator from './DecisaoFator.vue'
import metodologiaAtivoService from '../../services/metodologia-ativo.service.js'
import { PERIODOS_CALCULO, desdeDoPeriodo, formatarQuadro, linhaSecundaria, periodoDoFator, seriesDoGrafico } from '../../utils/metodologia.js'

// A proposta de um fator calculada (ADR 0050), com as mesmas letras do "Como medir": A. Medir e B. Ler neste card;
// C. Decidir (com os parâmetros do sistema, ou simulando outros) no card de baixo. Genérico: os quadros, o gráfico e
// os textos vêm da `apresentacao` que a API manda para cada fator. Só o que entra na conta do fator.
const props = defineProps({
  ativo: { type: String, required: true },
  fator: { type: String, required: true },
  // AAAA-MM-DD numa simulação (o que se sabia até o fim do dia); vazio = hoje.
  data: { type: String, default: '' }
})

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
    const desde = desdeDoPeriodo(periodo.value, props.data || hojeLocal())
    const { calculo: payload } = await metodologiaAtivoService.getCalculoFator(props.ativo, props.fator, {
      desde,
      data: props.data || undefined,
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

watch([periodo, () => props.data], carregar)
watch(
  () => props.fator,
  () => {
    calculo.value = null
    parametros.value = null
    carregar()
  },
  { immediate: true }
)

const apresentacao = computed(() => calculo.value?.apresentacao || null)
const grafico = computed(() =>
  apresentacao.value ? seriesDoGrafico(calculo.value.pontos, apresentacao.value.graficoAB) : { linhas: [], rotulos: {} }
)
const ultimo = computed(() => calculo.value?.pontos.at(-1) || null)
const ROTULO_CAMADA = { A: 'A. Medir', B: 'B. Ler' }
const periodoFator = computed(() => periodoDoFator(calculo.value?.periodicidade))

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
        <p class="calculo__semana">{{ periodoFator.referencia(ultimo.observedAt) }}</p>
        <div class="calculo__resumo">
          <div v-for="quadro in apresentacao.quadros" :key="quadro.campo" class="calculo__quadro">
            <span class="calculo__camada">{{ ROTULO_CAMADA[quadro.camada] }}</span>
            <span>{{ quadro.rotulo }}</span>
            <strong>{{ formatarQuadro(ultimo[quadro.campo], quadro) }}</strong>
            <small>{{ linhaSecundaria(ultimo, quadro) }}</small>
          </div>
        </div>
      </template>

      <p class="calculo__titulo-grafico">{{ apresentacao.graficoAB.titulo }}</p>
      <LineChart
        :pontos="grafico.linhas"
        :unidade="apresentacao.graficoAB.unidade"
        :casas-decimais="apresentacao.graficoAB.casas"
        :series-labels="grafico.rotulos"
      />

      <p class="calculo__nota">
        {{ apresentacao.nota }} Fator {{ calculo.factorId }} v{{ calculo.factorVersion }}, calculado na hora a partir dos
        dados coletados, sem gravar nada.
      </p>

      <!-- O bloco do fator para o prompt da IA do ativo, gerado no backend: o que se vê é o que a IA recebe. -->
      <details v-if="calculo.textoPrompt" class="calculo__prompt">
        <summary>Texto exato que vai ao prompt</summary>
        <pre>{{ calculo.textoPrompt }}</pre>
      </details>
    </template>
  </section>

  <DecisaoFator
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

/* Mesmo visual do "Texto exato que vai ao prompt" dos fatores de evento (EventosFator.vue). */
.calculo__prompt {
  margin-top: 0.75rem;
}

.calculo__prompt summary {
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
}

.calculo__prompt pre {
  margin: 0.5rem 0 0;
  padding: 0.75rem;
  max-height: 22rem;
  overflow: auto;
  white-space: pre-wrap;
  border-radius: 8px;
  background: rgba(19, 33, 59, 0.05);
  font-size: 0.75rem;
}
</style>
