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
// `limiares` (opcional, `graficoC.limiares` do fator): as linhas de um fator com regra própria, cada uma
// { chave, sinal, rotulo } (o parâmetro, +1 acima ou -1 abaixo de zero), no lugar dos quatro simétricos.
export function seriesComFaixas(pontos = [], campo, parametros, limiares = null) {
  const linhas = []
  const { limiarModeradoPct: mod, limiarFortePct: forte } = parametros
  for (const p of pontos) {
    if (p[campo] === null || p[campo] === undefined) continue
    linhas.push({ data: p.observedAt, valor: p[campo], serie: 'medida' })
    if (limiares) {
      limiares.forEach((l, i) => linhas.push({ data: p.observedAt, valor: l.sinal * parametros[l.chave], serie: `limiar${i}` }))
      continue
    }
    linhas.push({ data: p.observedAt, valor: forte, serie: 'forteAcima' })
    linhas.push({ data: p.observedAt, valor: mod, serie: 'neutraAcima' })
    linhas.push({ data: p.observedAt, valor: -mod, serie: 'neutraAbaixo' })
    linhas.push({ data: p.observedAt, valor: -forte, serie: 'forteAbaixo' })
  }
  return linhas
}

// Os rótulos das linhas de seriesComFaixas: os quatro simétricos, ou os de `limiares`.
export function rotulosDasFaixas(rotuloMedida, limiares = null) {
  if (limiares) return { medida: rotuloMedida, ...Object.fromEntries(limiares.map((l, i) => [`limiar${i}`, l.rotulo])) }
  return {
    medida: rotuloMedida,
    forteAcima: 'Forte (acima)',
    neutraAcima: 'Faixa neutra (acima)',
    neutraAbaixo: 'Faixa neutra (abaixo)',
    forteAbaixo: 'Forte (abaixo)'
  }
}

// Um valor de quadro, como a apresentação pede: casas decimais, sinal (+/-), unidade colada (ex.: "%") e, com
// `agrupar: false`, sem o separador de milhar (um ano).
export function formatarQuadro(valor, { casas = 0, sinal = false, unidadeValor = '', agrupar = true } = {}) {
  if (valor === null || valor === undefined) return '-'
  const numero = valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: agrupar })
  return `${sinal && valor > 0 ? '+' : ''}${numero}${unidadeValor}`
}

// A linha de baixo de um quadro: o valor secundário (com prefixo e sufixo) ou só o sufixo do principal.
export function linhaSecundaria(ponto, quadro) {
  const s = quadro.secundario
  if (!s) return quadro.sufixo || ''
  return [s.prefixo, formatarQuadro(ponto?.[s.campo], s), s.sufixo].filter(Boolean).join(' ')
}

// O período de um ponto do fator, pela periodicidade do cálculo: a semana (padrão), o mês ou o trimestre.
const PERIODOS_DO_FATOR = {
  SEMANAL: { unidade: 'Semana', janela: 'semanas', referencia: (iso) => `Semana encerrada em ${dataBrCompleta(iso)}`, data: dataBrCompleta },
  MENSAL: { unidade: 'Mês', janela: 'meses', referencia: (iso) => `Mês de ${mesAno(iso)}`, data: mesAno },
  TRIMESTRAL: { unidade: 'Trimestre', janela: 'trimestres', referencia: (iso) => `Trimestre de ${trimestre(iso)}`, data: trimestre },
  // Um ponto por publicação de um levantamento (a safra do café da Conab), com a data exata dela.
  LEVANTAMENTO: { unidade: 'Levantamento', janela: 'levantamentos', referencia: (iso) => `Levantamento de ${dataBrCompleta(iso)}`, data: dataBrCompleta },
  // Um ponto por publicação de um relatório (o balanço do café do USDA), com a data dela.
  PUBLICACAO: { unidade: 'Publicação', janela: 'publicações', referencia: (iso) => `Publicação de ${dataBrCompleta(iso)}`, data: dataBrCompleta }
}

// "3º/2026": o trimestre de uma data do 1º dia do trimestre (AAAA-MM-01).
function trimestre(iso) {
  return iso ? `${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}º/${iso.slice(0, 4)}` : '-'
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

// --- Pesos e relações entre os fatores (só na tela: o prompt leva o peso do FEL 1) ---

export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// O mês (0 a 11) de uma data AAAA-MM-DD: a coluna destacada no calendário de pesos (hoje, ou a data simulada).
export function indiceDoMes(iso) {
  const mes = Number(String(iso || '').slice(5, 7))
  return mes >= 1 && mes <= 12 ? mes - 1 : null
}

// O sufixo da classe CSS de um peso; vazio para o que não é Alto, Médio nem Baixo (ex.: "Médio-Alto").
export function classePeso(peso) {
  return { Alto: 'alto', Médio: 'medio', Baixo: 'baixo' }[peso] || ''
}

// O tom de um símbolo da matriz de relações: positivo (forte, média, fraca), inverso (média, fraca), dependente do
// regime ou desprezível. A legenda, com o significado, vem da API.
export function tomRelacao(simbolo) {
  if (simbolo === '++' || simbolo === '+/++') return 'positiva-forte'
  if (simbolo === '+') return 'positiva'
  if (simbolo === '(+)') return 'positiva-fraca'
  if (simbolo === '−') return 'inversa'
  if (simbolo === '(−)') return 'inversa-fraca'
  if (simbolo === '±' || simbolo === '(±)') return 'regime'
  return 'nula'
}

// Como uma regra de agregação está hoje no FinMind.
export const ROTULO_AGREGACAO = {
  ORIENTACAO: 'Orientação no prompt',
  PARCIAL: 'Em parte',
  FORA: 'Fora do motor'
}

// De onde vem cada regra da agregação do FinMind (ADR 0066): do especialista, derivada do estudo ou proposta do FinMind.
export const ROTULO_ORIGEM_REGRA = {
  DAVID: 'Do especialista',
  DERIVADA: 'Derivada do estudo',
  PROPOSTA: 'Proposta do FinMind'
}

// A célula de uma família num horizonte da agregação do FinMind: o peso em % (ou "—" quando a família não entra) e, na
// família com composição por horizonte (a Oferta do café), as siglas dos membros que entram nele.
export function celulaPesoFamilia(familia, horizonte, siglaPorCodigo = {}) {
  const peso = familia.pesos[horizonte]
  if (!peso) return { texto: '—', membros: null }
  const membros = familia.composicao?.[horizonte]
  const todos = !membros || membros.length === familia.fatores.length
  // Um texto no lugar do número (o milho, ADR 0081: o peso é o do mês no calendário do especialista).
  if (typeof peso === 'string') return { texto: peso, membros: null }
  return { texto: `${peso}%`, membros: todos ? null : membros.map((c) => siglaPorCodigo[c] || c).join(' + ') }
}

// O especialista definiu peso próprio (calendário por mês, peso fixo, papel ou sugestão de peso-base) para algum fator?
// Hoje só o milho. Sem isso, o peso de cada fator é o do FEL 1, que já aparece no card de cada fator.
export function temCalendario(pesos) {
  return pesos.fatores.some((f) => f.sugestao || f.meses || f.fixo || f.papel)
}

// O resumo ao lado do título "Pesos e relações": o que vai ao prompt diário (o peso, e as relações e regras do
// especialista como orientação) e, quando existe, a leitura agregada do motor (a agregação em código do FinMind).
export function resumoPesos(pesos) {
  // O peso fixo do Comitê e a relevância por horizonte (a soja, ADR 0116): a IA combina, sem agregação em código.
  if (pesos.relevancia) return 'No prompt: o peso fixo de cada fator (do Comitê) e a relevância por horizonte, como orientação.'
  const peso = temCalendario(pesos) && pesos.noPrompt ? 'o calendário de pesos' : 'o peso do FEL 1'
  const orientacao = []
  if (pesos.pares?.some((par) => par.noPrompt)) orientacao.push('relações')
  if (pesos.agregacao.some((r) => r.noFinMind.situacao === 'ORIENTACAO')) orientacao.push('regras')
  const doEspecialista = orientacao.length ? ` e as ${orientacao.join(' e ')} do especialista, como orientação` : ''
  const motor = pesos.agregacaoFinMind && pesos.agregacaoFinMind.emProducao !== false ? '; e a leitura agregada do motor (proposta do FinMind)' : ''
  return `No prompt: ${peso}${doEspecialista}${motor}.`
}
