<script setup>
import { computed, ref, watch } from 'vue'
import carteirasService from '../../services/carteiras.service.js'
import { formatarData, formatarPreco, formatarQuantidade, lerNumero, nomeAtivo, rotulo } from '../../utils/carteiras.js'

// Uma ação do operador numa posição aberta (ADR 0127, §7): zerar ou reduzir (com o preço em que saiu, conferido contra
// a faixa do dia na liquidação; reduzir é a fração da carteira, uma vez por operação) ou mover o stop (só a favor; vale
// a partir do pregão seguinte). `operacao`: a do diário, com a posição e o stop vigente.
const props = defineProps({
  open: { type: Boolean, default: false },
  acao: { type: String, default: 'ZERAR' },
  operacao: { type: Object, default: null },
  workspaceId: { type: String, required: true },
  carteiraId: { type: String, required: true },
  dia: { type: Object, required: true },
  fracaoReduzirPct: { type: Number, default: 50 }
})

const emit = defineEmits(['close', 'saved'])

const valor = ref('')
const errorMessage = ref('')
const erros = ref([])
const saving = ref(false)

const posicao = computed(() => props.operacao?.posicao || null)
const stopVigente = computed(() => props.operacao?.stopProgramado?.stop ?? posicao.value?.stop ?? null)
const titulos = { ZERAR: 'Zerar a posição', REDUZIR: 'Reduzir a posição', STOP: 'Mover o stop' }

watch(
  () => props.open,
  (aberto) => {
    if (!aberto) return
    valor.value = ''
    errorMessage.value = ''
    erros.value = []
  }
)

async function onSubmit() {
  errorMessage.value = ''
  erros.value = []
  saving.value = true
  try {
    const numero = lerNumero(valor.value)
    if (props.acao === 'STOP') await carteirasService.moverStop(props.workspaceId, props.carteiraId, posicao.value.id, numero)
    else await carteirasService.registrarSaida(props.workspaceId, props.carteiraId, posicao.value.id, { acao: props.acao, preco: numero })
    emit('saved')
  } catch (err) {
    const erro = err.response?.data?.error
    errorMessage.value = erro?.message || 'Não foi possível registrar.'
    erros.value = erro?.details?.erros || []
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open && posicao" class="finmind-modal-backdrop" @click.self="emit('close')">
      <div class="modal d-block" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="diario-acao-titulo">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="diario-acao-titulo" class="modal-title h5">{{ titulos[acao] }} · {{ nomeAtivo(posicao.ativo) }}</h2>
              <button type="button" class="btn-close" aria-label="Fechar" @click="emit('close')"></button>
            </div>
            <form @submit.prevent="onSubmit">
              <div class="modal-body">
                <div class="small text-muted mb-3">
                  {{ rotulo(posicao.lado) }} em {{ posicao.contrato?.ticker }} desde {{ formatarData(posicao.dataEntrada) }} a {{ formatarPreco(posicao.entrada) }} ·
                  quantidade aberta {{ formatarQuantidade(posicao.quantidadeAberta) }} · último ajuste {{ formatarPreco(posicao.ultimoAjuste) }} · stop
                  {{ formatarPreco(stopVigente) }}
                </div>

                <template v-if="acao === 'STOP'">
                  <label for="diario-acao-valor" class="form-label">Novo stop</label>
                  <input id="diario-acao-valor" v-model="valor" type="text" inputmode="decimal" class="form-control" required />
                  <div class="form-text">
                    Só a favor da posição ({{ posicao.lado === 'COMPRADO' ? 'acima' : 'abaixo' }} de {{ formatarPreco(stopVigente) }}) e ainda
                    {{ posicao.lado === 'COMPRADO' ? 'abaixo' : 'acima' }} do último ajuste. Vale a partir do pregão seguinte a
                    {{ formatarData(dia.data) }}.
                  </div>
                </template>
                <template v-else>
                  <label for="diario-acao-valor" class="form-label">Preço de saída</label>
                  <input id="diario-acao-valor" v-model="valor" type="text" inputmode="decimal" class="form-control" required />
                  <div class="form-text">
                    <template v-if="acao === 'REDUZIR'">Sai {{ fracaoReduzirPct }}% da quantidade aberta (uma vez por operação).</template>
                    <template v-else>Sai a quantidade inteira.</template>
                    A liquidação de {{ formatarData(dia.data) }} confere o preço contra a mínima e a máxima do dia; o stop e os
                    alvos são avaliados antes, pela faixa do dia.
                  </div>
                </template>

                <div v-if="errorMessage" class="alert alert-danger py-2 small mt-3 mb-0">
                  {{ errorMessage }}
                  <ul v-if="erros.length" class="mb-0 mt-1">
                    <li v-for="e in erros" :key="e">{{ e }}</li>
                  </ul>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" @click="emit('close')">Cancelar</button>
                <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Registrando...' : 'Registrar' }}</button>
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
