<script setup>
import { ref } from 'vue'
import { formatarData, formatarQuantidade, nomeAtivo, nomeTrilha, rotulo } from '../../utils/carteiras.js'

// As rodadas diárias (as mais recentes primeiro): a decisão de D, com as intenções de cada trilha e as ordens que o
// motor gerou, e a liquidação em D+1. Uma rodada sem decisão é liquidada mesmo assim (stop, alvos, Selic).
defineProps({
  rodadas: { type: Array, required: true }
})

const aberta = ref(null)
const alternar = (id) => (aberta.value = aberta.value === id ? null : id)

const corDecisao = (d) => (d === 'DECIDIDA' ? 'text-bg-primary' : 'text-bg-secondary')
const corLiquidacao = (l) => (l === 'LIQUIDADA' ? 'text-bg-success' : 'text-bg-warning')
const corResultado = (r) => (r === 'ORDEM' ? 'text-bg-primary' : r === 'BLOQUEADA' ? 'text-bg-danger' : 'text-bg-light border')
</script>

<template>
  <div>
    <p v-if="!rodadas.length" class="text-muted">Nenhuma rodada ainda: a primeira é a do dia do início.</p>
    <div v-else class="table-responsive">
      <table class="table table-sm align-middle">
        <thead>
          <tr>
            <th>Data</th>
            <th>Decisão</th>
            <th>Liquidação</th>
            <th>Intenções</th>
            <th>Ordens</th>
            <th>Observação</th>
            <th><span class="visually-hidden">Detalhe</span></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in rodadas" :key="r.id">
            <tr class="rodada-linha" @click="alternar(r.id)">
              <td class="text-nowrap">{{ formatarData(r.data) }}</td>
              <td><span class="badge" :class="corDecisao(r.decisao)">{{ rotulo(r.decisao) }}</span></td>
              <td><span class="badge" :class="corLiquidacao(r.liquidacao)">{{ rotulo(r.liquidacao) }}</span></td>
              <td>{{ r.intencoes.length }}</td>
              <td>{{ r.ordens.length }}</td>
              <td class="small text-muted">
                {{ r.motivo ? rotulo(r.motivo) : '' }}<template v-if="r.detalhes?.erro">: {{ r.detalhes.erro }}</template>
              </td>
              <td class="text-end">
                <i class="bi" :class="aberta === r.id ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
              </td>
            </tr>
            <tr v-if="aberta === r.id">
              <td colspan="7" class="bg-body-tertiary">
                <div class="row g-3 py-2">
                  <div class="col-lg-6">
                    <h3 class="h6 small text-uppercase text-muted">Intenções</h3>
                    <p v-if="!r.intencoes.length" class="small text-muted mb-0">Nenhuma.</p>
                    <table v-else class="table table-sm small mb-0">
                      <tbody>
                        <tr v-for="(i, k) in r.intencoes" :key="k">
                          <td>{{ nomeTrilha(i.trilha) }}</td>
                          <td>{{ nomeAtivo(i.ativo) }}</td>
                          <td>{{ rotulo(i.acao) }}</td>
                          <td>
                            <span class="badge" :class="corResultado(i.resultado)">{{ rotulo(i.resultado) }}</span>
                            <div v-if="i.motivoBloqueio" class="text-danger">{{ rotulo(i.motivoBloqueio) }}</div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div class="col-lg-6">
                    <h3 class="h6 small text-uppercase text-muted">Ordens</h3>
                    <p v-if="!r.ordens.length" class="small text-muted mb-0">Nenhuma.</p>
                    <table v-else class="table table-sm small mb-0">
                      <tbody>
                        <tr v-for="o in r.ordens" :key="o.id">
                          <td>{{ nomeTrilha(o.trilha) }}</td>
                          <td>{{ rotulo(o.tipo) }} {{ rotulo(o.lado).toLowerCase() }}</td>
                          <td>{{ nomeAtivo(o.ativo) }} {{ o.contrato }}</td>
                          <td>{{ formatarQuantidade(o.quantidade) }}</td>
                          <td>
                            {{ rotulo(o.situacao) }}
                            <div v-if="o.motivoSituacao" class="text-muted">{{ rotulo(o.motivoSituacao) }}</div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.rodada-linha {
  cursor: pointer;
}
</style>
