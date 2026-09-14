<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import AppShell from '../components/layout/AppShell.vue'
import StatusBadge from '../components/StatusBadge.vue'
import coletasService from '../services/coletas.service.js'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()

const OPCOES_LINHAS_POR_PAGINA = [25, 50, 100, 200]
const OPCOES_STATUS = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'success', rotulo: 'Sucesso' },
  { valor: 'partial_success', rotulo: 'Parcial' },
  { valor: 'failed', rotulo: 'Falha' },
  { valor: 'running', rotulo: 'Em andamento' }
]

const execucoes = ref([])
const totalExecucoes = ref(0)
const paginaAtual = ref(1)
const tamanhoPagina = ref(OPCOES_LINHAS_POR_PAGINA[0])
const ordenarPor = ref('iniciadoEm')
const ordem = ref('DESC')
const carregando = ref(true)
const errorMessage = ref('')

const coletorFiltro = ref('')
const statusFiltro = ref('')
const dataInicioFiltro = ref('')
const dataFimFiltro = ref('')

const executandoAgora = ref(false)
const erroExecucaoManual = ref('')

const detalheAberto = ref(false)
const carregandoDetalhe = ref(false)
const execucaoDetalhe = ref(null)

const formatadorDataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })

function formatarDataHora(valor) {
  return valor ? formatadorDataHora.format(new Date(valor)) : '-'
}
function formatarDuracao(ms) {
  return ms == null ? '-' : `${(ms / 1000).toFixed(1)}s`
}

async function carregar() {
  carregando.value = true
  errorMessage.value = ''
  try {
    const resultado = await coletasService.listarExecucoes({
      coletor: coletorFiltro.value || undefined,
      status: statusFiltro.value || undefined,
      dataInicio: dataInicioFiltro.value || undefined,
      dataFim: dataFimFiltro.value || undefined,
      pagina: paginaAtual.value,
      tamanhoPagina: tamanhoPagina.value,
      ordenarPor: ordenarPor.value,
      ordem: ordem.value
    })
    execucoes.value = resultado.execucoes
    totalExecucoes.value = resultado.paginacao.total
  } catch (_err) {
    errorMessage.value = 'Não foi possível carregar as execuções de coleta.'
  } finally {
    carregando.value = false
  }
}

let debounceColetor = null
function onColetorInput() {
  clearTimeout(debounceColetor)
  debounceColetor = setTimeout(() => {
    paginaAtual.value = 1
    carregar()
  }, 350)
}
onBeforeUnmount(() => clearTimeout(debounceColetor))

watch([statusFiltro, dataInicioFiltro, dataFimFiltro, tamanhoPagina], () => {
  paginaAtual.value = 1
  carregar()
})

function onPage(evento) {
  paginaAtual.value = evento.page + 1
  carregar()
}

function onSort(evento) {
  ordenarPor.value = evento.sortField
  ordem.value = evento.sortOrder === 1 ? 'ASC' : 'DESC'
  paginaAtual.value = 1
  carregar()
}

async function executarAgora() {
  executandoAgora.value = true
  erroExecucaoManual.value = ''
  try {
    await coletasService.executarColeta()
    paginaAtual.value = 1
    await carregar()
  } catch (err) {
    erroExecucaoManual.value = err.response?.data?.error?.message || 'Não foi possível executar a coleta agora.'
  } finally {
    executandoAgora.value = false
  }
}

async function abrirDetalhe(execucao) {
  detalheAberto.value = true
  carregandoDetalhe.value = true
  execucaoDetalhe.value = null
  try {
    const resultado = await coletasService.getExecucaoDetalhe(execucao.id)
    execucaoDetalhe.value = resultado.execucao
  } finally {
    carregandoDetalhe.value = false
  }
}

onMounted(carregar)
</script>

<template>
  <AppShell>
    <div class="execucoes">
    <header class="execucoes__cabecalho">
      <div>
        <h1 class="execucoes__titulo"><i class="bi bi-arrow-repeat"></i> Execuções</h1>
        <p class="execucoes__subtitulo">Histórico bruto de todas as coletas — cada linha é uma execução real de um coletor.</p>
      </div>
      <Button
        v-if="auth.state.user?.role === 'owner'"
        label="Executar coleta agora"
        icon="pi pi-play"
        :loading="executandoAgora"
        @click="executarAgora"
      />
    </header>

    <div v-if="erroExecucaoManual" class="alert alert-danger py-2 small">{{ erroExecucaoManual }}</div>
    <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <div v-else class="tabela-card">
      <div class="tabela-card__filtros">
        <div>
          <label class="form-label small mb-1 d-block">Coletor</label>
          <input v-model="coletorFiltro" type="search" class="form-control form-control-sm" placeholder="ex.: bcb-usd-brl-venda" @input="onColetorInput" />
        </div>
        <div>
          <label class="form-label small mb-1 d-block">Status</label>
          <select v-model="statusFiltro" class="form-select form-select-sm">
            <option v-for="opcao in OPCOES_STATUS" :key="opcao.valor" :value="opcao.valor">{{ opcao.rotulo }}</option>
          </select>
        </div>
        <div>
          <label class="form-label small mb-1 d-block">De</label>
          <input v-model="dataInicioFiltro" type="date" class="form-control form-control-sm" />
        </div>
        <div>
          <label class="form-label small mb-1 d-block">Até</label>
          <input v-model="dataFimFiltro" type="date" class="form-control form-control-sm" />
        </div>
      </div>

      <DataTable
        :value="execucoes"
        lazy
        :loading="carregando"
        paginator
        paginator-position="both"
        :always-show="false"
        :rows="tamanhoPagina"
        :first="(paginaAtual - 1) * tamanhoPagina"
        :total-records="totalExecucoes"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport"
        current-page-report-template="Página {currentPage} de {totalPages} ({totalRecords} no total)"
        sort-mode="single"
        :sort-field="ordenarPor"
        :sort-order="ordem === 'ASC' ? 1 : -1"
        row-hover
        selection-mode="single"
        data-key="id"
        class="tabela-paginada tabela-paginada--linha-clicavel"
        @page="onPage"
        @sort="onSort"
        @row-select="abrirDetalhe($event.data)"
      >
        <template #paginatorstart>
          <Button class="tabela-refresh-botao" icon="pi pi-refresh" text title="Atualizar tabela" :loading="carregando" @click="carregar" />
        </template>
        <template #paginatorend>
          <label class="tabela-linhas-por-pagina">
            <span>Por página</span>
            <select v-model.number="tamanhoPagina">
              <option v-for="opcao in OPCOES_LINHAS_POR_PAGINA" :key="opcao" :value="opcao">{{ opcao }}</option>
            </select>
          </label>
        </template>
        <template #empty>Nenhuma coleta executada ainda.</template>

        <Column field="iniciadoEm" header="Data/hora" sortable>
          <template #body="{ data }">{{ formatarDataHora(data.iniciadoEm) }}</template>
        </Column>
        <Column field="coletor" header="Coletor" />
        <Column field="duracaoMs" header="Duração" sortable>
          <template #body="{ data }">{{ formatarDuracao(data.duracaoMs) }}</template>
        </Column>
        <Column field="status" header="Status" sortable>
          <template #body="{ data }"><StatusBadge :status="data.status" /></template>
        </Column>
        <Column header="Novos">
          <template #body="{ data }">{{ data.registros.criados }}</template>
        </Column>
        <Column header="Ignorados">
          <template #body="{ data }">{{ data.registros.ignorados }}</template>
        </Column>
        <Column header="Falhas">
          <template #body="{ data }">{{ data.registros.falhos }}</template>
        </Column>
      </DataTable>
    </div>

    <Dialog v-model:visible="detalheAberto" modal header="Detalhe da execução" :style="{ width: '32rem' }">
      <div v-if="carregandoDetalhe" class="text-muted">Carregando...</div>
      <dl v-else-if="execucaoDetalhe" class="row small mb-0">
        <dt class="col-5">Coletor</dt>
        <dd class="col-7">{{ execucaoDetalhe.coletor }}</dd>
        <dt class="col-5">Status</dt>
        <dd class="col-7"><StatusBadge :status="execucaoDetalhe.status" /></dd>
        <dt class="col-5">Iniciado em</dt>
        <dd class="col-7">{{ formatarDataHora(execucaoDetalhe.iniciadoEm) }}</dd>
        <dt class="col-5">Finalizado em</dt>
        <dd class="col-7">{{ formatarDataHora(execucaoDetalhe.finalizadoEm) }}</dd>
        <dt class="col-5">Duração</dt>
        <dd class="col-7">{{ formatarDuracao(execucaoDetalhe.duracaoMs) }}</dd>
        <dt class="col-5">Lidos / Novos / Atualizados / Ignorados / Falhas</dt>
        <dd class="col-7">
          {{ execucaoDetalhe.registros.lidos }} / {{ execucaoDetalhe.registros.criados }} / {{ execucaoDetalhe.registros.atualizados }} /
          {{ execucaoDetalhe.registros.ignorados }} / {{ execucaoDetalhe.registros.falhos }}
        </dd>
        <template v-if="execucaoDetalhe.mensagemErro">
          <dt class="col-12 mt-2">Mensagem de erro</dt>
          <dd class="col-12"><pre class="small text-danger mb-0">{{ execucaoDetalhe.mensagemErro }}</pre></dd>
        </template>
      </dl>
    </Dialog>
    </div>
  </AppShell>
</template>

<style scoped>
.execucoes {
  max-width: 1440px;
  margin: 0 auto;
}

.execucoes__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.execucoes__titulo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.35rem;
  letter-spacing: -0.01em;
}

.execucoes__subtitulo {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
  max-width: 60ch;
}
</style>
