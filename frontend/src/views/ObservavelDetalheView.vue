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
import { descreverPublicacao, formatarValor } from '../utils/observaveis-format.js'
import { baixarArquivo, nomeArquivoExportacao } from '../utils/baixar-arquivo.js'
import { OPCOES_PERIODO_GRAFICO, periodoPadraoDias } from '../utils/periodo-grafico.js'

const route = useRoute()

const OPCOES_LINHAS_POR_PAGINA = [20, 50, 100, 200]
const CAMPO_PARA_ORDENACAO = { dataReferencia: 'referenceDate', valor: 'value' }
const FREQUENCIA_LABEL = { DIARIA: 'Diária', SEMANAL: 'Semanal', MENSAL: 'Mensal', ANUAL: 'Anual (por safra)' }
// Rótulos de exibição pra `modalidade` - só aparece na UI (legenda do
// gráfico, coluna da tabela) quando um observável tem mais de uma
// modalidade coletada (ex.: SELIC = meta + realizada, ver ADR 0006).
const MODALIDADE_LABEL = {
  venda: 'Venda',
  compra: 'Compra',
  meta: 'Meta (Copom)',
  realizada: 'Realizada',
  // Observáveis point-in-time (ADR 0008/0009)
  usd: 'US$/oz',
  indice: 'Índice',
  nominal: 'Nominal (DGS10)',
  real: 'Real - TIPS (DFII10)',
  breakeven: 'Inflação implícita (T10YIE)',
  open_interest: 'Contratos em aberto',
  mm_long: 'Fundos - comprados',
  mm_short: 'Fundos - vendidos'
}

// Tamanho máximo de página aceito pela API (ver TAMANHO_PAGINA_MAXIMO em
// backend/src/services/market-data.service.js) - cobre folgadamente 1 ano
// de série diária num único request.
const TAMANHO_PAGINA_MAXIMO_API = 366
// Um card agrupa várias séries (ex.: Treasury = 3) e 5-10 anos de dado diário:
// passa de 366 linhas com folga, então o gráfico busca TODAS as páginas do
// período (com um teto, para nunca disparar centenas de requisições).
const MAX_PAGINAS_GRAFICO = 30

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
// null = "Ambas" (sem filtro) - só relevante quando o observável tem mais
// de uma modalidade coletada (ex.: SELIC = meta + realizada, ADR 0006).
const modalidadeFiltro = ref(null)
const exportando = ref(false)
const erroExportacao = ref('')

// Cards por item - vencimentos do CCM, regiões do WASDE: UM campo por vez (unidades
// diferentes) e uma linha por item - nunca uma série contínua. Vêm marcados os itens
// padrão da API (vencimentos que ainda negociam, regiões do catálogo); os inativos
// (vencidos, séries descontinuadas) são opt-in. Os textos vêm da API (`observavel.selecao`).
const campoSelecionado = ref(null)
const itensSelecionados = ref([])
const mostrarInativos = ref(false)

const ordemPrimeVueHistorico = computed(() => (ordemHistorico.value === 'ASC' ? 1 : -1))
const sortFieldHistorico = computed(
  () => Object.keys(CAMPO_PARA_ORDENACAO).find((campo) => CAMPO_PARA_ORDENACAO[campo] === ordenarPorHistorico.value) || 'dataReferencia'
)

const periodoGrafico = ref(periodoPadraoDias())
const historicoGrafico = ref([])
const carregandoGrafico = ref(false)
// O gráfico busca no máximo MAX_PAGINAS_GRAFICO páginas; se a seleção tem mais, avisa (a tabela e a exportação têm tudo).
const graficoTruncado = ref(false)

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
// Derivado do gráfico (sempre carregado sem filtro) - não do `historico` da
// tabela, que pode já estar filtrado por uma modalidade só.
const modalidadesDisponiveis = computed(() => [...new Set(historicoGrafico.value.map((item) => item.modalidade))])
const temMultiplasModalidades = computed(() => modalidadesDisponiveis.value.length > 1)
const porSelecao = computed(() => Boolean(observavel.value?.itens))
// Cards com seletor de métrica ("campo"): os por item (CCM, WASDE por país) e os de uma série só por métrica (WASDE EUA).
const temCampos = computed(() => Boolean(observavel.value?.campos))
const mostrarColunaModalidade = computed(() => porSelecao.value || (temMultiplasModalidades.value && !modalidadeFiltro.value))
const campoAtual = computed(() => (temCampos.value ? observavel.value.campos.find((c) => c.codigo === campoSelecionado.value) : null))
const casasAtuais = computed(() => campoAtual.value?.casasDecimais ?? observavel.value?.casasDecimais)
const unidadeAtual = computed(() => campoAtual.value?.unidade ?? observavel.value?.unidade)
const itensVisiveis = computed(() => (porSelecao.value ? observavel.value.itens.filter((i) => mostrarInativos.value || i.ativo) : []))
const quantidadeInativos = computed(() => (porSelecao.value ? observavel.value.itens.filter((i) => !i.ativo).length : 0))
const semItemSelecionado = computed(() => porSelecao.value && itensSelecionados.value.length === 0)
// Legenda do gráfico e coluna da tabela: rótulo amigável do item (ex.: "CCMX26 (nov/2026)", "Brasil").
const rotulosSeries = computed(() => ({
  ...MODALIDADE_LABEL,
  ...Object.fromEntries((observavel.value?.itens || []).map((i) => [i.codigo, i.rotulo]))
}))
// Só observáveis point-in-time (tabela observation) trazem quando o valor passou
// a estar disponível - PTAX/Selic (market_quote) não têm essa informação.
const mostrarColunaPublicacao = computed(() => historico.value.some((item) => item.publicadoEm))

function calcularDataInicio(diasAtras) {
  const hoje = new Date()
  const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()))
  inicio.setUTCDate(inicio.getUTCDate() - diasAtras)
  return inicio.toISOString().slice(0, 10)
}

async function carregarObservavel() {
  const resultado = await observaveisService.getObservavelDetalhe(codigo.value)
  observavel.value = resultado.observavel
  if (observavel.value.campos) campoSelecionado.value = observavel.value.campoPrincipal
  if (observavel.value.itens) itensSelecionados.value = [...observavel.value.itensPadrao]
  periodoGrafico.value = periodoPadraoDias(observavel.value.frequencia)
}

// Sem item marcado NÃO se pede nada (a API entenderia "sem filtro" e devolveria o
// padrão): a tela avisa em vez de mostrar dado que ninguém escolheu.
function parametrosDeSelecao() {
  if (!temCampos.value) return {}
  return { campo: campoSelecionado.value, ...(porSelecao.value ? { itens: itensSelecionados.value.join(',') } : {}) }
}

async function carregarHistorico() {
  carregandoHistorico.value = true
  try {
    if (semItemSelecionado.value) {
      historico.value = []
      totalHistorico.value = 0
      return
    }
    const resultado = await observaveisService.getObservavelHistorico(codigo.value, {
      ...parametrosDeSelecao(),
      pagina: paginaHistorico.value,
      tamanhoPagina: tamanhoPaginaHistorico.value,
      ordenarPor: ordenarPorHistorico.value,
      ordem: ordemHistorico.value,
      modality: modalidadeFiltro.value || undefined
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
    if (semItemSelecionado.value) {
      historicoGrafico.value = []
      graficoTruncado.value = false
      return
    }
    const dataInicio = periodoGrafico.value === null ? undefined : calcularDataInicio(periodoGrafico.value)
    const buscarPagina = (pagina) =>
      observaveisService.getObservavelHistorico(codigo.value, {
        ...parametrosDeSelecao(),
        dataInicio,
        pagina,
        tamanhoPagina: TAMANHO_PAGINA_MAXIMO_API,
        ordenarPor: 'referenceDate',
        ordem: 'ASC'
      })

    const primeira = await buscarPagina(1)
    graficoTruncado.value = primeira.paginacao.totalPaginas > MAX_PAGINAS_GRAFICO
    const totalPaginas = Math.min(primeira.paginacao.totalPaginas, MAX_PAGINAS_GRAFICO)
    const restantes = await Promise.all(Array.from({ length: Math.max(0, totalPaginas - 1) }, (_, i) => buscarPagina(i + 2)))
    historicoGrafico.value = [primeira, ...restantes].flatMap((resultado) => resultado.historico)
  } finally {
    carregandoGrafico.value = false
  }
}

function recarregarSelecao() {
  paginaHistorico.value = 1
  return Promise.all([carregarHistorico(), carregarGrafico()])
}

function alternarItem(codigoItem) {
  itensSelecionados.value = itensSelecionados.value.includes(codigoItem)
    ? itensSelecionados.value.filter((c) => c !== codigoItem)
    : [...itensSelecionados.value, codigoItem]
  recarregarSelecao()
}

function onMostrarInativosChange() {
  if (!mostrarInativos.value) {
    const visiveis = new Set(itensVisiveis.value.map((i) => i.codigo))
    itensSelecionados.value = itensSelecionados.value.filter((c) => visiveis.has(c))
  }
  recarregarSelecao()
}

function selecionarTodosVisiveis() {
  itensSelecionados.value = itensVisiveis.value.map((i) => i.codigo)
  recarregarSelecao()
}

function limparItens() {
  itensSelecionados.value = []
  recarregarSelecao()
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

// Exporta a série INTEIRA da tabela (não só a página exibida), com os mesmos
// filtros dela: modalidade, ou campo + itens (vencimentos, regiões) nos cards por item. O filtro de
// período é do gráfico e não entra aqui.
async function exportarCsv() {
  exportando.value = true
  erroExportacao.value = ''
  try {
    const blob = await observaveisService.exportarHistoricoCsv(codigo.value, {
      ...parametrosDeSelecao(),
      modality: modalidadeFiltro.value || undefined
    })
    baixarArquivo(blob, nomeArquivoExportacao(codigo.value, campoSelecionado.value))
  } catch (err) {
    erroExportacao.value =
      err.response?.status === 429
        ? 'Muitas exportações em pouco tempo. Aguarde alguns minutos e tente novamente.'
        : 'Não foi possível exportar os dados. Tente novamente.'
  } finally {
    exportando.value = false
  }
}

function onModalidadeFiltroChange() {
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
            <span class="observavel-detalhe__destaque-rotulo">Valor atual<template v-if="observavel.itemPrincipal"> · {{ observavel.itemPrincipal }}</template></span>
            <span class="observavel-detalhe__destaque-valor">
              <template v-if="observavel.cotacaoAtual">{{ formatarValor(observavel.cotacaoAtual.valor, observavel.casasDecimais) }} {{ observavel.unidade }}</template>
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
          <div v-if="observavel.publicacao" class="observavel-detalhe__destaque">
            <span class="observavel-detalhe__destaque-rotulo">Data de publicação</span>
            <span class="observavel-detalhe__destaque-valor observavel-detalhe__destaque-valor--pequeno">
              {{ descreverPublicacao(observavel.publicacao) }}
            </span>
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

        <div v-if="observavel.fonteDetalhe?.escopo" class="alert alert-info py-2 small mb-3" role="note">
          <strong>Escopo da coleta:</strong> {{ observavel.fonteDetalhe.escopo }}
        </div>

        <section class="observavel-detalhe__secao">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
            <h2 class="observavel-detalhe__secao-titulo mb-0">Histórico<template v-if="campoAtual"> · {{ campoAtual.nome }} ({{ campoAtual.unidade }})</template></h2>
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
          <div v-if="temCampos" class="observavel-detalhe__selecao">
            <div>
              <label class="form-label small mb-1 d-block">Métrica</label>
              <select v-model="campoSelecionado" class="form-select form-select-sm" @change="recarregarSelecao">
                <option v-for="campo in observavel.campos" :key="campo.codigo" :value="campo.codigo">{{ campo.nome }} ({{ campo.unidade }})</option>
              </select>
            </div>
            <div v-if="porSelecao" class="observavel-detalhe__selecao-vencimentos">
              <span class="form-label small mb-1 d-block">{{ observavel.selecao.titulo }}</span>
              <div class="observavel-detalhe__vencimentos">
                <label
                  v-for="item in itensVisiveis"
                  :key="item.codigo"
                  class="observavel-detalhe__vencimento"
                  :class="{ 'observavel-detalhe__vencimento--vencido': !item.ativo }"
                >
                  <input type="checkbox" :checked="itensSelecionados.includes(item.codigo)" @change="alternarItem(item.codigo)" />
                  {{ item.rotulo }}<span v-if="item.agregado" class="observavel-detalhe__estimada">agregado</span
                  ><span v-if="!item.ativo" class="observavel-detalhe__estimada">{{ observavel.selecao.inativo }}</span>
                </label>
              </div>
              <div class="observavel-detalhe__selecao-acoes">
                <label v-if="quantidadeInativos" class="small">
                  <input v-model="mostrarInativos" type="checkbox" @change="onMostrarInativosChange" /> {{ observavel.selecao.mostrarInativos }} ({{ quantidadeInativos }})
                </label>
                <button type="button" class="btn btn-link btn-sm p-0" @click="selecionarTodosVisiveis">Marcar todos</button>
                <button type="button" class="btn btn-link btn-sm p-0" @click="limparItens">Limpar</button>
              </div>
              <p class="observavel-detalhe__nota-publicacao mb-0">{{ observavel.selecao.nota }}</p>
            </div>
          </div>
          <div v-if="carregandoGrafico" class="text-muted text-center py-4">Carregando gráfico...</div>
          <div v-else-if="semItemSelecionado" class="text-muted text-center py-4">{{ observavel.selecao.semSelecao }}</div>
          <div v-else-if="!historicoGrafico.length" class="text-muted text-center py-4">Nenhum histórico disponível para o período selecionado.</div>
          <LineChart v-else :pontos="pontosGrafico" :unidade="unidadeAtual" :series-labels="rotulosSeries" />
          <p v-if="graficoTruncado && !carregandoGrafico" class="observavel-detalhe__nota-publicacao">
            O gráfico mostra só parte do período (limite de dados por gráfico). Escolha um período menor; a tabela e a exportação trazem tudo.
          </p>
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
          <h2 class="observavel-detalhe__secao-titulo">Tabela histórica<template v-if="campoAtual"> · {{ campoAtual.nome }} ({{ campoAtual.unidade }})</template></h2>
          <div v-if="erroExportacao" class="alert alert-danger py-2 small" role="alert">{{ erroExportacao }}</div>
          <div class="tabela-card">
            <div v-if="temMultiplasModalidades && !porSelecao" class="tabela-card__filtros">
              <div>
                <label class="form-label small mb-1 d-block">Modalidade</label>
                <select v-model="modalidadeFiltro" class="form-select form-select-sm" @change="onModalidadeFiltroChange">
                  <option :value="null">Todas</option>
                  <option v-for="modalidade in modalidadesDisponiveis" :key="modalidade" :value="modalidade">
                    {{ MODALIDADE_LABEL[modalidade] || modalidade }}
                  </option>
                </select>
              </div>
            </div>
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
                <span class="d-inline-flex gap-2">
                  <Button
                    class="tabela-refresh-botao"
                    icon="pi pi-refresh"
                    text
                    aria-label="Atualizar tabela"
                    title="Atualizar tabela"
                    :loading="carregandoHistorico"
                    @click="carregarHistorico"
                  />
                  <Button
                    class="tabela-refresh-botao"
                    icon="pi pi-download"
                    text
                    aria-label="Exportar CSV"
                    title="Exportar CSV"
                    :loading="exportando"
                    :disabled="carregandoHistorico || !totalHistorico"
                    @click="exportarCsv"
                  />
                </span>
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
                <template #body="{ data }">{{ formatarValor(data.valor, casasAtuais) }} {{ data.unidade }}</template>
              </Column>
              <Column v-if="mostrarColunaModalidade" field="modalidade" :header="observavel.rotuloModalidade || 'Modalidade'">
                <template #body="{ data }">{{ rotulosSeries[data.modalidade] || data.modalidade }}</template>
              </Column>
              <Column v-if="mostrarColunaPublicacao" header="Disponível desde">
                <template #body="{ data }">
                  {{ formatarDataHora(data.publicadoEm) }}
                  <span v-if="data.publicadoEmEstimado" class="observavel-detalhe__estimada" title="Data estimada por regra documentada - a fonte não informa quando publicou">estimada</span>
                </template>
              </Column>
              <Column header="Coletado em">
                <template #body="{ data }">{{ formatarDataHora(data.atualizadoEm) }}</template>
              </Column>
            </DataTable>
            <p v-if="mostrarColunaPublicacao" class="observavel-detalhe__nota-publicacao">
              <strong>Disponível desde</strong> é quando o valor passou a estar publicamente disponível.
              <em>estimada</em> = calculada por regra documentada (a fonte não informa) - usada nas análises point-in-time; ver ADR 0008.
            </p>
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
.observavel-detalhe__selecao {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  align-items: flex-start;
  margin-bottom: 0.9rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
}
.observavel-detalhe__selecao-vencimentos {
  flex: 1 1 320px;
  min-width: 0;
}
.observavel-detalhe__vencimentos {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.9rem;
}
.observavel-detalhe__vencimento {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.observavel-detalhe__vencimento--vencido {
  color: var(--p-text-muted-color);
}
.observavel-detalhe__selecao-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  align-items: center;
  margin: 0.5rem 0 0.35rem;
}

.observavel-detalhe__estimada {
  margin-left: 0.35rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  border: 1px solid var(--p-content-border-color);
}

.observavel-detalhe__nota-publicacao {
  margin: 0.75rem 0.25rem 0.25rem;
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
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
