<script setup>
import { computed, ref, watch } from 'vue'
import carteirasService from '../../services/carteiras.service.js'
import { formatarData, nomeAtivo } from '../../utils/carteiras.js'

// Criar uma carteira virtual (ADR 0127). Os parâmetros são os padrões da Cartilha v1.0 para a conta e os ativos; a
// aba Configuração muda depois (uma versão nova, com motivo). Conta, capital e início ficam fixos.
const props = defineProps({
  open: { type: Boolean, default: false },
  workspaceId: { type: String, required: true }
})

const emit = defineEmits(['close', 'created'])

const opcoes = ref(null)
const carregando = ref(false)
const nome = ref('')
const conta = ref('B3')
const capital = ref('10000')
const inicio = ref('')
const ativos = ref([])
const errorMessage = ref('')
const erros = ref([])
const saving = ref(false)

const ativosDaConta = computed(() => (opcoes.value?.ativos || []).filter((a) => a.conta === conta.value))

async function carregar() {
  carregando.value = true
  errorMessage.value = ''
  try {
    opcoes.value = await carteirasService.obterOpcoes(props.workspaceId)
    inicio.value = opcoes.value.inicioMinimo
    ativos.value = ativosDaConta.value.map((a) => a.codigo)
  } catch (err) {
    errorMessage.value = err.response?.data?.error?.message || 'Não foi possível carregar as opções.'
  } finally {
    carregando.value = false
  }
}

// Cada abertura começa limpa.
watch(
  () => props.open,
  (aberto) => {
    if (!aberto) return
    nome.value = ''
    conta.value = 'B3'
    capital.value = '10000'
    erros.value = []
    carregar()
  }
)

watch(conta, () => {
  ativos.value = ativosDaConta.value.map((a) => a.codigo)
})

async function onSubmit() {
  errorMessage.value = ''
  erros.value = []
  saving.value = true
  try {
    const carteira = await carteirasService.criarCarteira(props.workspaceId, {
      nome: nome.value,
      conta: conta.value,
      capitalInicial: Number(String(capital.value).replace(/\./g, '').replace(',', '.')),
      dataInicio: inicio.value,
      // Na ordem da conta (a ordem fixa dos ativos desempata a prioridade, ADR 0127, §6).
      ativos: ativosDaConta.value.map((a) => a.codigo).filter((c) => ativos.value.includes(c))
    })
    emit('created', carteira)
  } catch (err) {
    const erro = err.response?.data?.error
    errorMessage.value = erro?.message || 'Não foi possível criar a carteira.'
    erros.value = erro?.details?.erros || []
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="finmind-modal-backdrop" @click.self="emit('close')">
      <div class="modal d-block" tabindex="-1" role="dialog">
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title h5">Nova carteira virtual</h2>
              <button type="button" class="btn-close" aria-label="Fechar" @click="emit('close')"></button>
            </div>

            <form @submit.prevent="onSubmit">
              <div class="modal-body">
                <p class="text-muted small">
                  Simulação: nenhuma ordem real. Cada dia útil, a rotina decide e liquida as trilhas (operador, IA e
                  determinística) e as referências, com os mesmos parâmetros para todas. Conta, capital e início não
                  mudam depois.
                </p>

                <div v-if="carregando" class="text-muted">Carregando...</div>
                <div v-else-if="opcoes" class="row g-3">
                  <div class="col-12">
                    <label for="carteira-nome" class="form-label">Nome</label>
                    <input id="carteira-nome" v-model="nome" type="text" class="form-control" maxlength="120" required placeholder="Ex.: Conta B3 — Agro" />
                  </div>

                  <div class="col-sm-4">
                    <label for="carteira-conta" class="form-label">Conta</label>
                    <select id="carteira-conta" v-model="conta" class="form-select">
                      <option v-for="c in opcoes.contas" :key="c.codigo" :value="c.codigo" :disabled="!c.disponivel">
                        {{ c.rotulo }} ({{ c.moeda }}){{ c.disponivel ? '' : ' — em breve' }}
                      </option>
                    </select>
                  </div>
                  <div class="col-sm-4">
                    <label for="carteira-capital" class="form-label">Capital inicial</label>
                    <input id="carteira-capital" v-model="capital" type="text" inputmode="decimal" class="form-control" required />
                  </div>
                  <div class="col-sm-4">
                    <label for="carteira-inicio" class="form-label">Início (1ª rodada)</label>
                    <input id="carteira-inicio" v-model="inicio" type="date" class="form-control" :min="opcoes.inicioMinimo" required />
                    <div class="form-text">Um dia útil a partir de {{ formatarData(opcoes.inicioMinimo) }}.</div>
                  </div>

                  <div class="col-12">
                    <span class="form-label d-block">Ativos</span>
                    <div v-for="a in ativosDaConta" :key="a.codigo" class="form-check form-check-inline">
                      <input :id="`carteira-ativo-${a.codigo}`" v-model="ativos" class="form-check-input" type="checkbox" :value="a.codigo" />
                      <label class="form-check-label" :for="`carteira-ativo-${a.codigo}`">
                        {{ nomeAtivo(a.codigo) }} <span class="text-muted small">({{ a.unidade }})</span>
                      </label>
                    </div>
                  </div>

                  <div class="col-12">
                    <div class="alert alert-light border small mb-0">
                      <i class="bi bi-sliders me-1"></i>
                      Parâmetros: os padrões da Cartilha de Operações v1.0 (risco, stop, alvos e travas). O custo por
                      contrato começa pendente (conta como zero) até o número real. Dá para mudar na aba
                      <strong>Configuração</strong>, com motivo, depois de criar.
                    </div>
                  </div>
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
                <button type="submit" class="btn btn-primary" :disabled="saving || carregando || !opcoes || !nome.trim() || !ativos.length">
                  {{ saving ? 'Criando...' : 'Criar carteira' }}
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
  overflow-y: auto;
}
</style>
