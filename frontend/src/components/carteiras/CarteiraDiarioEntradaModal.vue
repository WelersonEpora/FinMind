<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import carteirasService from '../../services/carteiras.service.js'
import { VERIFICACOES, formatarData, formatarMoeda, formatarPreco, formatarQuantidade, lerNumero, nomeAtivo, rotulo } from '../../utils/carteiras.js'

// A entrada do operador no diário (ADR 0127, §7): ativo, lado, o preço em que entrou e o stop. A conferência roda a cada
// mudança (sem gravar): o piso de ATR, o R:R, o tamanho pelo risco, as vagas e as travas; e mostra a quantidade e os
// alvos da Tabela 2. O checklist da Cartilha (Cap. 7.1): os itens que o sistema confere vêm marcados por ele; os outros,
// o operador marca. Um item manual desmarcado não impede o registro, só tira a aderência. `ordem`: a entrada planejada
// que está sendo editada.
const props = defineProps({
  open: { type: Boolean, default: false },
  workspaceId: { type: String, required: true },
  carteiraId: { type: String, required: true },
  dia: { type: Object, required: true },
  checklist: { type: Array, required: true },
  moeda: { type: String, required: true },
  ordem: { type: Object, default: null }
})

const emit = defineEmits(['close', 'saved'])

const ativos = computed(() => Object.keys(props.dia.mercado || {}))
const ativo = ref('')
const lado = ref('COMPRADO')
const entrada = ref('')
const stop = ref('')
const marcados = ref({})
const conferencia = ref(null)
const conferindo = ref(false)
const errorMessage = ref('')
const erros = ref([])
const saving = ref(false)

const mercado = computed(() => props.dia.mercado?.[ativo.value] || null)
const numero = lerNumero
const preenchido = computed(() => ativo.value && numero(entrada.value) > 0 && numero(stop.value) > 0)
const okDe = computed(() => new Map((conferencia.value?.verificacoes || []).map((v) => [v.codigo, v.ok])))
const marcadoPeloSistema = (item) => item.automatico.every((c) => okDe.value.get(c) === true)
const aderente = computed(() => props.checklist.every((item) => (item.automatico ? marcadoPeloSistema(item) : marcados.value[item.codigo])))
// Uma sugestão de stop: o piso a partir do preço digitado.
const stopNoPiso = computed(() => {
  const p = numero(entrada.value)
  if (!(p > 0) || !mercado.value?.piso) return null
  return lado.value === 'COMPRADO' ? p - mercado.value.piso : p + mercado.value.piso
})

// Cada abertura começa do zero (ou da entrada em edição).
watch(
  () => props.open,
  (aberto) => {
    if (!aberto) return
    const o = props.ordem
    ativo.value = o?.ativo || ativos.value[0] || ''
    lado.value = o?.lado || 'COMPRADO'
    entrada.value = o?.precoInformado != null ? String(o.precoInformado).replace('.', ',') : ''
    stop.value = o?.stopInformado != null ? String(o.stopInformado).replace('.', ',') : ''
    marcados.value = Object.fromEntries(props.checklist.filter((i) => !i.automatico).map((i) => [i.codigo, o?.detalhes?.checklist?.[i.codigo] === true]))
    conferencia.value = null
    errorMessage.value = ''
    erros.value = []
  }
)

let temporizador = null
let pedido = 0
async function conferir() {
  if (!preenchido.value) {
    conferencia.value = null
    return
  }
  const meu = ++pedido
  conferindo.value = true
  try {
    const r = await carteirasService.conferirEntrada(props.workspaceId, props.carteiraId, {
      ativo: ativo.value,
      lado: lado.value,
      entrada: numero(entrada.value),
      stop: numero(stop.value),
      ordemId: props.ordem?.id ?? null
    })
    if (meu === pedido) {
      conferencia.value = r
      errorMessage.value = ''
      erros.value = []
    }
  } catch (err) {
    if (meu !== pedido) return
    conferencia.value = null
    const erro = err.response?.data?.error
    errorMessage.value = erro?.message || 'Não foi possível conferir a entrada.'
    erros.value = erro?.details?.erros || []
  } finally {
    if (meu === pedido) conferindo.value = false
  }
}

watch([ativo, lado, entrada, stop], () => {
  if (!props.open) return
  clearTimeout(temporizador)
  temporizador = setTimeout(conferir, 400)
})
onBeforeUnmount(() => clearTimeout(temporizador))

async function onSubmit() {
  errorMessage.value = ''
  erros.value = []
  saving.value = true
  try {
    const dados = { ativo: ativo.value, lado: lado.value, entrada: numero(entrada.value), stop: numero(stop.value), checklist: marcados.value }
    const ordem = props.ordem
      ? await carteirasService.editarEntrada(props.workspaceId, props.carteiraId, props.ordem.id, dados)
      : await carteirasService.registrarEntrada(props.workspaceId, props.carteiraId, dados)
    emit('saved', ordem)
  } catch (err) {
    const erro = err.response?.data?.error
    errorMessage.value = erro?.message || 'Não foi possível registrar a entrada.'
    erros.value = erro?.details?.erros || (erro?.details?.verificacoes || []).filter((v) => !v.ok).map((v) => `${VERIFICACOES[v.codigo] || v.codigo}: ${rotulo(v.detalhe)}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="finmind-modal-backdrop" @click.self="emit('close')">
      <div class="modal d-block" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="diario-entrada-titulo">
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="diario-entrada-titulo" class="modal-title h5">{{ ordem ? 'Editar entrada planejada' : 'Nova entrada' }} · {{ formatarData(dia.data) }}</h2>
              <button type="button" class="btn-close" aria-label="Fechar" @click="emit('close')"></button>
            </div>

            <!-- O form fica entre o modal-content e o modal-body: sem ser uma coluna flexível, o "scrollable" do Bootstrap não rola o corpo e o rodapé sai da tela. -->
            <form class="d-flex flex-column overflow-hidden" @submit.prevent="onSubmit">
              <div class="modal-body">
                <p class="text-muted small">
                  Registre o preço em que você entrou e o seu stop. O sistema calcula a quantidade (pelo risco do ativo)
                  e os alvos da Tabela 2; a liquidação confere o preço contra a mínima e a máxima do contrato no dia.
                </p>

                <div class="row g-3">
                  <div class="col-sm-4">
                    <label for="diario-ativo" class="form-label">Ativo</label>
                    <select id="diario-ativo" v-model="ativo" class="form-select" :disabled="Boolean(ordem)">
                      <option v-for="a in ativos" :key="a" :value="a">{{ nomeAtivo(a) }}</option>
                    </select>
                  </div>
                  <div class="col-sm-8">
                    <span class="form-label d-block">Lado</span>
                    <div class="btn-group" role="group" aria-label="Lado">
                      <input id="diario-comprado" v-model="lado" type="radio" class="btn-check" value="COMPRADO" />
                      <label class="btn btn-outline-success" for="diario-comprado">Comprado</label>
                      <input id="diario-vendido" v-model="lado" type="radio" class="btn-check" value="VENDIDO" />
                      <label class="btn btn-outline-danger" for="diario-vendido">Vendido</label>
                    </div>
                  </div>

                  <div v-if="mercado" class="col-12">
                    <div class="small text-muted border rounded px-2 py-1">
                      Contrato <strong>{{ mercado.contrato?.ticker }}</strong> · último ajuste {{ formatarPreco(mercado.ajuste) }}
                      ({{ formatarData(mercado.dataAjuste) }}) · ATR(14) {{ formatarPreco(mercado.atr) }} · distância mínima do stop
                      {{ formatarPreco(mercado.piso) }}
                    </div>
                  </div>
                  <div v-else-if="ativo" class="col-12">
                    <div class="alert alert-warning small py-2 mb-0">Sem mercado para {{ nomeAtivo(ativo) }} neste dia: a entrada não pode ser conferida.</div>
                  </div>

                  <div class="col-sm-6">
                    <label for="diario-entrada" class="form-label">Preço de entrada</label>
                    <input id="diario-entrada" v-model="entrada" type="text" inputmode="decimal" class="form-control" required />
                  </div>
                  <div class="col-sm-6">
                    <label for="diario-stop" class="form-label">Stop</label>
                    <input id="diario-stop" v-model="stop" type="text" inputmode="decimal" class="form-control" required />
                    <div v-if="stopNoPiso != null" class="form-text">No piso: {{ formatarPreco(stopNoPiso) }} (pode ficar mais longe).</div>
                  </div>
                </div>

                <h3 class="h6 mt-4">Conferência</h3>
                <p v-if="!preenchido" class="small text-muted mb-0">Preencha o preço e o stop para conferir.</p>
                <p v-else-if="conferindo && !conferencia" class="small text-muted mb-0">Conferindo...</p>
                <template v-else-if="conferencia">
                  <ul class="list-unstyled small mb-2">
                    <li v-for="v in conferencia.verificacoes" :key="v.codigo">
                      <i class="bi" :class="v.ok ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-danger'"></i>
                      <strong class="ms-1">{{ VERIFICACOES[v.codigo] || v.codigo }}:</strong> {{ rotulo(v.detalhe) }}
                    </li>
                  </ul>
                  <div v-if="conferencia.plano" class="row g-2 small">
                    <div class="col-6 col-md-3"><span class="text-muted d-block">Quantidade</span>{{ formatarQuantidade(conferencia.plano.quantidade) }}</div>
                    <div class="col-6 col-md-3"><span class="text-muted d-block">Alvo 1</span>{{ formatarPreco(conferencia.plano.alvo1) }}</div>
                    <div class="col-6 col-md-3"><span class="text-muted d-block">Alvo 2</span>{{ formatarPreco(conferencia.plano.alvo2) }}</div>
                    <div class="col-6 col-md-3"><span class="text-muted d-block">Risco (1R)</span>{{ formatarMoeda(conferencia.plano.risco1R, moeda) }}</div>
                    <div class="col-12 text-muted">
                      Com contratos inteiros:
                      <template v-if="conferencia.plano.contratosInteiros.cabe">cabem {{ conferencia.plano.contratosInteiros.quantosCabem }}.</template>
                      <template v-else>não cabe nenhum; capital mínimo para 1, {{ formatarMoeda(conferencia.plano.contratosInteiros.capitalMinimo, moeda) }}.</template>
                    </div>
                  </div>
                </template>

                <h3 class="h6 mt-4">
                  Checklist da Cartilha
                  <span class="badge ms-1" :class="aderente ? 'text-bg-success' : 'text-bg-warning'">{{ aderente ? 'aderente' : 'fora da Cartilha' }}</span>
                </h3>
                <div v-for="(item, i) in checklist" :key="item.codigo" class="form-check small">
                  <input
                    v-if="item.automatico"
                    :id="`diario-check-${item.codigo}`"
                    class="form-check-input"
                    type="checkbox"
                    :checked="marcadoPeloSistema(item)"
                    disabled
                  />
                  <input v-else :id="`diario-check-${item.codigo}`" v-model="marcados[item.codigo]" class="form-check-input" type="checkbox" />
                  <label class="form-check-label" :for="`diario-check-${item.codigo}`">
                    {{ i + 1 }}. {{ item.texto }}
                    <span v-if="item.automatico" class="text-muted">(conferido pelo sistema)</span>
                  </label>
                </div>

                <div v-if="errorMessage" class="alert alert-danger py-2 small mt-3 mb-0">
                  {{ errorMessage }}
                  <ul v-if="erros.length" class="mb-0 mt-1">
                    <li v-for="e in erros" :key="e">{{ e }}</li>
                  </ul>
                </div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" @click="emit('close')">Cancelar</button>
                <button type="submit" class="btn btn-primary" :disabled="saving || !conferencia?.aprovado">
                  {{ saving ? 'Registrando...' : ordem ? 'Salvar' : 'Registrar entrada' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
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
</style>
