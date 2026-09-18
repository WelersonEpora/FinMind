<script setup>
import { computed } from 'vue'
import EChartsBase from './EChartsBase.vue'
import { construirOpcaoLineChart } from '../../utils/echarts-option-builder.js'

const props = defineProps({
  // [{ data: 'AAAA-MM-DD', valor: number, serie?: string }, ...] - `serie`
  // é opcional; quando presente em mais de um valor distinto, o gráfico
  // desenha uma linha por série (mesmo eixo Y - só combine séries que já
  // estejam na mesma unidade/grandeza) com legenda.
  pontos: { type: Array, default: () => [] },
  unidade: { type: String, default: null },
  // Rótulo de legenda por chave de `serie` (ex.: { meta: 'Meta (Copom)' }).
  seriesLabels: { type: Object, default: () => ({}) }
})

const temDadoSuficiente = computed(() => props.pontos.length >= 2)
const opcaoEchart = computed(() =>
  construirOpcaoLineChart({ pontos: props.pontos, unidade: props.unidade, seriesLabels: props.seriesLabels })
)
</script>

<template>
  <div class="line-chart">
    <EChartsBase v-if="temDadoSuficiente" :option="opcaoEchart" />
    <p v-else class="line-chart__vazio">Histórico insuficiente para exibir o gráfico.</p>
  </div>
</template>

<style scoped>
.line-chart__vazio {
  margin: 0;
  padding: 2.5rem 0;
  text-align: center;
  color: #6c757d;
  font-size: 0.9rem;
}
</style>
