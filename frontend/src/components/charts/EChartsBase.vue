<script setup>
// Wrapper genérico do Apache ECharts (vue-echarts) - registra só os módulos
// de base usados hoje (renderer + grid/tooltip/legend). Mesmo padrão
// adotado em AgroMind/Personal-Assistant (EChartsBase.vue + LineChart.vue
// por cima), simplificado pro caso de uso atual do FinMind (sem dataZoom/
// toolbox). Views nunca importam vue-echarts diretamente - só os
// componentes de charts/ conhecem essa API.
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { LineChart } from 'echarts/charts'

use([CanvasRenderer, GridComponent, TooltipComponent, LegendComponent, LineChart])

defineProps({
  option: { type: Object, required: true },
  altura: { type: String, default: '280px' }
})
</script>

<template>
  <v-chart class="echarts-base" :option="option" autoresize :style="{ height: altura, width: '100%' }" />
</template>

<style scoped>
.echarts-base {
  width: 100%;
}
</style>
