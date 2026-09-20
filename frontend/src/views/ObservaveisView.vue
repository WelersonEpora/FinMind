<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import AppShell from '../components/layout/AppShell.vue'
import StatusBadge from '../components/StatusBadge.vue'
import observaveisService from '../services/observaveis.service.js'
import { formatarValor } from '../utils/observaveis-format.js'

const router = useRouter()

const OPCOES_LINHAS_POR_PAGINA = [20, 50, 100]
const FREQUENCIA_LABEL = { DIARIA: 'Diária', SEMANAL: 'Semanal', MENSAL: 'Mensal' }

const loading = ref(true)
const errorMessage = ref('')
const observaveis = ref([])
const busca = ref('')
const tamanhoPagina = ref(OPCOES_LINHAS_POR_PAGINA[0])
const primeiroRegistro = ref(0)

const formatadorData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })

function formatarData(dataIso) {
  return dataIso ? formatadorData.format(new Date(`${dataIso}T00:00:00Z`)) : '-'
}

// Lista pequena (catálogo estático, ver backend/src/services/observaveis.service.js)
// - filtro/paginação/ordenação 100% client-side, mesmo critério do
// AgroMind pras telas com dataset pequeno e limitado.
const filtrados = computed(() => {
  const termo = busca.value.trim().toLowerCase()
  if (!termo) return observaveis.value
  return observaveis.value.filter(
    (item) => item.nome.toLowerCase().includes(termo) || (item.fonte || '').toLowerCase().includes(termo)
  )
})

async function carregar() {
  loading.value = true
  errorMessage.value = ''
  try {
    const resultado = await observaveisService.listarObservaveis()
    observaveis.value = resultado.observaveis
  } catch (_err) {
    errorMessage.value = 'Não foi possível carregar os observáveis.'
  } finally {
    loading.value = false
  }
}

function abrirDetalhe(observavel) {
  router.push({ name: 'dados-mercado-observavel-detalhe', params: { codigo: observavel.codigo } })
}

onMounted(carregar)
</script>

<template>
  <AppShell>
    <div class="observaveis">
      <header class="observaveis__cabecalho">
        <h1 class="observaveis__titulo"><i class="bi bi-database"></i> Observáveis</h1>
        <p class="observaveis__subtitulo">
          Todas as séries temporais que o FinMind conhece hoje — a janela para validar rapidamente qualquer dado do
          sistema.
        </p>
      </header>

      <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

      <div v-else class="tabela-card">
      <div class="tabela-card__filtros">
        <input v-model="busca" type="search" class="form-control form-control-sm" style="max-width: 260px" placeholder="Buscar por nome ou fonte..." />
      </div>

      <DataTable
        :value="filtrados"
        :loading="loading"
        paginator
        paginator-position="both"
        :always-show="false"
        :rows="tamanhoPagina"
        v-model:first="primeiroRegistro"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport"
        current-page-report-template="Página {currentPage} de {totalPages} ({totalRecords} no total)"
        sort-mode="single"
        selection-mode="single"
        data-key="codigo"
        class="tabela-paginada tabela-paginada--linha-clicavel"
        @row-select="abrirDetalhe($event.data)"
      >
        <template #paginatorstart>
          <Button
            class="tabela-refresh-botao"
            icon="pi pi-refresh"
            text
            aria-label="Atualizar tabela"
            title="Atualizar tabela"
            :loading="loading"
            @click="carregar"
          />
        </template>
        <template #paginatorend>
          <label class="tabela-linhas-por-pagina">
            <span>Por página</span>
            <select v-model.number="tamanhoPagina">
              <option v-for="opcao in OPCOES_LINHAS_POR_PAGINA" :key="opcao" :value="opcao">{{ opcao }}</option>
            </select>
          </label>
        </template>
        <template #empty>Nenhum observável encontrado.</template>

        <Column field="nome" header="Nome" sortable body-class="observaveis__celula-compacta" />
        <Column field="fonte" header="Fonte" sortable body-class="observaveis__celula-compacta" />
        <Column field="valor" header="Último valor" sortable>
          <template #body="{ data }">
            <span v-if="data.valor != null">{{ formatarValor(data.valor, data.casasDecimais) }} {{ data.unidade }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </Column>
        <Column field="dataReferencia" header="Última observação" sortable>
          <template #body="{ data }">{{ formatarData(data.dataReferencia) }}</template>
        </Column>
        <Column header="Frequência">
          <template #body="{ data }">{{ FREQUENCIA_LABEL[data.frequencia] || data.frequencia }}</template>
        </Column>
        <Column header="Situação">
          <template #body="{ data }"><StatusBadge :status="data.situacao" /></template>
        </Column>
      </DataTable>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.observaveis {
  max-width: 1440px;
  margin: 0 auto;
}

.observaveis :deep(.observaveis__celula-compacta) {
  /* Nome e Fonte são textos longos: fonte menor evita quebrar em duas linhas. */
  font-size: 0.78rem;
  line-height: 1.25;
}

.observaveis__cabecalho {
  margin-bottom: 1.5rem;
}

.observaveis__titulo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.35rem;
  letter-spacing: -0.01em;
}

.observaveis__subtitulo {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
  max-width: 60ch;
}
</style>
