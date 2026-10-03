// Tela Metodologia do Ativo (ADR 0050) - funções puras, testáveis sem DOM. A tela não conhece nenhum fator: desenha
// a `apresentacao` que a API manda (quadros, gráficos, parâmetros, rótulos); a regra e a explicação vêm do backend.

// Períodos do gráfico da proposta calculada: anos para trás a partir de hoje, ou o histórico inteiro.
export const PERIODOS_CALCULO = [
  { codigo: '1A', rotulo: '1 ano', anos: 1 },
  { codigo: '3A', rotulo: '3 anos', anos: 3 },
  { codigo: '10A', rotulo: '10 anos', anos: 10 },
  { codigo: 'TUDO', rotulo: 'Tudo', anos: null }
]

// `hoje` em AAAA-MM-DD. Devolve o `desde` da API (AAAA-MM-DD) ou undefined para o histórico inteiro.
export function desdeDoPeriodo(codigo, hoje) {
  const periodo = PERIODOS_CALCULO.find((p) => p.codigo === codigo)
  if (!periodo || periodo.anos === null) return undefined
  const [ano, mes, dia] = hoje.split('-').map(Number)
  const d = new Date(Date.UTC(ano - periodo.anos, mes - 1, dia))
  return d.toISOString().slice(0, 10)
}

// Pontos -> as linhas do gráfico das camadas A e B (no formato do LineChart), só onde existe `grafico.exigeCampo`,
// para todas cobrirem o mesmo trecho. Os rótulos da legenda vão em `rotulos`.
export function seriesDoGrafico(pontos = [], grafico) {
  const linhas = []
  for (const p of pontos) {
    if (grafico.exigeCampo && (p[grafico.exigeCampo] === null || p[grafico.exigeCampo] === undefined)) continue
    for (const serie of grafico.series) {
      if (p[serie.campo] !== null && p[serie.campo] !== undefined) linhas.push({ data: p.observedAt, valor: p[serie.campo], serie: serie.campo })
    }
  }
  const rotulos = Object.fromEntries(grafico.series.map((serie) => [serie.campo, serie.rotulo]))
  return { linhas, rotulos }
}

// A medida da decisão (camada C) e as faixas dela, no formato do LineChart: a medida e os quatro limiares como linhas.
export function seriesComFaixas(pontos = [], campo, parametros) {
  const linhas = []
  const { limiarModeradoPct: mod, limiarFortePct: forte } = parametros
  for (const p of pontos) {
    if (p[campo] === null || p[campo] === undefined) continue
    linhas.push({ data: p.observedAt, valor: p[campo], serie: 'medida' })
    linhas.push({ data: p.observedAt, valor: forte, serie: 'forteAcima' })
    linhas.push({ data: p.observedAt, valor: mod, serie: 'neutraAcima' })
    linhas.push({ data: p.observedAt, valor: -mod, serie: 'neutraAbaixo' })
    linhas.push({ data: p.observedAt, valor: -forte, serie: 'forteAbaixo' })
  }
  return linhas
}

// Um valor de quadro, como a apresentação pede: casas decimais, sinal (+/-) e unidade colada (ex.: "%").
export function formatarQuadro(valor, { casas = 0, sinal = false, unidadeValor = '' } = {}) {
  if (valor === null || valor === undefined) return '-'
  const numero = valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
  return `${sinal && valor > 0 ? '+' : ''}${numero}${unidadeValor}`
}

// A linha de baixo de um quadro: o valor secundário (com prefixo e sufixo) ou só o sufixo do principal.
export function linhaSecundaria(ponto, quadro) {
  const s = quadro.secundario
  if (!s) return quadro.sufixo || ''
  return [s.prefixo, formatarQuadro(ponto?.[s.campo], s), s.sufixo].filter(Boolean).join(' ')
}

// O período de um ponto do fator, pela periodicidade do cálculo: a semana (padrão) ou o mês num fator mensal.
const PERIODOS_DO_FATOR = {
  SEMANAL: { unidade: 'Semana', janela: 'semanas', referencia: (iso) => `Semana encerrada em ${dataBrCompleta(iso)}`, data: dataBrCompleta },
  MENSAL: { unidade: 'Mês', janela: 'meses', referencia: (iso) => `Mês de ${mesAno(iso)}`, data: mesAno }
}

function dataBrCompleta(iso) {
  return iso ? iso.split('-').reverse().join('/') : '-'
}

function mesAno(iso) {
  return iso ? iso.slice(0, 7).split('-').reverse().join('/') : '-'
}

export function periodoDoFator(periodicidade) {
  return PERIODOS_DO_FATOR[periodicidade] || PERIODOS_DO_FATOR.SEMANAL
}

// A medida da decisão (camada C) numa linha: sinal, duas casas e a unidade ("%" colado; as outras com espaço).
export function formatarMedida(valor, unidade = '%') {
  if (valor === null || valor === undefined) return '-'
  const numero = valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${valor > 0 ? '+' : ''}${numero}${unidade === '%' ? '%' : ` ${unidade}`}`
}

export function parametrosAlterados(parametros, padrao) {
  return Object.keys(padrao || {}).some((chave) => Number(parametros?.[chave]) !== Number(padrao[chave]))
}

// De onde vêm os valores do sistema: a versão salva (quem e quando) ou, sem nenhuma, o padrão do código.
export function descreverOrigemParametros(origem) {
  if (!origem) return 'Padrão do FinMind (nenhum ajuste salvo ainda)'
  const data = new Date(origem.alteradoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const autor = origem.alteradoPor?.nome || 'usuário removido'
  return `Versão ${origem.versao}, salva por ${autor} em ${data}`
}
