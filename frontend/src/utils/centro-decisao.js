// Funções puras do Centro de Decisão (ADR 0048): a semana do seletor de data e a formatação do card de preço.
// Datas são sempre "AAAA-MM-DD" tratadas em UTC, para o fuso do navegador não mudar o dia.

const DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
const FORMATADOR_DATA_LONGA = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const FORMATADOR_PERCENTUAL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
// Abaixo disso (em %), a variação aparece como estável: arredondada, seria "+0,0%" com seta.
const LIMIAR_ESTAVEL = 0.05

function paraDate(dataIso) {
  return new Date(`${dataIso}T00:00:00Z`)
}

export function somarDias(dataIso, dias) {
  const data = paraDate(dataIso)
  data.setUTCDate(data.getUTCDate() + dias)
  return data.toISOString().slice(0, 10)
}

// A semana de calendário (domingo a sábado) que contém a data, com os dias futuros marcados (não selecionáveis).
export function semanaDe(dataIso, hojeIso) {
  const domingo = somarDias(dataIso, -paraDate(dataIso).getUTCDay())
  return Array.from({ length: 7 }, (_, i) => {
    const data = somarDias(domingo, i)
    return {
      data,
      diaSemana: DIAS_SEMANA[i],
      dia: Number(data.slice(8, 10)),
      futuro: data > hojeIso,
      selecionada: data === dataIso
    }
  })
}

// "2026-10-02" -> "sex., 2 de out."
export function formatarDataLonga(dataIso) {
  return FORMATADOR_DATA_LONGA.format(paraDate(dataIso))
}

export function formatarValor(valor, casasDecimais = 2) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casasDecimais, maximumFractionDigits: casasDecimais }).format(valor)
}

// { texto: "+22,2%", direcao: "alta" | "queda" | "estavel" }. Só a aritmética da série: não é sinal nem tendência.
export function formatarVariacao(percentual) {
  if (percentual == null || !Number.isFinite(percentual)) return null
  if (Math.abs(percentual) < LIMIAR_ESTAVEL) return { texto: '0,0%', direcao: 'estavel' }
  const sinal = percentual > 0 ? '+' : '−'
  return { texto: `${sinal}${FORMATADOR_PERCENTUAL.format(Math.abs(percentual))}%`, direcao: percentual > 0 ? 'alta' : 'queda' }
}
