// Tela Metodologia do Ativo (ADR 0050) - funções puras, testáveis sem DOM.

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

// Pontos do fator de estoques -> as duas linhas do gráfico (no formato do LineChart): o estoque e a média de 5 anos,
// só onde existe a média, para as duas cobrirem o mesmo trecho.
export function seriesEstoquesPetroleo(pontos = []) {
  const linhas = []
  for (const p of pontos) {
    if (p.media5Anos === null) continue
    linhas.push({ data: p.observedAt, valor: p.estoque, serie: 'estoque' })
    linhas.push({ data: p.observedAt, valor: p.media5Anos, serie: 'media5Anos' })
  }
  return linhas
}

// --- Camada C (simulação) do fator de estoques -------------------------------------------------------------------
// A regra fica no backend (`decidirEstoques`); aqui só os rótulos e a explicação da decisão que a API devolveu.

export const ROTULOS_DECISAO = {
  direcao: { ALTA: 'Pressão de alta', BAIXA: 'Pressão de baixa', NEUTRA: 'Neutra' },
  intensidade: { FRACA: 'Fraca', MODERADA: 'Moderada', FORTE: 'Forte' },
  tendencia: { APERTANDO: 'Apertando', AFROUXANDO: 'Afrouxando', ESTAVEL: 'Estável' }
}

export const PARAMETROS_ESTOQUES = [
  {
    chave: 'limiarModeradoPct',
    rotulo: 'Faixa neutra',
    unidade: '%',
    explicacao: 'Desvio, para cima ou para baixo, até onde o estoque é considerado normal (sem pressão).'
  },
  {
    chave: 'limiarFortePct',
    rotulo: 'Limiar de intensidade forte',
    unidade: '%',
    explicacao: 'A partir desse desvio a pressão é forte; entre a faixa neutra e ele, moderada.'
  },
  {
    chave: 'semanasTendencia',
    rotulo: 'Janela da tendência',
    unidade: 'semanas',
    explicacao: 'Contra quantas semanas atrás o desvio é comparado para dizer se o aperto ou a sobra está mudando.'
  },
  {
    chave: 'limiarTendenciaPp',
    rotulo: 'Mudança mínima da tendência',
    unidade: 'p.p.',
    explicacao: 'Quanto o desvio precisa mudar na janela para não ser considerado estável.'
  }
]

const fmt = (n, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const comSinal = (n, casas = 2) => `${n > 0 ? '+' : ''}${fmt(n, casas)}`

export function parametrosAlterados(parametros, padrao) {
  return Object.keys(padrao || {}).some((chave) => Number(parametros?.[chave]) !== Number(padrao[chave]))
}

// Os passos da decisão de uma semana, em texto, com os números dela e os parâmetros em uso.
export function explicarDecisao(ponto, parametros, peso) {
  const d = ponto?.decisao
  if (!d) return []
  const { limiarModeradoPct: mod, limiarFortePct: forte, semanasTendencia: semanas, limiarTendenciaPp: tend } = parametros
  const desvio = ponto.desvioPct
  const passos = [`O estoque está ${comSinal(desvio)}% contra a média da mesma semana nos 5 anos anteriores (B).`]

  if (d.direcao === 'NEUTRA') {
    passos.push(`Direção: a faixa neutra vai de −${fmt(mod, 1)}% a +${fmt(mod, 1)}%. ${comSinal(desvio)}% está dentro dela → Neutra.`)
  } else if (d.direcao === 'ALTA') {
    passos.push(`Direção: ${comSinal(desvio)}% está abaixo de −${fmt(mod, 1)}%: estoque abaixo do normal é aperto → Pressão de alta.`)
  } else {
    passos.push(`Direção: ${comSinal(desvio)}% está acima de +${fmt(mod, 1)}%: estoque acima do normal é sobra → Pressão de baixa.`)
  }

  const absoluto = fmt(Math.abs(desvio))
  if (d.intensidade === 'FORTE') passos.push(`Intensidade: ${absoluto}% é ${fmt(forte, 1)}% ou mais → Forte.`)
  else if (d.intensidade === 'MODERADA') passos.push(`Intensidade: ${absoluto}% fica entre ${fmt(mod, 1)}% e ${fmt(forte, 1)}% → Moderada.`)
  else passos.push(`Intensidade: ${absoluto}% é menor que ${fmt(mod, 1)}% → Fraca.`)

  if (d.tendencia === null) {
    passos.push(`Tendência: sem o desvio de ${semanas} semanas antes, não calculada.`)
  } else {
    const anterior = desvio - d.mudancaDesvioPp
    const base = `Tendência: há ${semanas} semanas o desvio era ${comSinal(anterior)}%; mudou ${comSinal(d.mudancaDesvioPp)} p.p.`
    if (d.tendencia === 'ESTAVEL') passos.push(`${base}, menos que ${fmt(tend, 1)} p.p. → Estável.`)
    else if (d.tendencia === 'APERTANDO') passos.push(`${base}: caiu ${fmt(tend, 1)} p.p. ou mais, o estoque está indo para baixo do normal → Apertando.`)
    else passos.push(`${base}: subiu ${fmt(tend, 1)} p.p. ou mais, o estoque está indo para cima do normal → Afrouxando.`)
  }

  if (peso) passos.push(`Peso: ${peso}, do FEL 1 (não é calculado).`)
  return passos
}

// O desvio (B) e as faixas da decisão (C), no formato do LineChart: o desvio e os quatro limiares como linhas.
export function seriesDesvioComFaixas(pontos = [], parametros) {
  const linhas = []
  const { limiarModeradoPct: mod, limiarFortePct: forte } = parametros
  for (const p of pontos) {
    if (p.desvioPct === null) continue
    linhas.push({ data: p.observedAt, valor: p.desvioPct, serie: 'desvio' })
    linhas.push({ data: p.observedAt, valor: forte, serie: 'forteAcima' })
    linhas.push({ data: p.observedAt, valor: mod, serie: 'neutraAcima' })
    linhas.push({ data: p.observedAt, valor: -mod, serie: 'neutraAbaixo' })
    linhas.push({ data: p.observedAt, valor: -forte, serie: 'forteAbaixo' })
  }
  return linhas
}

// De onde vêm os valores do sistema: a versão salva (quem e quando) ou, sem nenhuma, o padrão do código.
export function descreverOrigemParametros(origem) {
  if (!origem) return 'Padrão do FinMind (nenhum ajuste salvo ainda)'
  const data = new Date(origem.alteradoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const autor = origem.alteradoPor?.nome || 'usuário removido'
  return `Versão ${origem.versao}, salva por ${autor} em ${data}`
}
