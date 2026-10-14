<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/layout/AppShell.vue'
import CarteiraCriarModal from '../components/carteiras/CarteiraCriarModal.vue'
import DocumentoModal from '../components/DocumentoModal.vue'
import { useDocumentoNaUrl } from '../composables/useDocumentoNaUrl.js'
import carteirasService from '../services/carteiras.service.js'
import { useWorkspaceStore } from '../stores/workspace.js'
import { DOCUMENTO_MANUAL, formatarData, formatarMoeda } from '../utils/carteiras.js'

// As carteiras virtuais do espaço ativo (ADR 0127). O guard do router já validou o :workspaceId e o tornou o ativo.
const router = useRouter()
const workspaces = useWorkspaceStore()
const espaco = workspaces.active
const souOwner = computed(() => espaco.value?.papel === 'owner')

const carteiras = ref([])
const loading = ref(true)
const errorMessage = ref('')
const criarOpen = ref(false)
const { documentoAberto, anterior, abrirDocumento, navegarDocumento, voltarDocumento, fecharDocumento } =
  useDocumentoNaUrl()

async function carregar(workspaceId) {
  loading.value = true
  errorMessage.value = ''
  try {
    const lista = await carteirasService.listarCarteiras(workspaceId)
    if (espaco.value?.id === workspaceId) carteiras.value = lista
  } catch (_err) {
    if (espaco.value?.id === workspaceId) errorMessage.value = 'Não foi possível carregar as carteiras.'
  } finally {
    if (espaco.value?.id === workspaceId) loading.value = false
  }
}

function abrir(carteira) {
  router.push({ name: 'carteira', params: { workspaceId: espaco.value.id, carteiraId: carteira.id } })
}

function onCriada(carteira) {
  criarOpen.value = false
  abrir(carteira)
}

watch(
  () => espaco.value?.id,
  (id) => {
    carteiras.value = []
    if (id) carregar(id)
  },
  { immediate: true }
)
</script>

<template>
  <AppShell>
    <div class="d-flex align-items-center justify-content-between mb-1">
      <h1 class="h4 mb-0">Carteiras</h1>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-outline-secondary btn-sm" @click="abrirDocumento(DOCUMENTO_MANUAL)">
          <i class="bi bi-book me-1"></i> Manual
        </button>
        <button v-if="souOwner" type="button" class="btn btn-primary btn-sm" @click="criarOpen = true">
          <i class="bi bi-plus-lg me-1"></i> Nova carteira
        </button>
      </div>
    </div>
    <p class="text-muted small mb-3">
      Carteiras virtuais, em simulação: a Cartilha de Operações do Comitê aplicada a três trilhas lado a lado
      (operador, IA e uma regra fixa) e a três referências, para medir se a recomendação agrega valor. Nenhuma ordem
      real.
    </p>

    <div v-if="loading" class="text-muted">Carregando...</div>
    <div v-else-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
    <div v-else-if="!carteiras.length" class="card">
      <div class="card-body text-center py-5">
        <i class="bi bi-wallet2 fs-2 text-muted"></i>
        <p class="mt-2 mb-1">Nenhuma carteira neste espaço.</p>
        <p v-if="souOwner" class="text-muted small mb-3">
          Crie a primeira: conta, capital, início e ativos. O passo a passo está no
          <button type="button" class="btn btn-link btn-sm p-0 align-baseline" @click="abrirDocumento(DOCUMENTO_MANUAL)">manual</button>.
        </p>
        <p v-else class="text-muted small mb-0">Só o proprietário do espaço cria carteiras.</p>
        <button v-if="souOwner" type="button" class="btn btn-primary btn-sm" @click="criarOpen = true">
          <i class="bi bi-plus-lg me-1"></i> Nova carteira
        </button>
      </div>
    </div>
    <div v-else class="row g-3">
      <div v-for="c in carteiras" :key="c.id" class="col-md-6 col-xl-4">
        <button type="button" class="card h-100 w-100 text-start carteira-card" @click="abrir(c)">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <h2 class="h6 mb-1 text-break">{{ c.nome }}</h2>
              <span class="badge" :class="c.situacao === 'ATIVA' ? 'text-bg-success' : 'text-bg-secondary'">
                {{ c.situacao === 'ATIVA' ? 'Ativa' : c.situacao }}
              </span>
            </div>
            <div class="text-muted small">Conta {{ c.conta }} · {{ c.moeda }}</div>
            <div class="mt-2 small">
              Capital inicial <strong>{{ formatarMoeda(c.capitalInicial, c.moeda) }}</strong><br />
              Início {{ formatarData(c.dataInicio) }}
            </div>
          </div>
        </button>
      </div>
    </div>

    <CarteiraCriarModal v-if="espaco" :open="criarOpen" :workspace-id="espaco.id" @close="criarOpen = false" @created="onCriada" />
    <DocumentoModal
      :documento-id="documentoAberto"
      :anterior-id="anterior"
      @navegar="navegarDocumento"
      @voltar="voltarDocumento"
      @fechar="fecharDocumento"
    />
  </AppShell>
</template>

<style scoped>
.carteira-card {
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}

.carteira-card:hover {
  box-shadow: 0 0.25rem 0.75rem rgba(0, 0, 0, 0.08);
}
</style>
