// Período do gráfico da tela de detalhe de um observável - função pura, testável sem DOM.
//
// PADRÃO DOS CARDS: todo card herda daqui, sem código por card. `dias: null` = "Tudo" (sem data inicial).
// A frequência da série (`observavel.frequencia`, definida no catálogo do backend) escolhe o período
// inicial: uma série ANUAL (um ponto por safra) não mostra nada em 30 dias e abre em 10 anos. Uma
// frequência nova só precisa de uma linha em PERIODO_PADRAO_POR_FREQUENCIA (o padrão é 30 dias).

export const OPCOES_PERIODO_GRAFICO = [
  { dias: 30, label: '30d' },
  { dias: 90, label: '90d' },
  { dias: 180, label: '180d' },
  { dias: 365, label: '1 ano' },
  { dias: 1825, label: '5 anos' },
  { dias: 3650, label: '10 anos' },
  { dias: null, label: 'Tudo' }
]

export const PERIODO_PADRAO_DIAS = 30

const PERIODO_PADRAO_POR_FREQUENCIA = {
  ANUAL: 3650
}

// Período (em dias) com que o gráfico abre para uma frequência; sem frequência conhecida, o padrão.
export function periodoPadraoDias(frequencia) {
  return PERIODO_PADRAO_POR_FREQUENCIA[frequencia] ?? PERIODO_PADRAO_DIAS
}
