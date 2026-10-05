// Funções puras da tela Qualidade da IA (ADR 0064): os números como a tela os mostra ("k de n (x%)", a diferença contra
// o melhor benchmark) e os rótulos. Nenhum cálculo de métrica aqui: as medidas vêm prontas da API, com as linhas.

const PERCENTUAL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const DISTANCIA = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PRECO = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const sinal = (valor, texto) => `${valor > 0 ? '+' : valor < 0 ? '−' : ''}${texto}`

export const PREVISORES = [
  { codigo: 'IA', rotulo: 'IA' },
  { codigo: 'SEMPRE_LATERAL', rotulo: 'Sempre Lateral' },
  { codigo: 'PERSISTENCIA', rotulo: 'Persistência' }
]

// Por que uma linha ficou fora da métrica, na ordem em que o backend verifica (qualidade-ia.service.js::MOTIVOS_FORA).
const MOTIVOS = {
  REFERENCIA_ANTIGA: 'Horizonte contado do último preço (petróleo v1)',
  A_APURAR: 'A apurar',
  AGUARDANDO_DADO: 'Aguardando o preço',
  SEM_PRECO: 'Sem preço perto do alvo (contrato vencido ou série parada)',
  SEM_PREGAO: 'Sem pregão novo até o alvo',
  SEM_BASE: 'Sem base',
  SEM_PREGAO_NA_DATA: 'Sem pregão na data da análise',
  INSUFICIENTE: 'A IA não leu (insuficiente)',
  SEM_BENCHMARK: 'Sem a variação passada (benchmark)'
}

export const rotuloMotivo = (codigo) => (codigo ? MOTIVOS[codigo] || codigo : 'Na métrica')

// Os motivos de uma célula com quantidade, na ordem da verificação.
export function motivosPresentes(fora = {}) {
  return Object.keys(MOTIVOS)
    .filter((codigo) => fora[codigo] > 0)
    .map((codigo) => ({ codigo, rotulo: MOTIVOS[codigo], quantidade: fora[codigo] }))
}

export function formatarDistancia(valor) {
  return valor == null ? '—' : DISTANCIA.format(valor)
}

// A IA contra o melhor benchmark. No acerto, em pontos percentuais (positivo: a IA acima). Na distância, em faixas
// (negativo: a IA mais perto do realizado). `sentido` diz de que lado a IA ficou, sem cor de acerto ou erro.
export function compararComBenchmark(valor, { menorEhMelhor = false } = {}) {
  if (valor == null) return null
  const arredondado = Math.round(valor * 100) / 100
  const sentido = arredondado === 0 ? 'igual' : (arredondado < 0) === menorEhMelhor ? 'melhor' : 'pior'
  const texto = menorEhMelhor ? DISTANCIA.format(Math.abs(valor)) : `${PERCENTUAL.format(Math.abs(valor))} p.p.`
  return { texto: sinal(arredondado, texto), sentido }
}

export function formatarVariacao(pct) {
  return pct == null ? '—' : sinal(pct, `${PERCENTUAL.format(Math.abs(pct))}%`)
}

export function formatarPreco(valor) {
  return valor == null ? '—' : PRECO.format(valor)
}

// As linhas da tabela: todas, as de um horizonte e, opcionalmente, só as que entraram na métrica.
export function filtrarLinhas(linhas, { horizonte = null, somenteAvaliadas = false } = {}) {
  return linhas.filter((l) => (!horizonte || l.horizonte === horizonte) && (!somenteAvaliadas || l.motivoFora === null))
}

// O "desde" de um período em dias, contado de hoje (data local, AAAA-MM-DD). Sem período (Tudo), null.
export function desdeDoPeriodo(dias, hoje = new Date()) {
  if (!dias) return null
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (dias - 1))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "66,7%" (a 2ª linha de uma medida no card). Sem valor, vazio.
export function formatarPct(pct) {
  return pct == null ? '' : `${PERCENTUAL.format(pct)}%`
}
