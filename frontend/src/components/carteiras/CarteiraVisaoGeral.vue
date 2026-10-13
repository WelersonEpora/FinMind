<script setup>
import { computed } from 'vue'
import LineChart from '../charts/LineChart.vue'
import { classeSinal, formatarData, formatarMoeda, formatarRetorno, pontosDoPatrimonio, rotulo, trilha } from '../../utils/carteiras.js'

// A visão geral de uma carteira: por trilha e referência, o patrimônio, o retorno e o maior recuo desde o início; e o
// retorno acumulado de todas no mesmo gráfico.
const props = defineProps({
  carteira: { type: Object, required: true },
  painel: { type: Object, required: true }
})

const grupos = computed(() => {
  const comInfo = props.painel.trilhas.map((t) => ({ ...t, info: trilha(t.tipo) }))
  return [
    { titulo: 'Trilhas', itens: comInfo.filter((t) => t.info.grupo === 'trilha') },
    { titulo: 'Referências', itens: comInfo.filter((t) => t.info.grupo === 'referencia') }
  ]
})

const grafico = computed(() => pontosDoPatrimonio(props.painel.trilhas, props.carteira.capitalInicial))
const temHistorico = computed(() => grafico.value.pontos.length > 0)
</script>

<template>
  <div>
    <div class="d-flex flex-wrap gap-3 small text-muted mb-3">
      <span>
        Última rodada:
        <template v-if="painel.ultimaRodada">
          <strong class="text-body">{{ formatarData(painel.ultimaRodada.data) }}</strong>
          ({{ rotulo(painel.ultimaRodada.decisao).toLowerCase() }}, {{ rotulo(painel.ultimaRodada.liquidacao).toLowerCase() }})
        </template>
        <template v-else>nenhuma ainda</template>
      </span>
      <span>
        Último dia liquidado:
        <strong class="text-body">{{ painel.ultimoDiaLiquidado ? formatarData(painel.ultimoDiaLiquidado) : '—' }}</strong>
      </span>
    </div>

    <div v-for="g in grupos" :key="g.titulo" class="mb-3">
      <h2 class="h6 text-uppercase text-muted small mb-2">{{ g.titulo }}</h2>
      <div class="row g-3">
        <div v-for="t in g.itens" :key="t.id" class="col-sm-6 col-xl-4">
          <div class="card h-100">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start">
                <h3 class="h6 mb-0">{{ t.info.nome }}</h3>
                <span class="fw-semibold" :class="classeSinal(t.retornoPct)">{{ formatarRetorno(t.retornoPct) }}</span>
              </div>
              <div class="text-muted small mb-2">{{ t.info.descricao }}</div>
              <div class="fs-5 fw-semibold">{{ formatarMoeda(t.patrimonio, carteira.moeda) }}</div>
              <div class="small text-muted">
                Maior recuo {{ formatarRetorno(t.maiorRecuoPct) }} · {{ t.abertas }} aberta(s) · {{ t.encerradas }} encerrada(s)
              </div>
              <div v-if="t.info.aguarda" class="small text-warning-emphasis mt-2">
                <i class="bi bi-hourglass-split me-1"></i>{{ t.info.aguarda }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-body">
        <h2 class="h6">Retorno acumulado (% do capital inicial)</h2>
        <LineChart v-if="temHistorico" :pontos="grafico.pontos" :series-labels="grafico.rotulos" unidade="%" :casas-decimais="2" altura="320px" />
        <p v-else class="text-muted small mb-0 py-4 text-center">
          Sem dias liquidados ainda. A carteira começa em {{ formatarData(carteira.dataInicio) }}; cada dia útil, a rotina
          diária decide a rodada do dia e liquida a do dia anterior.
        </p>
      </div>
    </div>
  </div>
</template>
