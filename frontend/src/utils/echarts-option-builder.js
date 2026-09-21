// Constrói a option do Apache ECharts pro LineChart.vue - função pura, sem
// Vue nem DOM (testável com node:test puro, mesmo padrão dos
// services/*.test.js). Simplificado em relação ao AgroMind: eixo de tempo
// sempre (a fonte é uma série diária real, não safra), sem dataZoom/
// toolbox. Suporta 1+ séries via `pontos[].serie` (mesma unidade/eixo Y
// pra todas - ver docs/adr/0006-fonte-taxa-selic-bcb-sgs.md sobre por que
// só combinamos séries que já estão na mesma grandeza); legenda só aparece
// quando há mais de uma série, pra não mudar o visual do caso simples
// (1 série, ex.: USD_BRL).

const FORMATADOR_EIXO_Y = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
const FORMATADOR_TOOLTIP = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
const FORMATADOR_DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })

const CHAVE_SERIE_PADRAO = '__default__'
// Paleta com cores bem distintas entre si (as duas primeiras são as de sempre, então os
// gráficos de 1-2 séries não mudam). Passando do fim da paleta - ex.: WASDE com todas as
// regiões marcadas - as cores se repetem, e a repetição sai TRACEJADA para não confundir
// duas linhas da mesma cor.
const CORES_SERIE = ['#0d6efd', '#fd7e14', '#198754', '#dc3545', '#6f42c1', '#0aa2c0', '#d63384', '#795548', '#b8860b', '#6c757d', '#20c997', '#212529']
// Acima disso a legenda não cabe numa linha: vira uma legenda rolável (o clique para ocultar/mostrar continua).
const MAX_SERIES_LEGENDA_FIXA = 8
const COR_TEXTO_MUTED = '#6c757d'
const COR_BORDA = '#dee2e6'

function agruparPorSerie(pontos) {
  const grupos = new Map()

  for (const p of pontos) {
    const x = Date.parse(`${p.data}T00:00:00Z`)
    const y = Number(p.valor)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue

    const chave = p.serie ?? CHAVE_SERIE_PADRAO
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave).push([x, y])
  }

  for (const dadosSerie of grupos.values()) dadosSerie.sort((a, b) => a[0] - b[0])
  return grupos
}

export function construirOpcaoLineChart({ pontos, unidade, seriesLabels = {} }) {
  const grupos = agruparPorSerie(pontos)
  const chaves = [...grupos.keys()]
  const multiplasSeries = chaves.length > 1

  const series = chaves.map((chave, indice) => {
    const dados = grupos.get(chave)
    const cor = CORES_SERIE[indice % CORES_SERIE.length]
    const repetida = indice >= CORES_SERIE.length
    return {
      name: seriesLabels[chave] || chave,
      type: 'line',
      data: dados,
      symbol: 'circle',
      symbolSize: 5,
      showSymbol: dados.length <= 90,
      smooth: false,
      lineStyle: { width: 2, color: cor, type: repetida ? 'dashed' : 'solid' },
      itemStyle: { color: cor },
      // Área preenchida some com 2+ séries - sobrepor duas áreas translúcidas
      // fica visualmente confuso, sem ganho de leitura.
      ...(multiplasSeries ? {} : { areaStyle: { color: cor, opacity: 0.06 } })
    }
  })

  const option = {
    // Margens fixas em vez de `grid.containLabel` - no ECharts 6 essa opção
    // passou a depender de um subsistema novo (`grid.outerBounds`) que, com
    // o vue-echarts usado aqui, resultava no gráfico renderizando em branco
    // (grid/eixos desenhados, série sem nenhum pixel visível, mesmo com
    // dado válido - verificado via captura de pixels do canvas). Espaço à
    // esquerda calculado pra caber o rótulo do eixo Y (valores tipo "5,20").
    grid: { left: 48, right: 16, top: multiplasSeries ? 36 : 16, bottom: 32 },
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
      // Respiro acima/abaixo do maior/menor valor da série - sem isso o
      // ponto mais alto/baixo fica colado na borda do gráfico. Fallback
      // pra série "achatada" (todos os pontos iguais, max === min).
      min: ({ min, max }) => min - (max - min || 1) * 0.1,
      max: ({ min, max }) => max + (max - min || 1) * 0.1,
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
    series
  }

  if (multiplasSeries) {
    option.legend = {
      top: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { color: COR_TEXTO_MUTED, fontSize: 11 },
      ...(chaves.length > MAX_SERIES_LEGENDA_FIXA ? { type: 'scroll', left: 48 } : {})
    }
  }

  return option
}
