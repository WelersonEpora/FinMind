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
const avisoExecucaoManual = ref('')

// Enquanto houver execução "Em andamento" na página, a lista se atualiza sozinha a cada 5 s, até não haver mais (ou
// 15 min, como teto). Vale para a coleta manual desta tela e para qualquer outra: a do cron, um backfill rodado no
// console do servidor. Antes, só a manual desta tela ligava o acompanhamento.
const INTERVALO_ACOMPANHAMENTO_MS = 5000
const TETO_ACOMPANHAMENTO_MS = 15 * 60_000
let acompanhamento = null

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

// Onde está o aviso ("arquivo: ... · local: ... · coluna: 5"), a partir do item que o coletor registrou.
function descreverItemAviso(item) {
  if (!item || typeof item !== 'object') return ''
  return Object.entries(item)
    .filter(([, valor]) => valor !== null && valor !== undefined && valor !== '')
    .map(([campo, valor]) => `${campo}: ${valor}`)
    .join(' · ')
}

async function carregar({ silencioso = false } = {}) {
  if (!silencioso) carregando.value = true
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
    if (!acompanhamento && temExecucaoEmAndamento()) acompanharColeta({ manual: false })
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

function pararAcompanhamento() {
  clearInterval(acompanhamento)
  acompanhamento = null
}
onBeforeUnmount(pararAcompanhamento)

function temExecucaoEmAndamento() {
  return execucoes.value.some((execucao) => execucao.status === 'running')
}

function acompanharColeta({ manual = true } = {}) {
  pararAcompanhamento()
  const inicio = Date.now()
  acompanhamento = setInterval(async () => {
    await carregar({ silencioso: true })
    if (!temExecucaoEmAndamento()) {
      pararAcompanhamento()
      if (manual) avisoExecucaoManual.value = 'Coleta concluída. Confira o status de cada coletor na lista.'
    } else if (Date.now() - inicio > TETO_ACOMPANHAMENTO_MS) {
      pararAcompanhamento()
    }
  }, INTERVALO_ACOMPANHAMENTO_MS)
}

// O servidor responde na hora (202) e roda a coleta em segundo plano: a requisição não espera os minutos da coleta.
async function executarAgora() {
  executandoAgora.value = true
  erroExecucaoManual.value = ''
  avisoExecucaoManual.value = ''
  try {
    const { coleta } = await coletasService.executarColeta()
    avisoExecucaoManual.value = `Coleta iniciada (${coleta.coletores.length} coletores). A lista se atualiza sozinha enquanto ela roda.`
    paginaAtual.value = 1
    await carregar()
    acompanharColeta()
  } catch (err) {
    erroExecucaoManual.value = err.response?.data?.error?.message || 'Não foi possível iniciar a coleta agora.'
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
        v-if="auth.state.user?.role === 'admin'"
        label="Executar coleta agora"
        icon="pi pi-play"
        :loading="executandoAgora"
        @click="executarAgora"
      />
    </header>

    <div v-if="avisoExecucaoManual" class="alert alert-info py-2 small">{{ avisoExecucaoManual }}</div>
    <div v-if="erroExecucaoManual" class="alert alert-danger py-2 small">{{ erroExecucaoManual }}</div>
    <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <div v-else class="tabela-card">
      <div class="tabela-card__filtros">
        <div>
          <label class="form-label small mb-1 d-block">Coletor</label>
          <input v-model="coletorFiltro" type="search" class="form-control form-control-sm" placeholder="ex.: imea, bcb, wasde..." @input="onColetorInput" />
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
        <Column header="Atualizados">
          <template #body="{ data }">{{ data.registros.atualizados }}</template>
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
        <!-- Só para coletores que chamam IA (hoje, os eventos de mercado): o coletor registra em metadata.detalhes.ia. -->
        <template v-if="execucaoDetalhe.detalhes?.ia">
          <dt class="col-12 mt-2">IA</dt>
          <dt class="col-5 fw-normal">Chave</dt>
          <dd class="col-7">{{ execucaoDetalhe.detalhes.ia.chave === 'paga' ? 'Paga' : execucaoDetalhe.detalhes.ia.chave === 'gratuita' ? 'Gratuita' : '-' }}</dd>
          <dt class="col-5 fw-normal">Modelo</dt>
          <dd class="col-7">{{ execucaoDetalhe.detalhes.ia.modelo || '-' }}</dd>
          <dt class="col-5 fw-normal">Tokens</dt>
          <dd class="col-7">{{ execucaoDetalhe.detalhes.ia.tokens != null ? execucaoDetalhe.detalhes.ia.tokens.toLocaleString('pt-BR') : '-' }}</dd>
          <dt class="col-5 fw-normal">Buscas / páginas lidas</dt>
          <dd class="col-7">{{ execucaoDetalhe.detalhes.ia.buscas }} / {{ execucaoDetalhe.detalhes.ia.paginasLidas }}</dd>
          <!-- Quais fontes autorizadas a pesquisa leu (ADR 0049): é por aqui que se vê se a lista está grande demais. -->
          <!-- Chamada repetida porque um ativo veio NORMAL sem o mínimo de pesquisa (ADR 0049, item 14). -->
          <template v-if="execucaoDetalhe.detalhes.ia.repeticoesPeloPiso">
            <dt class="col-5 fw-normal">Repetidas pelo mínimo de pesquisa</dt>
            <dd class="col-7">{{ execucaoDetalhe.detalhes.ia.repeticoesPeloPiso }}</dd>
          </template>
          <!-- Desde a v11, duas chamadas (ouro e petróleo; milho e café): as fontes lidas de cada uma. -->
          <template v-if="execucaoDetalhe.detalhes.ia.fontesLidasPorChamada">
            <template v-for="(fontes, frente) in execucaoDetalhe.detalhes.ia.fontesLidasPorChamada" :key="frente">
              <dt class="col-5 fw-normal">Fontes lidas ({{ frente === 'OURO_PETROLEO' ? 'ouro e petróleo' : frente === 'MILHO_CAFE' ? 'milho e café' : frente }})</dt>
              <dd class="col-7">{{ fontes.join(', ') || 'nenhuma' }}</dd>
            </template>
          </template>
          <template v-else-if="execucaoDetalhe.detalhes.ia.fontesLidas">
            <dt class="col-5 fw-normal">Fontes autorizadas lidas</dt>
            <dd class="col-7">{{ execucaoDetalhe.detalhes.ia.fontesLidas.join(', ') || 'nenhuma' }}</dd>
          </template>
          <dt class="col-5 fw-normal">Versão do prompt</dt>
          <dd class="col-7">{{ execucaoDetalhe.detalhes.ia.versaoPrompt || '-' }}</dd>
        </template>
        <template v-if="execucaoDetalhe.mensagemErro">
          <dt class="col-12 mt-2">Mensagem de erro</dt>
          <dd class="col-12"><pre class="small text-danger mb-0">{{ execucaoDetalhe.mensagemErro }}</pre></dd>
        </template>
        <template v-if="execucaoDetalhe.avisos?.length">
          <dt class="col-12 mt-2">Avisos da fonte ({{ execucaoDetalhe.avisos.length }})</dt>
          <dd class="col-12 mb-0">
            <p class="text-muted mb-1">Defeitos conhecidos da fonte, tratados pelo coletor: não contam como falha.</p>
            <ul class="ps-3 mb-0">
              <li v-for="(aviso, i) in execucaoDetalhe.avisos" :key="i">
                {{ aviso.motivo }}
                <span v-if="descreverItemAviso(aviso.item)" class="d-block text-muted">{{ descreverItemAviso(aviso.item) }}</span>
              </li>
            </ul>
          </dd>
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
