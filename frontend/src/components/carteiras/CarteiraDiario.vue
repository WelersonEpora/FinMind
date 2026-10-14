<script setup>
import { computed, ref, watch } from 'vue'
import CarteiraDiarioEntradaModal from './CarteiraDiarioEntradaModal.vue'
import CarteiraDiarioAcaoModal from './CarteiraDiarioAcaoModal.vue'
import ConfirmModal from '../ConfirmModal.vue'
import carteirasService from '../../services/carteiras.service.js'
import { classeSinal, formatarData, formatarMoeda, formatarPreco, formatarQuantidade, formatarR, nomeAtivo, rotulo } from '../../utils/carteiras.js'

// O diário do operador (ADR 0127, §7; etapa 6): o dia aberto para registro (a rodada ainda não liquidada), as entradas
// planejadas (aguardam a liquidação; editar e cancelar), as posições abertas (zerar, reduzir, mover o stop) e as
// encerradas. O dono e o editor do espaço registram; o viewer só lê.
const props = defineProps({
  workspaceId: { type: String, required: true },
  carteira: { type: Object, required: true },
  podeOperar: { type: Boolean, default: false }
})

const emit = defineEmits(['alterado'])

const diario = ref(null)
const loading = ref(true)
const errorMessage = ref('')
const mensagem = ref('')

async function carregar() {
  loading.value = true
  errorMessage.value = ''
  try {
    diario.value = await carteirasService.obterDiario(props.workspaceId, props.carteira.id)
  } catch (_err) {
    errorMessage.value = 'Não foi possível carregar o diário.'
  } finally {
    loading.value = false
  }
}

watch(() => props.carteira.id, carregar, { immediate: true })

const dia = computed(() => diario.value?.dia || { aberto: false })
const operacoes = computed(() => diario.value?.operacoes || [])
const planejadas = computed(() => operacoes.value.filter((o) => o.fase === 'PLANEJADA'))
const abertas = computed(() => operacoes.value.filter((o) => o.fase === 'ABERTA' || o.fase === 'EM_GESTAO'))
const encerradas = computed(() => operacoes.value.filter((o) => ['ENCERRADA', 'NAO_EXECUTADA', 'CANCELADA'].includes(o.fase)))
const podeRegistrar = computed(() => props.podeOperar && dia.value.aberto)
const fracaoReduzirPct = computed(() => props.carteira.parametros?.carteira?.fracaoReduzirPct ?? 50)
const saidaPlanejada = (op) => op.saidas.find((s) => s.situacao === 'CRIADA') || null
const stopVigente = (op) => op.posicao?.stop ?? op.entrada.stopInformado

// Os modais.
const entradaOpen = ref(false)
const ordemEmEdicao = ref(null)
const acaoOpen = ref(false)
const acao = ref('ZERAR')
const operacaoDaAcao = ref(null)
const cancelando = ref(null)
const cancelandoOcupado = ref(false)

function novaEntrada() {
  ordemEmEdicao.value = null
  entradaOpen.value = true
}
function editar(op) {
  ordemEmEdicao.value = op.entrada
  entradaOpen.value = true
}
function abrirAcao(op, qual) {
  operacaoDaAcao.value = op
  acao.value = qual
  acaoOpen.value = true
}

async function depoisDeGravar(texto) {
  entradaOpen.value = false
  acaoOpen.value = false
  mensagem.value = texto
  await carregar()
  emit('alterado')
}

async function confirmarCancelamento() {
  cancelandoOcupado.value = true
  try {
    await carteirasService.cancelarOrdem(props.workspaceId, props.carteira.id, cancelando.value.id)
    cancelando.value = null
    await depoisDeGravar('Ordem cancelada.')
  } catch (err) {
    cancelando.value = null
    errorMessage.value = err.response?.data?.error?.message || 'Não foi possível cancelar a ordem.'
  } finally {
    cancelandoOcupado.value = false
  }
}
</script>

<template>
  <div>
    <div v-if="loading && !diario" class="text-muted">Carregando...</div>
    <div v-else-if="errorMessage && !diario" class="alert alert-danger">{{ errorMessage }}</div>
    <template v-else-if="diario">
      <output v-if="mensagem" class="alert alert-success alert-dismissible d-block py-2 small">
        {{ mensagem }}
        <button type="button" class="btn-close py-2" aria-label="Fechar" @click="mensagem = ''"></button>
      </output>
      <div v-if="errorMessage" class="alert alert-danger py-2 small">{{ errorMessage }}</div>

      <div class="card mb-3">
        <div class="card-body d-flex flex-wrap align-items-center gap-3">
          <div class="me-auto">
            <template v-if="dia.aberto">
              <div><i class="bi bi-unlock me-1 text-success"></i>Registro aberto para <strong>{{ formatarData(dia.data) }}</strong></div>
              <div class="small text-muted">
                Vagas livres: {{ dia.vagas }} · patrimônio da véspera {{ formatarMoeda(dia.patrimonio, carteira.moeda) }}
                <template v-if="dia.travas?.length"> · travas: {{ dia.travas.map((t) => rotulo(t.codigo)).join(', ') }}</template>
              </div>
            </template>
            <template v-else>
              <div><i class="bi bi-lock me-1 text-muted"></i>Registro fechado agora</div>
              <div class="small text-muted">{{ rotulo(dia.motivo) }}<template v-if="dia.data"> ({{ formatarData(dia.data) }})</template>.</div>
            </template>
          </div>
          <button v-if="podeRegistrar" type="button" class="btn btn-primary btn-sm" @click="novaEntrada">
            <i class="bi bi-plus-lg me-1"></i> Nova entrada
          </button>
          <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="loading" title="Atualizar" @click="carregar">
            <i class="bi bi-arrow-clockwise"></i>
          </button>
        </div>
      </div>
      <p v-if="!podeOperar" class="small text-muted">Só o proprietário e os editores do espaço registram no diário.</p>

      <!-- Planejadas -->
      <h3 class="h6">Planejadas <span class="text-muted small">(aguardam a liquidação do dia)</span></h3>
      <p v-if="!planejadas.length" class="small text-muted">Nenhuma entrada planejada.</p>
      <div v-else class="table-responsive mb-4">
        <table class="table table-sm align-middle small">
          <thead>
            <tr>
              <th>Dia</th>
              <th>Ativo</th>
              <th>Lado</th>
              <th class="text-end">Entrada</th>
              <th class="text-end">Stop</th>
              <th class="text-end">Alvos</th>
              <th class="text-end">Quantidade</th>
              <th>Checklist</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="op in planejadas" :key="op.id">
              <td>{{ formatarData(op.entrada.dataExecucao) }}</td>
              <td>
                {{ nomeAtivo(op.entrada.ativo) }}
                <div class="text-muted">{{ op.entrada.contrato?.ticker }}</div>
              </td>
              <td><span class="badge" :class="op.entrada.lado === 'COMPRADO' ? 'text-bg-success' : 'text-bg-danger'">{{ rotulo(op.entrada.lado) }}</span></td>
              <td class="text-end">{{ formatarPreco(op.entrada.precoInformado) }}</td>
              <td class="text-end">{{ formatarPreco(op.entrada.stopInformado) }}</td>
              <td class="text-end">{{ formatarPreco(op.entrada.detalhes?.plano?.alvo1) }} / {{ formatarPreco(op.entrada.detalhes?.plano?.alvo2) }}</td>
              <td class="text-end">{{ formatarQuantidade(op.entrada.quantidade) }}</td>
              <td>
                <span class="badge" :class="op.entrada.detalhes?.aderente ? 'text-bg-success' : 'text-bg-warning'">{{ op.entrada.detalhes?.aderente ? 'aderente' : 'fora' }}</span>
              </td>
              <td class="text-end text-nowrap">
                <template v-if="podeRegistrar && op.entrada.dataExecucao === dia.data">
                  <button type="button" class="btn btn-outline-secondary btn-sm me-1" @click="editar(op)">Editar</button>
                  <button type="button" class="btn btn-outline-danger btn-sm" @click="cancelando = op.entrada">Cancelar</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Abertas -->
      <h3 class="h6">Abertas</h3>
      <p v-if="!abertas.length" class="small text-muted">Nenhuma posição aberta.</p>
      <div v-else class="table-responsive mb-4">
        <table class="table table-sm align-middle small">
          <thead>
            <tr>
              <th>Ativo</th>
              <th>Lado</th>
              <th>Entrada</th>
              <th class="text-end">Stop</th>
              <th class="text-end">Alvos</th>
              <th class="text-end">Quantidade</th>
              <th class="text-end">Resultado</th>
              <th>Fase</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="op in abertas" :key="op.id">
              <td>
                {{ nomeAtivo(op.posicao.ativo) }}
                <div class="text-muted">{{ op.posicao.contrato?.ticker }}</div>
              </td>
              <td><span class="badge" :class="op.posicao.lado === 'COMPRADO' ? 'text-bg-success' : 'text-bg-danger'">{{ rotulo(op.posicao.lado) }}</span></td>
              <td>
                {{ formatarPreco(op.posicao.entrada) }}
                <div class="text-muted">{{ formatarData(op.posicao.dataEntrada) }}</div>
              </td>
              <td class="text-end">
                {{ formatarPreco(stopVigente(op)) }}
                <div v-if="op.stopProgramado" class="text-muted">{{ formatarPreco(op.stopProgramado.stop) }} a partir de {{ formatarData(op.stopProgramado.vigenteDesde) }}</div>
              </td>
              <td class="text-end">
                <span :class="{ 'text-decoration-line-through text-muted': op.posicao.alvo1Atingido }">{{ formatarPreco(op.posicao.alvo1) }}</span> /
                {{ formatarPreco(op.posicao.alvo2) }}
              </td>
              <td class="text-end">{{ formatarQuantidade(op.posicao.quantidadeAberta) }}</td>
              <td class="text-end" :class="classeSinal(op.posicao.resultadoMoeda)">
                {{ formatarMoeda(op.posicao.resultadoMoeda, carteira.moeda) }}
                <div>{{ formatarR(op.posicao.resultadoR) }}</div>
              </td>
              <td>
                {{ rotulo(op.fase) }}
                <div v-if="saidaPlanejada(op)" class="text-muted">
                  {{ rotulo(saidaPlanejada(op).tipo) }} a {{ formatarPreco(saidaPlanejada(op).precoInformado) }} planejada
                  <button
                    v-if="podeRegistrar && saidaPlanejada(op).motivo === 'OPERADOR'"
                    type="button"
                    class="btn btn-link btn-sm p-0 align-baseline text-danger"
                    @click="cancelando = saidaPlanejada(op)"
                  >
                    cancelar
                  </button>
                </div>
              </td>
              <td class="text-end text-nowrap">
                <template v-if="podeRegistrar && !saidaPlanejada(op)">
                  <button type="button" class="btn btn-outline-secondary btn-sm me-1" @click="abrirAcao(op, 'STOP')">Mover stop</button>
                  <button v-if="!op.posicao.reduzida" type="button" class="btn btn-outline-warning btn-sm me-1" @click="abrirAcao(op, 'REDUZIR')">Reduzir</button>
                  <button type="button" class="btn btn-outline-danger btn-sm" @click="abrirAcao(op, 'ZERAR')">Zerar</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Encerradas -->
      <h3 class="h6">Encerradas</h3>
      <p v-if="!encerradas.length" class="small text-muted">Nenhuma operação encerrada.</p>
      <div v-else class="table-responsive">
        <table class="table table-sm align-middle small">
          <thead>
            <tr>
              <th>Ativo</th>
              <th>Lado</th>
              <th>Entrada</th>
              <th>Saída</th>
              <th class="text-end">Resultado</th>
              <th>Checklist</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="op in encerradas" :key="op.id" :class="{ 'text-muted': op.fase !== 'ENCERRADA' }">
              <td>{{ nomeAtivo(op.entrada.ativo) }}</td>
              <td>{{ rotulo(op.entrada.lado) }}</td>
              <td>
                {{ formatarPreco(op.posicao?.entrada ?? op.entrada.precoInformado) }}
                <div class="text-muted">{{ formatarData(op.posicao?.dataEntrada ?? op.entrada.dataExecucao) }}</div>
              </td>
              <td>
                <template v-if="op.fase === 'ENCERRADA'">
                  {{ formatarData(op.posicao.dataSaida) }}
                  <div class="text-muted">{{ rotulo(op.posicao.motivoSaida) }}</div>
                </template>
                <template v-else>
                  {{ rotulo(op.fase) }}
                  <div v-if="op.entrada.motivoSituacao" class="text-muted">{{ rotulo(op.entrada.motivoSituacao) }}</div>
                </template>
              </td>
              <td class="text-end" :class="classeSinal(op.posicao?.resultadoMoeda)">
                <template v-if="op.posicao">
                  {{ formatarMoeda(op.posicao.resultadoMoeda, carteira.moeda) }}
                  <div>{{ formatarR(op.posicao.resultadoR) }}</div>
                </template>
                <template v-else>—</template>
              </td>
              <td>
                <span class="badge" :class="op.entrada.detalhes?.aderente ? 'text-bg-success' : 'text-bg-warning'">{{ op.entrada.detalhes?.aderente ? 'aderente' : 'fora' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <CarteiraDiarioEntradaModal
      v-if="diario && dia.aberto"
      :open="entradaOpen"
      :workspace-id="workspaceId"
      :carteira-id="carteira.id"
      :dia="dia"
      :checklist="diario.checklist"
      :moeda="carteira.moeda"
      :ordem="ordemEmEdicao"
      @close="entradaOpen = false"
      @saved="depoisDeGravar(ordemEmEdicao ? 'Entrada planejada atualizada.' : 'Entrada registrada: a liquidação do dia a executa.')"
    />
    <CarteiraDiarioAcaoModal
      v-if="diario && dia.aberto"
      :open="acaoOpen"
      :acao="acao"
      :operacao="operacaoDaAcao"
      :workspace-id="workspaceId"
      :carteira-id="carteira.id"
      :dia="dia"
      :fracao-reduzir-pct="fracaoReduzirPct"
      @close="acaoOpen = false"
      @saved="depoisDeGravar(acao === 'STOP' ? 'Stop movido: vale a partir do pregão seguinte.' : 'Saída registrada: a liquidação do dia a executa.')"
    />
    <ConfirmModal
      :open="Boolean(cancelando)"
      title="Cancelar a ordem"
      confirm-label="Cancelar a ordem"
      :busy="cancelandoOcupado"
      @close="cancelando = null"
      @confirm="confirmarCancelamento"
    >
      <p v-if="cancelando" class="mb-0">
        Cancelar {{ rotulo(cancelando.tipo).toLowerCase() }} de {{ nomeAtivo(cancelando.ativo) }} planejada para
        {{ formatarData(cancelando.dataExecucao) }}?
      </p>
    </ConfirmModal>
  </div>
</template>
