<script setup>
import { computed, ref } from 'vue'
import { TRILHAS, classeSinal, formatarData, formatarMoeda, formatarPreco, formatarQuantidade, formatarR, nomeAtivo, nomeTrilha, rotulo } from '../../utils/carteiras.js'

// As posições das trilhas: abertas (com stop e alvos em vigor) e encerradas (com o resultado em R e na moeda).
const props = defineProps({
  posicoes: { type: Array, required: true },
  moeda: { type: String, required: true }
})

const filtroTrilha = ref('')
const filtroSituacao = ref('')

const visiveis = computed(() =>
  props.posicoes.filter((p) => (!filtroTrilha.value || p.trilha === filtroTrilha.value) && (!filtroSituacao.value || p.situacao === filtroSituacao.value))
)
</script>

<template>
  <div>
    <div class="d-flex flex-wrap gap-2 mb-3">
      <select v-model="filtroTrilha" class="form-select form-select-sm w-auto" aria-label="Trilha">
        <option value="">Todas as trilhas</option>
        <option v-for="t in TRILHAS" :key="t.tipo" :value="t.tipo">{{ t.nome }}</option>
      </select>
      <select v-model="filtroSituacao" class="form-select form-select-sm w-auto" aria-label="Situação">
        <option value="">Abertas e encerradas</option>
        <option value="ABERTA">Abertas</option>
        <option value="ENCERRADA">Encerradas</option>
      </select>
    </div>

    <p v-if="!visiveis.length" class="text-muted">Nenhuma posição{{ posicoes.length ? ' com estes filtros' : ' ainda' }}.</p>
    <div v-else class="table-responsive">
      <table class="table table-sm align-middle small">
        <thead>
          <tr>
            <th>Trilha</th>
            <th>Ativo</th>
            <th>Lado</th>
            <th>Entrada</th>
            <th class="text-end">Preço</th>
            <th class="text-end">Stop</th>
            <th class="text-end">Alvos</th>
            <th class="text-end">Quantidade</th>
            <th class="text-end">Risco (1R)</th>
            <th class="text-end">Resultado</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in visiveis" :key="p.id">
            <td>{{ nomeTrilha(p.trilha) }}</td>
            <td>
              {{ nomeAtivo(p.ativo) }}
              <div class="text-muted">{{ p.contrato }}</div>
            </td>
            <td>
              <span class="badge" :class="p.lado === 'COMPRADO' ? 'text-bg-success' : 'text-bg-danger'">{{ rotulo(p.lado) }}</span>
            </td>
            <td class="text-nowrap">{{ formatarData(p.dataEntrada) }}</td>
            <td class="text-end">{{ formatarPreco(p.entrada) }}</td>
            <td class="text-end">
              {{ p.stop == null ? 'Sem stop' : formatarPreco(p.stop) }}
              <div v-if="p.stop != null && p.stopInicial !== p.stop" class="text-muted">inicial {{ formatarPreco(p.stopInicial) }}</div>
            </td>
            <td class="text-end">
              <template v-if="p.alvo1 != null">
                <span :class="{ 'text-decoration-line-through text-muted': p.alvo1Atingido }">{{ formatarPreco(p.alvo1) }}</span>
                / {{ formatarPreco(p.alvo2) }}
              </template>
              <template v-else>—</template>
            </td>
            <td class="text-end">
              {{ formatarQuantidade(p.quantidadeAberta) }}
              <div v-if="p.quantidadeAberta !== p.quantidadeInicial" class="text-muted">de {{ formatarQuantidade(p.quantidadeInicial) }}</div>
            </td>
            <td class="text-end">{{ formatarMoeda(p.risco1R, moeda) }}</td>
            <td class="text-end">
              <span :class="classeSinal(p.resultadoMoeda)">{{ formatarMoeda(p.resultadoMoeda, moeda) }}</span>
              <div v-if="p.resultadoR != null" :class="classeSinal(p.resultadoR)">{{ formatarR(p.resultadoR) }}</div>
            </td>
            <td>
              {{ rotulo(p.situacao) }}
              <div v-if="p.situacao === 'ENCERRADA'" class="text-muted text-nowrap">
                {{ formatarData(p.dataSaida) }} · {{ rotulo(p.motivoSaida) }}
              </div>
              <div v-else-if="p.reduzida" class="text-muted">reduzida</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="small text-muted mb-0">
      Quantidade fracionária (em contratos): com o capital da simulação, um contrato inteiro não cabe no risco da
      Cartilha. O resultado em R e em % não depende disso.
    </p>
  </div>
</template>
