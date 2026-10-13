<script setup>
import { computed, ref } from 'vue'
import { TRILHAS, formatarData, formatarPreco, formatarQuantidade, nomeAtivo, nomeTrilha, rotulo } from '../../utils/carteiras.js'

// As ordens virtuais das trilhas (as mais recentes primeiro): criadas na decisão de D e executadas, rejeitadas ou
// expiradas na liquidação, pelo preço do dia. Nenhuma vai a uma corretora.
const props = defineProps({
  operacoes: { type: Array, required: true }
})

const filtroTrilha = ref('')
const visiveis = computed(() => props.operacoes.filter((o) => !filtroTrilha.value || o.trilha === filtroTrilha.value))

const corSituacao = (s) => ({ EXECUTADA: 'text-bg-success', REJEITADA: 'text-bg-danger', EXPIRADA: 'text-bg-secondary', CRIADA: 'text-bg-warning' })[s] || 'text-bg-light'
</script>

<template>
  <div>
    <div class="d-flex flex-wrap gap-2 mb-3">
      <select v-model="filtroTrilha" class="form-select form-select-sm w-auto" aria-label="Trilha">
        <option value="">Todas as trilhas</option>
        <option v-for="t in TRILHAS" :key="t.tipo" :value="t.tipo">{{ t.nome }}</option>
      </select>
    </div>

    <p v-if="!visiveis.length" class="text-muted">Nenhuma operação{{ operacoes.length ? ' desta trilha' : ' ainda' }}.</p>
    <div v-else class="table-responsive">
      <table class="table table-sm align-middle small">
        <thead>
          <tr>
            <th>Data</th>
            <th>Trilha</th>
            <th>Ativo</th>
            <th>Ordem</th>
            <th>Motivo</th>
            <th class="text-end">Quantidade</th>
            <th class="text-end">Preço executado</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in visiveis" :key="o.id">
            <td class="text-nowrap">{{ formatarData(o.data) }}</td>
            <td>{{ nomeTrilha(o.trilha) }}</td>
            <td>
              {{ nomeAtivo(o.ativo) }}
              <div class="text-muted">{{ o.contrato }}</div>
            </td>
            <td>
              {{ rotulo(o.tipo) }} {{ rotulo(o.lado).toLowerCase() }}
              <div v-if="o.semStop" class="text-muted">sem stop</div>
            </td>
            <td>{{ rotulo(o.motivo) }}</td>
            <td class="text-end">{{ formatarQuantidade(o.quantidadeExecutada ?? o.quantidade) }}</td>
            <td class="text-end">{{ formatarPreco(o.precoExecucao) }}</td>
            <td>
              <span class="badge" :class="corSituacao(o.situacao)">{{ rotulo(o.situacao) }}</span>
              <div v-if="o.motivoSituacao" class="text-muted">{{ rotulo(o.motivoSituacao) }}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
