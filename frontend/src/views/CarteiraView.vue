<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/layout/AppShell.vue'
import CarteiraVisaoGeral from '../components/carteiras/CarteiraVisaoGeral.vue'
import CarteiraRecomendacao from '../components/carteiras/CarteiraRecomendacao.vue'
import CarteiraDiario from '../components/carteiras/CarteiraDiario.vue'
import CarteiraRodadas from '../components/carteiras/CarteiraRodadas.vue'
import CarteiraPosicoes from '../components/carteiras/CarteiraPosicoes.vue'
import CarteiraOperacoes from '../components/carteiras/CarteiraOperacoes.vue'
import CarteiraConfiguracao from '../components/carteiras/CarteiraConfiguracao.vue'
import DocumentoModal from '../components/DocumentoModal.vue'
import { useDocumentoNaUrl } from '../composables/useDocumentoNaUrl.js'
import carteirasService from '../services/carteiras.service.js'
import { useWorkspaceStore } from '../stores/workspace.js'
import { DOCUMENTO_MANUAL, formatarData, formatarMoeda, nomeAtivo } from '../utils/carteiras.js'

// Uma carteira virtual (ADR 0127): visão geral, recomendação da IA, diário do operador, rodadas, posições, operações e configuração. A aba fica na URL
// (?aba=), para voltar a ela ao recarregar.
const route = useRoute()
const router = useRouter()
const workspaces = useWorkspaceStore()
const espaco = workspaces.active
const souOwner = computed(() => espaco.value?.papel === 'owner')
// O diário do operador: o dono e o editor registram (ADR 0127, §8).
const podeOperar = computed(() => ['owner', 'editor'].includes(espaco.value?.papel))
const { documentoAberto, anterior, abrirDocumento, navegarDocumento, voltarDocumento, fecharDocumento } =
  useDocumentoNaUrl()

const ABAS = [
  { codigo: 'visao-geral', nome: 'Visão geral' },
  { codigo: 'recomendacao', nome: 'Recomendação IA' },
  { codigo: 'diario', nome: 'Diário do operador' },
  { codigo: 'rodadas', nome: 'Rodadas' },
  { codigo: 'posicoes', nome: 'Posições' },
  { codigo: 'operacoes', nome: 'Operações' },
  { codigo: 'configuracao', nome: 'Configuração' }
]
const aba = computed(() => (ABAS.some((a) => a.codigo === route.query.aba) ? route.query.aba : 'visao-geral'))
const trocarAba = (codigo) => router.replace({ query: { ...route.query, aba: codigo === 'visao-geral' ? undefined : codigo } })

const carteira = ref(null)
const painel = ref(null)
const rodadas = ref([])
const posicoes = ref([])
const operacoes = ref([])
const recomendacoes = ref([])
const loading = ref(true)
const errorMessage = ref('')
const mensagem = ref('')

async function carregar(workspaceId, carteiraId) {
  loading.value = true
  errorMessage.value = ''
  try {
    const [c, p, r, pos, ops, recs] = await Promise.all([
      carteirasService.obterCarteira(workspaceId, carteiraId),
      carteirasService.obterPainel(workspaceId, carteiraId),
      carteirasService.listarRodadas(workspaceId, carteiraId),
      carteirasService.listarPosicoes(workspaceId, carteiraId),
      carteirasService.listarOperacoes(workspaceId, carteiraId),
      carteirasService.listarRecomendacoes(workspaceId, carteiraId)
    ])
    if (route.params.carteiraId !== carteiraId) return
    carteira.value = c
    painel.value = p
    rodadas.value = r
    posicoes.value = pos
    operacoes.value = ops
    recomendacoes.value = recs
  } catch (err) {
    errorMessage.value = err.response?.status === 404 ? 'Carteira não encontrada neste espaço.' : 'Não foi possível carregar a carteira.'
  } finally {
    loading.value = false
  }
}

const recarregar = () => carregar(espaco.value.id, route.params.carteiraId)

async function onVersaoSalva(versao) {
  const quando = versao.tipo === 'CORRECAO_CUSTO' ? 'desde o início' : `a partir de ${formatarData(versao.vigenteDesde)}`
  mensagem.value = `Versão ${versao.versao} registrada; vale ${quando}.`
  await recarregar()
}

const naoComecou = computed(() => carteira.value && !painel.value?.ultimaRodada)

watch(
  () => [espaco.value?.id, route.params.carteiraId],
  ([workspaceId, carteiraId]) => {
    carteira.value = null
    mensagem.value = ''
    if (workspaceId && carteiraId) carregar(workspaceId, carteiraId)
  },
  { immediate: true }
)
</script>

<template>
  <AppShell>
    <nav aria-label="breadcrumb" class="small mb-1">
      <router-link v-if="espaco" :to="{ name: 'carteiras', params: { workspaceId: espaco.id } }">
        <i class="bi bi-arrow-left me-1"></i>Carteiras
      </router-link>
    </nav>

    <div v-if="loading && !carteira" class="text-muted">Carregando...</div>
    <div v-else-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
    <template v-else-if="carteira">
      <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-2">
        <div>
          <h1 class="h4 mb-1 text-break">{{ carteira.nome }}</h1>
          <div class="text-muted small">
            Conta {{ carteira.conta }} · capital inicial {{ formatarMoeda(carteira.capitalInicial, carteira.moeda) }} ·
            início {{ formatarData(carteira.dataInicio) }} ·
            {{ Object.keys(carteira.parametros.ativos).map(nomeAtivo).join(', ') }}
          </div>
        </div>
        <div class="d-flex gap-2 align-items-center">
          <span class="badge text-bg-info">Simulação</span>
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="abrirDocumento(DOCUMENTO_MANUAL)">
            <i class="bi bi-book me-1"></i> Manual
          </button>
          <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="loading" title="Atualizar" @click="recarregar">
            <i class="bi bi-arrow-clockwise"></i>
          </button>
        </div>
      </div>

      <output v-if="mensagem" class="alert alert-success alert-dismissible d-block py-2 small">
        {{ mensagem }}
        <button type="button" class="btn-close py-2" aria-label="Fechar" @click="mensagem = ''"></button>
      </output>

      <div v-if="carteira.pendencias.length" class="alert alert-warning py-2 small">
        <i class="bi bi-exclamation-triangle me-1"></i>
        Custo por contrato pendente ({{ carteira.pendencias.map((p) => nomeAtivo(p.ativo)).join(', ') }}): a simulação
        conta custo zero até o número real, que vale desde o início quando for informado (aba Configuração).
      </div>
      <div v-if="naoComecou" class="alert alert-info py-2 small">
        <i class="bi bi-calendar-event me-1"></i>
        A carteira começa em {{ formatarData(carteira.dataInicio) }}. Cada dia útil, a rotina diária decide a rodada do
        dia e liquida a do dia anterior; até lá, as abas ficam vazias.
      </div>

      <ul class="nav nav-tabs mb-3">
        <li v-for="a in ABAS" :key="a.codigo" class="nav-item">
          <button type="button" class="nav-link" :class="{ active: aba === a.codigo }" @click="trocarAba(a.codigo)">{{ a.nome }}</button>
        </li>
      </ul>

      <CarteiraVisaoGeral v-if="aba === 'visao-geral'" :carteira="carteira" :painel="painel" />
      <CarteiraRecomendacao
        v-else-if="aba === 'recomendacao'"
        :recomendacoes="recomendacoes"
        :workspace-id="espaco.id"
        :carteira-id="carteira.id"
      />
      <CarteiraDiario v-else-if="aba === 'diario'" :workspace-id="espaco.id" :carteira="carteira" :pode-operar="podeOperar" @alterado="recarregar" />
      <CarteiraRodadas v-else-if="aba === 'rodadas'" :rodadas="rodadas" />
      <CarteiraPosicoes v-else-if="aba === 'posicoes'" :posicoes="posicoes" :moeda="carteira.moeda" />
      <CarteiraOperacoes v-else-if="aba === 'operacoes'" :operacoes="operacoes" />
      <CarteiraConfiguracao
        v-else
        :carteira="carteira"
        :workspace-id="espaco.id"
        :pode-editar="souOwner"
        @salvo="onVersaoSalva"
      />
    </template>

    <DocumentoModal
      :documento-id="documentoAberto"
      :anterior-id="anterior"
      @navegar="navegarDocumento"
      @voltar="voltarDocumento"
      @fechar="fecharDocumento"
    />
  </AppShell>
</template>
