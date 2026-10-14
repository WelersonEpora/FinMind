<script setup>
import { computed, ref } from 'vue'
import vTooltip from 'primevue/tooltip'
import carteirasService from '../../services/carteiras.service.js'
import {
  CAMPOS_ATIVO,
  CAMPOS_CARTEIRA,
  CAMPOS_EXECUCAO,
  TIPOS_VERSAO,
  doFormulario,
  formatarData,
  formatarParametro,
  nomeAtivo,
  paraFormulario
} from '../../utils/carteiras.js'

// Os parâmetros em vigor e o histórico de versões (ADR 0127, §8). Só o dono do espaço muda: os parâmetros inteiros
// vão numa versão nova, com motivo; o servidor classifica a mudança. Só o custo -> correção, vale desde o início; outra
// coisa -> ajuste, a partir da próxima rodada (abre um segmento novo de medição). Os dois juntos são recusados.
const props = defineProps({
  carteira: { type: Object, required: true },
  workspaceId: { type: String, required: true },
  podeEditar: { type: Boolean, default: false }
})

const emit = defineEmits(['salvo'])

const ativos = computed(() => Object.keys(props.carteira.parametros.ativos))

const editando = ref(false)
const formulario = ref(null)
const motivo = ref('')
const erros = ref([])
const errorMessage = ref('')
const saving = ref(false)

function editar() {
  formulario.value = paraFormulario(props.carteira.parametros)
  motivo.value = ''
  erros.value = []
  errorMessage.value = ''
  editando.value = true
}

function cancelar() {
  editando.value = false
}

async function salvar() {
  errorMessage.value = ''
  const lido = doFormulario(formulario.value, props.carteira.parametros)
  erros.value = lido.erros
  if (lido.erros.length) return
  saving.value = true
  try {
    const versao = await carteirasService.registrarVersao(props.workspaceId, props.carteira.id, { parametros: lido.parametros, motivo: motivo.value })
    editando.value = false
    emit('salvo', versao)
  } catch (err) {
    const erro = err.response?.data?.error
    errorMessage.value = erro?.message || 'Não foi possível salvar a versão.'
    erros.value = erro?.details?.erros || []
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
      <h2 class="h6 mb-0">Parâmetros em vigor</h2>
      <div v-if="podeEditar && !editando">
        <button type="button" class="btn btn-outline-primary btn-sm" @click="editar">
          <i class="bi bi-pencil me-1"></i> Nova versão
        </button>
      </div>
    </div>
    <p class="small text-muted">
      Os padrões da Cartilha de Operações v1.0, iguais para as três trilhas. Uma mudança vira uma versão nova, com
      motivo: um ajuste vale a partir da próxima rodada e reinicia a contagem da medição; o custo por contrato, quando
      o número real chegar, vale desde o início, sem reiniciar. Custo e outra mudança vão em versões separadas.
      <template v-if="!podeEditar"> Só o proprietário do espaço muda os parâmetros.</template>
    </p>

    <div class="row g-3">
      <div class="col-xl-7">
        <div class="card h-100">
          <div class="card-body">
            <h3 class="h6">Por ativo</h3>
            <div class="table-responsive">
              <table class="table table-sm small align-middle mb-0">
                <thead>
                  <tr>
                    <th>Parâmetro</th>
                    <th v-for="a in ativos" :key="a" class="text-end">{{ nomeAtivo(a) }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in CAMPOS_ATIVO" :key="c.chave">
                    <td>
                      {{ c.rotulo }}
                      <i
                        v-if="c.ajuda"
                        v-tooltip.top="{ value: c.ajuda, class: 'tooltip-ajuda' }"
                        class="bi bi-question-circle text-muted ms-1 ajuda"
                        :aria-label="c.ajuda"
                      ></i>
                      <div class="text-muted">{{ c.unidade }}</div>
                    </td>
                    <td v-for="a in ativos" :key="a" class="text-end">
                      <input
                        v-if="editando"
                        v-model="formulario.ativos[a][c.chave]"
                        type="text"
                        inputmode="decimal"
                        class="form-control form-control-sm text-end campo"
                        :placeholder="c.nulo ? 'pendente' : ''"
                        :aria-label="`${c.rotulo} — ${nomeAtivo(a)}`"
                      />
                      <span v-else :class="{ 'text-warning-emphasis fw-semibold': carteira.parametros.ativos[a][c.chave] === null && c.nulo }">
                        {{ formatarParametro(carteira.parametros.ativos[a][c.chave], c) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="col-xl-5">
        <div class="card mb-3">
          <div class="card-body">
            <h3 class="h6">Carteira (travas e saídas)</h3>
            <table class="table table-sm small align-middle mb-0">
              <tbody>
                <tr v-for="c in CAMPOS_CARTEIRA" :key="c.chave">
                  <td>{{ c.rotulo }} <span v-if="c.unidade" class="text-muted">({{ c.unidade }})</span></td>
                  <td class="text-end">
                    <input v-if="editando" v-model="formulario.carteira[c.chave]" type="text" inputmode="decimal" class="form-control form-control-sm text-end campo ms-auto" :aria-label="c.rotulo" />
                    <template v-else>{{ formatarParametro(carteira.parametros.carteira[c.chave], c) }}</template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <h3 class="h6">Execução simulada</h3>
            <table class="table table-sm small align-middle mb-0">
              <tbody>
                <tr v-for="c in CAMPOS_EXECUCAO" :key="c.chave">
                  <td>{{ c.rotulo }} <span v-if="c.unidade" class="text-muted">({{ c.unidade }})</span></td>
                  <td class="text-end">
                    <input
                      v-if="editando && c.tipo !== 'texto'"
                      v-model="formulario.execucao[c.chave]"
                      type="text"
                      inputmode="numeric"
                      class="form-control form-control-sm text-end campo ms-auto"
                      :aria-label="c.rotulo"
                    />
                    <template v-else>{{ formatarParametro(carteira.parametros.execucao[c.chave], c) }}</template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div v-if="editando" class="card mt-3 border-primary">
      <div class="card-body">
        <label for="versao-motivo" class="form-label">Motivo da mudança</label>
        <textarea id="versao-motivo" v-model="motivo" class="form-control" rows="2" placeholder="Ex.: custo real da corretora para o milho"></textarea>
        <div v-if="errorMessage || erros.length" class="alert alert-danger py-2 small mt-3 mb-0">
          {{ errorMessage || 'Corrija os campos:' }}
          <ul v-if="erros.length" class="mb-0 mt-1">
            <li v-for="e in erros" :key="e">{{ e }}</li>
          </ul>
        </div>
        <div class="d-flex justify-content-end gap-2 mt-3">
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="cancelar">Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="saving || !motivo.trim()" @click="salvar">
            {{ saving ? 'Salvando...' : 'Salvar versão' }}
          </button>
        </div>
      </div>
    </div>

    <h2 class="h6 mt-4">Histórico de versões</h2>
    <div class="table-responsive">
      <table class="table table-sm small align-middle">
        <thead>
          <tr>
            <th>Versão</th>
            <th>Tipo</th>
            <th>Vale desde</th>
            <th>Motivo</th>
            <th>Registrada em</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in carteira.versoes" :key="v.versao">
            <td>{{ v.versao }}</td>
            <td>{{ TIPOS_VERSAO[v.tipo] || v.tipo }}</td>
            <td class="text-nowrap">{{ formatarData(v.vigenteDesde) }}</td>
            <td>{{ v.motivo }}</td>
            <td class="text-nowrap">{{ v.criadaEm ? new Date(v.criadaEm).toLocaleString('pt-BR') : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.ajuda {
  cursor: help;
}

.campo {
  max-width: 7rem;
  display: inline-block;
}
</style>
