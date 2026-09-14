<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import AppShell from '../components/layout/AppShell.vue'
import StatusBadge from '../components/StatusBadge.vue'
import LineChart from '../components/charts/LineChart.vue'
import observaveisService from '../services/observaveis.service.js'

const route = useRoute()

const OPCOES_LINHAS_POR_PAGINA = [20, 50, 100, 200]
const CAMPO_PARA_ORDENACAO = { dataReferencia: 'referenceDate', valor: 'value' }
const FREQUENCIA_LABEL = { DIARIA: 'Diária', SEMANAL: 'Semanal', MENSAL: 'Mensal' }

// Tamanho máximo de página aceito pela API (ver TAMANHO_PAGINA_MAXIMO em
// backend/src/services/market-data.service.js) - cobre folgadamente 1 ano
// de série diária num único request.
const TAMANHO_PAGINA_MAXIMO_API = 366
const OPCOES_PERIODO_GRAFICO = [
  { dias: 30, label: '30d' },
  { dias: 90, label: '90d' },
  { dias: 180, label: '180d' },
  { dias: 365, label: '1 ano' }
]

const codigo = computed(() => route.params.codigo)

const loading = ref(true)
const errorMessage = ref('')
const observavel = ref(null)

const historico = ref([])
const totalHistorico = ref(0)
const paginaHistorico = ref(1)
const tamanhoPaginaHistorico = ref(OPCOES_LINHAS_POR_PAGINA[0])
const ordenarPorHistorico = ref('referenceDate')
const ordemHistorico = ref('DESC')
const carregandoHistorico = ref(false)

const ordemPrimeVueHistorico = computed(() => (ordemHistorico.value === 'ASC' ? 1 : -1))
const sortFieldHistorico = computed(
  () => Object.keys(CAMPO_PARA_ORDENACAO).find((campo) => CAMPO_PARA_ORDENACAO[campo] === ordenarPorHistorico.value) || 'dataReferencia'
)

const periodoGrafico = ref(OPCOES_PERIODO_GRAFICO[1].dias)
const historicoGrafico = ref([])
const carregandoGrafico = ref(false)

const formatadorValor = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatadorDataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const formatadorData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })

function formatarData(dataIso) {
  return dataIso ? formatadorData.format(new Date(`${dataIso}T00:00:00Z`)) : '-'
}
function formatarDataHora(valor) {
  return valor ? formatadorDataHora.format(new Date(valor)) : '-'
}

const pontosGrafico = computed(() => historicoGrafico.value.map((item) => ({ data: item.dataReferencia, valor: item.valor })))

function calcularDataInicio(diasAtras) {
  const hoje = new Date()
  const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()))
  inicio.setUTCDate(inicio.getUTCDate() - diasAtras)
  return inicio.toISOString().slice(0, 10)
}

async function carregarObservavel() {
  const resultado = await observaveisService.getObservavelDetalhe(codigo.value)
  observavel.value = resultado.observavel
}

async function carregarHistorico() {
  carregandoHistorico.value = true
  try {
    const resultado = await observaveisService.getObservavelHistorico(codigo.value, {
      pagina: paginaHistorico.value,
      tamanhoPagina: tamanhoPaginaHistorico.value,
      ordenarPor: ordenarPorHistorico.value,
      ordem: ordemHistorico.value
    })
    historico.value = resultado.historico
    totalHistorico.value = resultado.paginacao.total
  } finally {
    carregandoHistorico.value = false
  }
}

async function carregarGrafico() {
  carregandoGrafico.value = true
  try {
    const resultado = await observaveisService.getObservavelHistorico(codigo.value, {
      dataInicio: calcularDataInicio(periodoGrafico.value),
      tamanhoPagina: TAMANHO_PAGINA_MAXIMO_API,
      ordenarPor: 'referenceDate',
      ordem: 'ASC'
    })
    historicoGrafico.value = resultado.historico
  } finally {
    carregandoGrafico.value = false
  }
}

function onPeriodoGraficoChange(dias) {
  periodoGrafico.value = dias
  carregarGrafico()
}

function onPageHistorico(evento) {
  paginaHistorico.value = evento.page + 1
  carregarHistorico()
}

function onSortHistorico(evento) {
  ordenarPorHistorico.value = CAMPO_PARA_ORDENACAO[evento.sortField] || 'referenceDate'
  ordemHistorico.value = evento.sortOrder === 1 ? 'ASC' : 'DESC'
  paginaHistorico.value = 1
  carregarHistorico()
}

async function carregarTudo() {
  loading.value = true
  errorMessage.value = ''
  try {
    await carregarObservavel()
    await Promise.all([carregarHistorico(), carregarGrafico()])
  } catch (err) {
    errorMessage.value = err.response?.status === 404 ? 'Este observável não foi encontrado.' : 'Não foi possível carregar o observável.'
  } finally {
    loading.value = false
  }
}

onMounted(carregarTudo)
</script>

<template>
  <AppShell>
    <router-link :to="{ name: 'dados-mercado-observaveis' }" class="small text-decoration-none d-inline-block mb-2">
      &larr; Voltar para Observáveis
    </router-link>

    <div v-if="loading" class="text-muted">Carregando...</div>
    <div v-else-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <template v-else-if="observavel">
      <div class="d-flex flex-wrap justify-content-between align-items-center mb-3">
        <h1 class="h4 mb-0">{{ observavel.nome }}</h1>
        <StatusBadge :status="observavel.situacao" />
      </div>

      <div class="row g-2 mb-3">
        <div class="col-6 col-md-4 col-lg-2">
          <div class="card h-100">
            <div class="card-body p-2">
              <div class="text-muted small">Valor atual</div>
              <div class="fw-semibold">
                <template v-if="observavel.cotacaoAtual">{{ formatadorValor.format(observavel.cotacaoAtual.valor) }} {{ observavel.unidade }}</template>
                <template v-else>-</template>
              </div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2">
          <div class="card h-100">
            <div class="card-body p-2">
              <div class="text-muted small">Última observação</div>
              <div class="fw-semibold">{{ formatarData(observavel.cotacaoAtual?.dataReferencia) }}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2">
          <div class="card h-100">
            <div class="card-body p-2">
              <div class="text-muted small">Periodicidade</div>
              <div class="fw-semibold">{{ FREQUENCIA_LABEL[observavel.frequencia] || observavel.frequencia }}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2">
          <div class="card h-100">
            <div class="card-body p-2">
              <div class="text-muted small">Cobertura</div>
              <div class="fw-semibold small">{{ formatarData(observavel.cobertura.primeiraData) }} — {{ formatarData(observavel.cobertura.ultimaData) }}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2">
          <div class="card h-100">
            <div class="card-body p-2">
              <div class="text-muted small">Observações</div>
              <div class="fw-semibold">{{ observavel.totalObservacoes }}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2">
          <div class="card h-100">
            <div class="card-body p-2">
              <div class="text-muted small">Última coleta</div>
              <div class="fw-semibold small">
                <template v-if="observavel.ultimaColeta">
                  <StatusBadge :status="observavel.ultimaColeta.status" /><br />
                  {{ formatarDataHora(observavel.ultimaColeta.finalizadoEm) }}
                </template>
                <template v-else>Nunca</template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-body">
          <div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
            <h2 class="h6 mb-0">Histórico</h2>
            <div class="btn-group btn-group-sm" role="group" aria-label="Período do gráfico">
              <button
                v-for="opcao in OPCOES_PERIODO_GRAFICO"
                :key="opcao.dias"
                type="button"
                class="btn"
                :class="opcao.dias === periodoGrafico ? 'btn-primary' : 'btn-outline-secondary'"
                :disabled="carregandoGrafico"
                @click="onPeriodoGraficoChange(opcao.dias)"
              >
                {{ opcao.label }}
              </button>
            </div>
          </div>
          <div v-if="carregandoGrafico" class="text-muted text-center py-4">Carregando gráfico...</div>
          <div v-else-if="!historicoGrafico.length" class="text-muted text-center py-4">Nenhum histórico disponível para o período selecionado.</div>
          <LineChart v-else :pontos="pontosGrafico" :unidade="observavel.unidade" />
        </div>
      </div>

      <div class="tabela-card">
        <DataTable
          :value="historico"
          lazy
          :loading="carregandoHistorico"
          paginator
          paginator-position="both"
          :always-show="false"
          :rows="tamanhoPaginaHistorico"
          :first="(paginaHistorico - 1) * tamanhoPaginaHistorico"
          :total-records="totalHistorico"
          paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport"
          current-page-report-template="Página {currentPage} de {totalPages} ({totalRecords} no total)"
          sort-mode="single"
          :sort-field="sortFieldHistorico"
          :sort-order="ordemPrimeVueHistorico"
          class="tabela-paginada"
          @page="onPageHistorico"
          @sort="onSortHistorico"
        >
          <template #paginatorstart>
            <Button class="tabela-refresh-botao" icon="pi pi-refresh" text :loading="carregandoHistorico" @click="carregarHistorico" />
          </template>
          <template #paginatorend>
            <label class="tabela-linhas-por-pagina">
              <span>Por página</span>
              <select v-model.number="tamanhoPaginaHistorico">
                <option v-for="opcao in OPCOES_LINHAS_POR_PAGINA" :key="opcao" :value="opcao">{{ opcao }}</option>
              </select>
            </label>
          </template>
          <template #empty>Nenhum registro encontrado.</template>

          <Column field="dataReferencia" header="Data de referência" sortable>
            <template #body="{ data }">{{ formatarData(data.dataReferencia) }}</template>
          </Column>
          <Column field="valor" header="Valor" sortable>
            <template #body="{ data }">{{ formatadorValor.format(data.valor) }} {{ data.unidade }}</template>
          </Column>
          <Column header="Coletado em">
            <template #body="{ data }">{{ formatarDataHora(data.atualizadoEm) }}</template>
          </Column>
        </DataTable>
      </div>
    </template>
  </AppShell>
</template>
