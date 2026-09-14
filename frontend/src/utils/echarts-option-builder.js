// Constrói a option do Apache ECharts pro LineChart.vue - função pura, sem
// Vue nem DOM (testável com node:test puro, mesmo padrão dos
// services/*.test.js). Simplificado em relação ao AgroMind: uma série só,
// eixo de tempo sempre (a fonte é uma série diária real, não safra), sem
// dataZoom/toolbox/legenda.

const FORMATADOR_EIXO_Y = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const FORMATADOR_TOOLTIP = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const FORMATADOR_DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })

const COR_LINHA = '#0d6efd'
const COR_TEXTO_MUTED = '#6c757d'
const COR_BORDA = '#dee2e6'

export function construirOpcaoLineChart({ pontos, unidade }) {
  const dados = pontos
    .map((p) => [Date.parse(`${p.data}T00:00:00Z`), Number(p.valor)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    .sort((a, b) => a[0] - b[0])

  return {
    // Margens fixas em vez de `grid.containLabel` - no ECharts 6 essa opção
    // passou a depender de um subsistema novo (`grid.outerBounds`) que, com
    // o vue-echarts usado aqui, resultava no gráfico renderizando em branco
    // (grid/eixos desenhados, série sem nenhum pixel visível, mesmo com
    // dado válido - verificado via captura de pixels do canvas). Espaço à
    // esquerda calculado pra caber o rótulo do eixo Y (valores tipo "5,20").
    grid: { left: 48, right: 16, top: 16, bottom: 32 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: COR_BORDA } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: COR_TEXTO_MUTED,
        fontSize: 11,
        hideOverlap: true,
        formatter: (valor) => FORMATADOR_DATA.format(new Date(valor))
      }
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: COR_BORDA, type: 'dashed' } },
      axisLabel: { color: COR_TEXTO_MUTED, fontSize: 11, formatter: (valor) => FORMATADOR_EIXO_Y.format(valor) }
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: '#ffffff',
      borderColor: COR_BORDA,
      borderWidth: 1,
      padding: 10,
      valueFormatter: (valor) => `${FORMATADOR_TOOLTIP.format(valor)}${unidade ? ` ${unidade}` : ''}`,
      axisPointer: { type: 'line', lineStyle: { color: COR_TEXTO_MUTED, width: 1 } }
    },
    series: [
      {
        type: 'line',
        data: dados,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: dados.length <= 90,
        smooth: false,
        lineStyle: { width: 2, color: COR_LINHA },
        itemStyle: { color: COR_LINHA },
        areaStyle: { color: COR_LINHA, opacity: 0.06 }
      }
    ]
  }
}
