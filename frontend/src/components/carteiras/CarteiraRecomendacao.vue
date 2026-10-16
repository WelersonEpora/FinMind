<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import DatePicker from 'primevue/datepicker'
import carteirasService from '../../services/carteiras.service.js'
import {
  RAMOS,
  consistencia,
  corDaAcao,
  dataDeIso,
  diasFora,
  formatarData,
  formatarUsd,
  isoDeData,
  nomeAtivo,
  rotulo
} from '../../utils/carteiras.js'

// A recomendação diária da IA (ADR 0127, §4): por ativo, os três ramos (sem posição, se comprado, se vendido), a
// prioridade, o porquê, as evidências e o que invalida a tese. A mesma resposta serve ao operador e à trilha IA, que
// aplica o ramo do estado dela; o motor de risco roda por cima. Nunca preço, stop ou quantidade. "O que foi à IA" mostra
// a instrução, o prompt e cada resposta bruta, como foram.
const props = defineProps({
  recomendacoes: { type: Array, required: true },
  workspaceId: { type: String, required: true },
  carteiraId: { type: String, required: true }
})

const principais = computed(() => props.recomendacoes.filter((r) => r.tipo === 'PRINCIPAL'))
const dataSelecionada = ref(null)
watch(
  principais,
  (lista) => {
    if (!lista.some((r) => r.data === dataSelecionada.value)) dataSelecionada.value = lista[0]?.data ?? null
  },
  { immediate: true }
)

// O dia: setas para o dia anterior e o próximo com recomendação (a lista vem da mais recente) e o calendário para pular
// para qualquer data, com os dias sem recomendação desabilitados e as falhas e as recomendações contrárias à leitura
// marcadas. A lista vem inteira (a avaliação é de 6 e 12 meses).
const indice = computed(() => principais.value.findIndex((r) => r.data === dataSelecionada.value))
const irPara = (i) => {
  if (principais.value[i]) dataSelecionada.value = principais.value[i].data
}
const porData = computed(() => new Map(principais.value.map((r) => [r.data, r])))
const limites = computed(() => {
  const lista = principais.value
  return lista.length ? { min: dataDeIso(lista[lista.length - 1].data), max: dataDeIso(lista[0].data) } : null
})
const desabilitados = computed(() => diasFora(principais.value.map((r) => r.data)).map(dataDeIso))
const dataDoCalendario = computed({
  get: () => (dataSelecionada.value ? dataDeIso(dataSelecionada.value) : null),
  set: (data) => {
    if (data && porData.value.has(isoDeData(data))) dataSelecionada.value = isoDeData(data)
  }
})
// A marca de um dia no calendário (o slot dá o mês de 0 a 11).
function marcaDoDia({ year, month, day }) {
  const r = porData.value.get(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  if (!r) return null
  if (r.situacao === 'FALHA') return 'falha'
  return Object.keys(r.contrarias || {}).length ? 'contraria' : null
}

const atual = computed(() => principais.value.find((r) => r.data === dataSelecionada.value) || null)
const replica = computed(() => props.recomendacoes.find((r) => r.tipo === 'REPLICA' && r.data === dataSelecionada.value) || null)
const consistenciaDoDia = computed(() => consistencia(atual.value, replica.value))
const contraria = (ativo, ramo) => (atual.value?.contrarias?.[ativo] || []).includes(ramo)

// "O que foi à IA": num modal, carregado sob demanda (uma vez por dia escolhido). Esc fecha.
const detalhe = ref(null)
const detalheAberto = ref(false)
const detalheCarregando = ref(false)
const detalheErro = ref('')

watch(dataSelecionada, () => {
  detalhe.value = null
  detalheAberto.value = false
})

// As abas do modal, como no "Prompt enviado" do Centro de Decisão e no prompt da Metodologia: o prompt do dia primeiro,
// a instrução do sistema depois e uma aba por resposta (a 2ª só existe quando a 1ª foi recusada). "Copiar" copia a aba aberta.
const abaDetalhe = ref('prompt')
const abasDetalhe = computed(() => {
  if (!detalhe.value?.prompt) return []
  return [
    { codigo: 'prompt', rotulo: 'Prompt', texto: detalhe.value.prompt },
    { codigo: 'instrucao', rotulo: 'Instrução do sistema', texto: detalhe.value.instrucao },
    ...(detalhe.value.respostas || []).map((resposta, i) => ({
      codigo: `resposta-${i}`,
      rotulo: `Resposta ${i + 1}`,
      texto: resposta.texto,
      resposta
    }))
  ]
})
const abaDetalheAtual = computed(() => abasDetalhe.value.find((a) => a.codigo === abaDetalhe.value) || abasDetalhe.value[0])
const copiado = ref(false)
async function copiarAba() {
  try {
    await navigator.clipboard.writeText(abaDetalheAtual.value.texto || '')
    copiado.value = true
    setTimeout(() => {
      copiado.value = false
    }, 2000)
  } catch (_err) {
    detalheErro.value = 'Não foi possível copiar o texto: selecione e copie manualmente.'
  }
}

const fecharComEsc = (evento) => {
  if (evento.key === 'Escape') detalheAberto.value = false
}
watch(detalheAberto, (aberto) => {
  if (aberto) window.addEventListener('keydown', fecharComEsc)
  else window.removeEventListener('keydown', fecharComEsc)
})
onBeforeUnmount(() => window.removeEventListener('keydown', fecharComEsc))

async function abrirDetalhe() {
  detalheAberto.value = true
  abaDetalhe.value = 'prompt'
  if (detalhe.value || !atual.value) return
  detalheCarregando.value = true
  detalheErro.value = ''
  try {
    detalhe.value = await carteirasService.obterRecomendacao(props.workspaceId, props.carteiraId, atual.value.id)
  } catch (_err) {
    detalheErro.value = 'Não foi possível carregar o que foi à IA.'
  } finally {
    detalheCarregando.value = false
  }
}
</script>

<template>
  <div>
    <p v-if="!principais.length" class="text-muted">
      Nenhuma recomendação ainda: a primeira sai na decisão da primeira rodada, depois das leituras de tendência do dia.
    </p>
    <template v-else>
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <label for="rec-data" class="small text-muted mb-0">Dia</label>
        <div class="d-flex align-items-center gap-1">
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            title="Dia anterior com recomendação"
            aria-label="Dia anterior com recomendação"
            :disabled="indice >= principais.length - 1"
            @click="irPara(indice + 1)"
          >
            <i class="bi bi-chevron-left"></i>
          </button>
          <DatePicker
            v-model="dataDoCalendario"
            input-id="rec-data"
            date-format="dd/mm/yy"
            size="small"
            show-icon
            icon-display="input"
            :manual-input="false"
            :min-date="limites.min"
            :max-date="limites.max"
            :disabled-dates="desabilitados"
            class="rec-calendario"
          >
            <template #date="{ date }">
              <span class="rec-dia" :class="`rec-dia--${marcaDoDia(date) || 'normal'}`">{{ date.day }}</span>
            </template>
            <template #footer>
              <div class="rec-legenda small text-muted">
                <span><span class="rec-ponto rec-ponto--falha"></span> falhou (fallback "manter")</span>
                <span><span class="rec-ponto rec-ponto--contraria"></span> contrária à leitura</span>
                <span>Dias apagados: sem recomendação.</span>
              </div>
            </template>
          </DatePicker>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            title="Próximo dia com recomendação"
            aria-label="Próximo dia com recomendação"
            :disabled="indice <= 0"
            @click="irPara(indice - 1)"
          >
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
        <span class="badge" :class="atual.situacao === 'VALIDA' ? 'text-bg-success' : 'text-bg-danger'">{{ rotulo(atual.situacao) }}</span>
        <span class="small text-muted">
          {{ atual.modeloDevolvido || atual.modeloPedido || 'sem modelo' }} · {{ atual.versaoPrompt || '—' }}
          <template v-if="atual.tokens"> · {{ atual.tokens.total.toLocaleString('pt-BR') }} tokens</template>
          · custo {{ formatarUsd(atual.custoUsd) }}
          <template v-if="atual.compartilhada">
            · <span title="A chamada é feita uma vez por dia para cada combinação de ativos e vale para todas as carteiras com esses ativos; o custo é o da chamada, não desta carteira.">chamada compartilhada</span>
          </template>
        </span>
        <button type="button" class="btn btn-outline-secondary btn-sm ms-auto" @click="abrirDetalhe">
          <i class="bi bi-chat-square-text me-1"></i> O que foi à IA
        </button>
      </div>

      <div v-if="atual.situacao === 'FALHA'" class="alert alert-warning small">
        <i class="bi bi-exclamation-triangle me-1"></i>
        {{ rotulo(atual.motivoFalha) }}<template v-if="atual.detalhes?.erro">: {{ atual.detalhes.erro }}</template>.
        Neste dia, a trilha IA ficou no fallback "manter": nenhuma entrada nova; as posições, os stops e os alvos seguiram.
      </div>

      <div v-else class="row g-3">
        <div v-for="r in atual.recomendacoes" :key="r.ativo" class="col-lg-6 col-xxl-4">
          <div class="card h-100">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <h3 class="h6 mb-0">{{ nomeAtivo(r.ativo) }}</h3>
                <span class="badge text-bg-secondary" title="Ordem para novas entradas quando não há vaga para todos">Prioridade {{ r.prioridade }}</span>
              </div>
              <div v-for="ramo in RAMOS" :key="ramo.chave" class="mb-2">
                <div class="d-flex align-items-center gap-2">
                  <span class="small fw-bold ramo-nome">{{ ramo.nome }}</span>
                  <span class="badge" :class="corDaAcao(r[ramo.chave].acao)">{{ rotulo(r[ramo.chave].acao) }}</span>
                  <span v-if="contraria(r.ativo, ramo.chave)" class="badge text-bg-warning" title="Contra a tendência da leitura do MÉDIO: marcada e medida, não recusada">contra a leitura</span>
                </div>
                <div class="small">{{ r[ramo.chave].porque }}</div>
              </div>
              <div class="small mt-2"><span class="fw-bold">Invalida se:</span> {{ r.invalidaSe }}</div>
              <div class="small mt-1">
                <span class="fw-bold">Evidências:</span>
                <span v-for="e in r.evidencias" :key="e" class="badge text-bg-light border ms-1">{{ e }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p v-if="replica" class="small text-muted mt-3 mb-0">
        <i class="bi bi-arrow-repeat me-1"></i>
        Réplica semanal (a mesma entrada, de novo; não decide nada):
        <template v-if="consistenciaDoDia">repetiu {{ consistenciaDoDia.iguais }} de {{ consistenciaDoDia.total }} ramos.</template>
        <template v-else>{{ rotulo(replica.situacao).toLowerCase() }}{{ replica.motivoFalha ? ` (${rotulo(replica.motivoFalha)})` : '' }}.</template>
      </p>


      <Teleport to="body">
        <div v-if="detalheAberto" class="finmind-modal-backdrop" @click.self="detalheAberto = false">
          <div class="modal d-block" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="rec-detalhe-titulo">
            <div class="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered">
              <div class="modal-content">
                <div class="modal-header">
                  <h2 id="rec-detalhe-titulo" class="modal-title h5">O que foi à IA · {{ formatarData(atual.data) }}</h2>
                  <button type="button" class="btn-close" aria-label="Fechar" @click="detalheAberto = false"></button>
                </div>
                <div class="modal-body">
                  <div v-if="detalheCarregando" class="text-muted small">Carregando...</div>
                  <div v-else-if="detalheErro" class="alert alert-danger small mb-0">{{ detalheErro }}</div>
                  <template v-else-if="detalhe">
                    <p v-if="!detalhe.prompt" class="small text-muted mb-0">Nada foi à IA neste dia ({{ rotulo(detalhe.motivoFalha) }}).</p>
                    <template v-else>
                      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                        <div class="btn-group btn-group-sm" role="tablist">
                          <button
                            v-for="aba in abasDetalhe"
                            :key="aba.codigo"
                            type="button"
                            role="tab"
                            class="btn"
                            :class="abaDetalheAtual.codigo === aba.codigo ? 'btn-primary' : 'btn-outline-primary'"
                            :aria-selected="abaDetalheAtual.codigo === aba.codigo"
                            @click="abaDetalhe = aba.codigo"
                          >
                            {{ aba.rotulo }}
                            <i v-if="aba.resposta?.erros.length" class="bi bi-x-circle-fill ms-1" title="Recusada"></i>
                          </button>
                        </div>
                        <button type="button" class="btn btn-outline-secondary btn-sm" @click="copiarAba">
                          <i class="bi" :class="copiado ? 'bi-check2' : 'bi-clipboard'"></i> {{ copiado ? 'Copiado' : 'Copiar' }}
                        </button>
                      </div>
                      <template v-if="abaDetalheAtual.resposta">
                        <p class="small text-muted mb-2">
                          <template v-if="abaDetalheAtual.resposta.modelo">Modelo {{ abaDetalheAtual.resposta.modelo }}. </template>
                          <span v-if="abaDetalheAtual.resposta.erros.length" class="badge text-bg-danger">recusada</span>
                        </p>
                        <ul v-if="abaDetalheAtual.resposta.erros.length" class="small text-danger">
                          <li v-for="e in abaDetalheAtual.resposta.erros" :key="e">{{ e }}</li>
                        </ul>
                      </template>
                      <pre class="texto-ia texto-ia--modal mb-0">{{ abaDetalheAtual.texto }}</pre>
                    </template>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Teleport>
    </template>
  </div>
</template>

<style scoped>
.finmind-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1055;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.rec-calendario {
  width: 9.5rem;
}

/* A marca no calendário: um ponto sob o número (falha em vermelho; recomendação contrária à leitura em amarelo). O
   painel do DatePicker vai para o body, fora do escopo deste componente: o slot é renderizado aqui, então as classes
   do conteúdo dele continuam com o escopo. */
.rec-dia {
  position: relative;
}

.rec-dia--falha::after,
.rec-dia--contraria::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -0.35rem;
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 50%;
  transform: translateX(-50%);
}

.rec-dia--falha::after,
.rec-ponto--falha {
  background: var(--bs-danger);
}

.rec-dia--contraria::after,
.rec-ponto--contraria {
  background: var(--bs-warning);
}

.rec-legenda {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding-top: 0.5rem;
  margin-top: 0.25rem;
  border-top: 1px solid var(--bs-border-color);
}

.rec-ponto {
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  vertical-align: middle;
}

.ramo-nome {
  min-width: 6.5rem;
}

.texto-ia {
  white-space: pre-wrap;
  font-size: 0.8rem;
  background: var(--bs-tertiary-bg);
  border: 1px solid var(--bs-border-color);
  border-radius: 0.375rem;
  padding: 0.75rem;
  max-height: 24rem;
  overflow: auto;
}

/* No modal, o texto ocupa a altura da janela (sem uma segunda barra de rolagem curta). */
.texto-ia--modal {
  max-height: 65vh;
}
</style>
