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
// Rótulos de exibição pra `modalidade` - só aparece na UI (legenda do
// gráfico, coluna da tabela) quando um observável tem mais de uma
// modalidade coletada (ex.: SELIC = meta + realizada, ver ADR 0006).
const MODALIDADE_LABEL = { venda: 'Venda', compra: 'Compra', meta: 'Meta (Copom)', realizada: 'Realizada' }

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

const periodoGrafico = ref(OPCOES_PERIODO_GRAFICO[0].dias)
const historicoGrafico = ref([])
const carregandoGrafico = ref(false)

const formatadorValor = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
const formatadorDataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const formatadorData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })

function formatarData(dataIso) {
  return dataIso ? formatadorData.format(new Date(`${dataIso}T00:00:00Z`)) : '-'
}
function formatarDataHora(valor) {
  return valor ? formatadorDataHora.format(new Date(valor)) : '-'
}

const pontosGrafico = computed(() =>
  historicoGrafico.value.map((item) => ({ data: item.dataReferencia, valor: item.valor, serie: item.modalidade }))
)
const temMultiplasModalidades = computed(() => new Set(historico.value.map((item) => item.modalidade)).size > 1)

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
    <div class="observavel-detalhe">
      <router-link :to="{ name: 'dados-mercado-observaveis' }" class="observavel-detalhe__voltar">
        <i class="pi pi-arrow-left"></i> Voltar para Observáveis
      </router-link>

      <div v-if="loading" class="text-muted">Carregando...</div>
      <div v-else-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

      <template v-else-if="observavel">
        <header class="observavel-detalhe__cabecalho">
          <div>
            <h1 class="observavel-detalhe__titulo">{{ observavel.nome }}</h1>
            <p v-if="observavel.cotacaoAtual?.fonte" class="observavel-detalhe__subtitulo">{{ observavel.cotacaoAtual.fonte }}</p>
          </div>
          <StatusBadge :status="observavel.situacao" />
        </header>

        <div class="observavel-detalhe__destaques">
          <div class="observavel-detalhe__destaque">
            <span class="observavel-detalhe__destaque-rotulo">Valor atual</span>
            <span class="observavel-detalhe__destaque-valor">
              <template v-if="observavel.cotacaoAtual">{{ formatadorValor.format(observavel.cotacaoAtual.valor) }} {{ observavel.unidade }}</template>
              <template v-else>-</template>
            </span>
          </div>
          <div class="observavel-detalhe__destaque">
            <span class="observavel-detalhe__destaque-rotulo">Última observação</span>
            <span class="observavel-detalhe__destaque-valor">{{ formatarData(observavel.cotacaoAtual?.dataReferencia) }}</span>
          </div>
          <div class="observavel-detalhe__destaque">
            <span class="observavel-detalhe__destaque-rotulo">Periodicidade</span>
            <span class="observavel-detalhe__destaque-valor">{{ FREQUENCIA_LABEL[observavel.frequencia] || observavel.frequencia }}</span>
          </div>
          <div class="observavel-detalhe__destaque">
            <span class="observavel-detalhe__destaque-rotulo">Cobertura</span>
            <span class="observavel-detalhe__destaque-valor observavel-detalhe__destaque-valor--pequeno">
              {{ formatarData(observavel.cobertura.primeiraData) }} — {{ formatarData(observavel.cobertura.ultimaData) }}
            </span>
          </div>
          <div class="observavel-detalhe__destaque">
            <span class="observavel-detalhe__destaque-rotulo">Observações</span>
            <span class="observavel-detalhe__destaque-valor">{{ observavel.totalObservacoes.toLocaleString('pt-BR') }}</span>
          </div>
          <div class="observavel-detalhe__destaque">
            <span class="observavel-detalhe__destaque-rotulo">Última coleta</span>
            <span class="observavel-detalhe__destaque-valor observavel-detalhe__destaque-valor--pequeno">
              <template v-if="observavel.ultimaColeta">
                <StatusBadge :status="observavel.ultimaColeta.status" /> {{ formatarDataHora(observavel.ultimaColeta.finalizadoEm) }}
              </template>
              <template v-else>Nunca</template>
            </span>
          </div>
        </div>

        <section class="observavel-detalhe__secao">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
            <h2 class="observavel-detalhe__secao-titulo mb-0">Histórico</h2>
            <div class="periodo-seletor" role="group" aria-label="Período do gráfico">
              <button
                v-for="opcao in OPCOES_PERIODO_GRAFICO"
                :key="opcao.dias"
                type="button"
                class="periodo-seletor__opcao"
                :class="{ 'periodo-seletor__opcao--ativa': opcao.dias === periodoGrafico }"
                :disabled="carregandoGrafico"
                @click="onPeriodoGraficoChange(opcao.dias)"
              >
                {{ opcao.label }}
              </button>
            </div>
          </div>
          <div v-if="carregandoGrafico" class="text-muted text-center py-4">Carregando gráfico...</div>
          <div v-else-if="!historicoGrafico.length" class="text-muted text-center py-4">Nenhum histórico disponível para o período selecionado.</div>
          <LineChart v-else :pontos="pontosGrafico" :unidade="observavel.unidade" :series-labels="MODALIDADE_LABEL" />
        </section>

        <section v-if="observavel.fonteDetalhe" class="observavel-detalhe__secao">
          <details class="observavel-detalhe__metodologia">
            <summary>Fonte e metodologia</summary>
            <p v-if="observavel.fonteDetalhe.descricao">{{ observavel.fonteDetalhe.descricao }}</p>
            <p v-if="observavel.fonteDetalhe.metodologia" class="observavel-detalhe__metodologia-nota">
              {{ observavel.fonteDetalhe.metodologia }}
            </p>
            <dl class="observavel-detalhe__metodologia-lista">
              <template v-if="observavel.fonteDetalhe.formatoOrigem">
                <dt>Formato de origem</dt>
                <dd>{{ observavel.fonteDetalhe.formatoOrigem }}</dd>
              </template>
              <template v-if="observavel.fonteDetalhe.urlOficial">
                <dt>URL oficial</dt>
                <dd><a :href="observavel.fonteDetalhe.urlOficial" target="_blank" rel="noopener">{{ observavel.fonteDetalhe.urlOficial }}</a></dd>
              </template>
            </dl>
          </details>
        </section>

        <section class="observavel-detalhe__secao">
          <h2 class="observavel-detalhe__secao-titulo">Tabela histórica</h2>
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
              <Column v-if="temMultiplasModalidades" field="modalidade" header="Modalidade">
                <template #body="{ data }">{{ MODALIDADE_LABEL[data.modalidade] || data.modalidade }}</template>
              </Column>
              <Column header="Coletado em">
                <template #body="{ data }">{{ formatarDataHora(data.atualizadoEm) }}</template>
              </Column>
            </DataTable>
          </div>
        </section>
      </template>
    </div>
  </AppShell>
</template>

<style scoped>
.observavel-detalhe {
  max-width: 1440px;
  /* .finmind-main (AppShell.vue) tem padding-top de 1.5rem, padrão pra
     views sem link de "voltar" (ex.: título grande logo no topo). Aqui, com
     o link de volta sendo o 1o elemento, esse mesmo respiro fica grande
     demais - visualmente parecia sobrar uma linha em branco acima dele
     (achado real, comparado à mesma tela do AgroMind). Só nesta view. */
  margin: -0.75rem auto 0;
}

.observavel-detalhe__voltar {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: var(--p-text-muted-color);
  text-decoration: none;
  margin-bottom: 1rem;
}
.observavel-detalhe__voltar:hover {
  color: var(--p-primary-color);
}

.observavel-detalhe__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.observavel-detalhe__titulo {
  margin: 0 0 0.25rem;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.observavel-detalhe__subtitulo {
  margin: 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.observavel-detalhe__destaques {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.9rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  padding: 1rem 1.1rem;
  margin-bottom: 1.75rem;
}

.observavel-detalhe__destaque {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.observavel-detalhe__destaque-rotulo {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
}

.observavel-detalhe__destaque-valor {
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.observavel-detalhe__destaque-valor--pequeno {
  font-size: 0.82rem;
  font-weight: 600;
}

.observavel-detalhe__secao {
  margin-bottom: 1.75rem;
}

.observavel-detalhe__secao-titulo {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 0.6rem;
}

.periodo-seletor {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.2rem;
  border-radius: 999px;
  background: var(--p-content-hover-background, var(--p-content-background));
  border: 1px solid var(--p-content-border-color);
}

.periodo-seletor__opcao {
  border: none;
  background: transparent;
  color: var(--p-text-muted-color);
  font-size: 0.76rem;
  font-weight: 600;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.periodo-seletor__opcao:hover:not(:disabled):not(.periodo-seletor__opcao--ativa) {
  background: var(--p-content-background);
  color: var(--p-text-color);
}
.periodo-seletor__opcao--ativa {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color, #fff);
}
.periodo-seletor__opcao:disabled {
  opacity: 0.6;
  cursor: default;
}

.observavel-detalhe__metodologia {
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  padding: 0.85rem 1.1rem;
  font-size: 0.85rem;
}
.observavel-detalhe__metodologia summary {
  cursor: pointer;
  font-weight: 600;
}
.observavel-detalhe__metodologia p {
  color: var(--p-text-muted-color);
  line-height: 1.5;
}
.observavel-detalhe__metodologia-nota {
  font-size: 0.82rem;
}

.observavel-detalhe__metodologia-lista {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3rem 0.75rem;
  margin: 0.75rem 0 0;
  font-size: 0.82rem;
}
.observavel-detalhe__metodologia-lista dt {
  color: var(--p-text-muted-color);
  font-weight: 600;
}
.observavel-detalhe__metodologia-lista dd {
  margin: 0;
  word-break: break-all;
}
.observavel-detalhe__metodologia-lista a {
  color: var(--p-primary-color);
}
</style>
