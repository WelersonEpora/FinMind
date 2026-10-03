// Funções puras da leitura diária de tendência da IA no Centro de Decisão (ADR 0052): os rótulos das escalas e a faixa
// em %, a partir dos limites T1 e T2 do horizonte gravados com a leitura (a configuração da metodologia, ADR 0051).

const FORMATADOR_LIMITE = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

const TENDENCIAS = {
  ALTA: { rotulo: 'Alta', icone: 'bi-arrow-up-right', classe: 'alta' },
  BAIXA: { rotulo: 'Baixa', icone: 'bi-arrow-down-right', classe: 'baixa' },
  LATERAL: { rotulo: 'Lateral', icone: 'bi-arrow-right', classe: 'lateral' },
  INSUFICIENTE: { rotulo: 'Insuficiente', icone: 'bi-question-lg', classe: 'insuficiente' }
}

const FAIXAS = {
  BAIXA_FORTE: 'Baixa forte',
  BAIXA_LEVE: 'Baixa leve',
  LATERAL: 'Lateral',
  ALTA_LEVE: 'Alta leve',
  ALTA_FORTE: 'Alta forte'
}

const CONFIANCAS = { ALTA: 'Confiança alta', MEDIA: 'Confiança média', BAIXA: 'Confiança baixa' }

const PAPEIS_COT = {
  CONFIRMA: 'Confirma a leitura',
  EXCESSO: 'Indica excesso de posição',
  RISCO_DE_REVERSAO: 'Risco de reversão',
  ENFRAQUECE: 'Enfraquece a leitura',
  SEM_PAPEL: 'Sem papel neste horizonte',
  SEM_DADO: 'Sem dado'
}

const SITUACOES_LACUNA = {
  SEM_DADO: 'Sem dado',
  DEFASADO: 'Defasado',
  ESTIMADO: 'Estimado',
  SEM_LEITURA: 'Sem leitura',
  CURVA_SEM_DADO: 'Curva futura sem dado',
  OUTRO: 'Outro'
}

const comRotulo = (tabela, codigo) => tabela[codigo] || codigo || '-'

// O chip da confiança: o texto e a classe da cor (baixa em âmbar, média em azul claro, alta em azul forte; nada de verde
// ou vermelho, que no card são a direção do preço). Sem confiança (INSUFICIENTE), um chip neutro.
const CLASSES_CONFIANCA = { ALTA: 'alta', MEDIA: 'media', BAIXA: 'baixa' }

export function nivelConfianca(codigo) {
  return CLASSES_CONFIANCA[codigo]
    ? { rotulo: CONFIANCAS[codigo], classe: CLASSES_CONFIANCA[codigo] }
    : { rotulo: 'Sem confiança', classe: 'nenhuma' }
}

export function tendencia(codigo) {
  return TENDENCIAS[codigo] || { rotulo: codigo || '-', icone: 'bi-dash', classe: 'insuficiente' }
}

export const rotuloFaixa = (codigo) => comRotulo(FAIXAS, codigo)

// A etiqueta do card: a tendência com a intensidade da faixa ("Alta forte", "Baixa leve"); lateral e insuficiente
// ficam só com a tendência. `forte` muda o visual (etiqueta preenchida). A faixa em % fica à parte, sem repetir a direção.
export function etiquetaLeitura(codigoTendencia, codigoFaixa) {
  const base = tendencia(codigoTendencia)
  const comIntensidade = (codigoTendencia === 'ALTA' || codigoTendencia === 'BAIXA') && FAIXAS[codigoFaixa]
  return {
    ...base,
    rotulo: comIntensidade ? FAIXAS[codigoFaixa] : base.rotulo,
    forte: Boolean(comIntensidade) && codigoFaixa.endsWith('_FORTE')
  }
}
export const rotuloConfianca = (codigo) => comRotulo(CONFIANCAS, codigo)
export const rotuloPapelCot = (codigo) => comRotulo(PAPEIS_COT, codigo)
export const rotuloLacuna = (codigo) => comRotulo(SITUACOES_LACUNA, codigo)

const pct = (valor) => `${FORMATADOR_LIMITE.format(valor)}%`

// A faixa em % no horizonte: "+1% a +2,5%", "≥ +2,5%", "entre −1% e +1%". Sem os limites, null (a tela mostra só o nome).
// Bordas como na classificação do realizado (analise-diaria-petroleo.js::classificarVariacao).
export function intervaloDaFaixa(codigo, { t1, t2 } = {}) {
  if (t1 == null || t2 == null) return null
  switch (codigo) {
    case 'ALTA_FORTE':
      return `≥ +${pct(t2)}`
    case 'ALTA_LEVE':
      return `+${pct(t1)} a +${pct(t2)}`
    case 'LATERAL':
      return `entre −${pct(t1)} e +${pct(t1)}`
    case 'BAIXA_LEVE':
      return `−${pct(t1)} a −${pct(t2)}`
    case 'BAIXA_FORTE':
      return `≤ −${pct(t2)}`
    default:
      return null
  }
}

// "1 dia" / "7 dias".
export function rotuloDias(dias) {
  return dias === 1 ? '1 dia' : `${dias} dias`
}

// A leitura que o motor passou de um fator calculado (camada C: pressão, intensidade e tendência), para a linha do card de
// evidências. Os códigos são os de factors/base/decisao-por-faixa.js. Sem leitura, null.
const PRESSOES_FATOR = {
  ALTA: { rotulo: 'Pressão de alta', icone: 'bi-arrow-up', classe: 'alta' },
  BAIXA: { rotulo: 'Pressão de baixa', icone: 'bi-arrow-down', classe: 'baixa' },
  NEUTRA: { rotulo: 'Neutra', icone: 'bi-dash', classe: 'lateral' }
}
const INTENSIDADES_FATOR = { FRACA: 'fraca', MODERADA: 'moderada', FORTE: 'forte' }
const TENDENCIAS_FATOR = { SUBINDO: 'subindo', CAINDO: 'caindo', ESTAVEL: 'estável' }

export function leituraDoFator(leitura) {
  const pressao = PRESSOES_FATOR[leitura?.pressao]
  if (!pressao) return null
  const intensidade = leitura.pressao === 'NEUTRA' ? null : INTENSIDADES_FATOR[leitura.intensidade] || null
  return {
    ...pressao,
    texto: intensidade ? `${pressao.rotulo}, ${intensidade}` : pressao.rotulo,
    tendencia: TENDENCIAS_FATOR[leitura.tendencia] || null
  }
}

// O chip da situação do dado de um fator na linha do card: só quando falta algo (o resto é a data do dado).
const SITUACOES_FATOR = { SEM_DADO: 'Sem dado', SEM_LEITURA: 'Sem leitura' }

export function faltaNoFator(situacao) {
  return SITUACOES_FATOR[situacao] || null
}

// O rótulo da medida sem a camada entre parênteses ("Desvio (B)" -> "Desvio"): a letra é jargão da metodologia.
export function rotuloMedida(rotulo) {
  return String(rotulo || '').replace(/\s*\([A-D]\)\s*$/, '')
}

// A idade do dado na data da leitura: "hoje", "há 1 dia", "há 8 dias".
export function idadeDoDado(dias) {
  if (dias == null) return null
  if (dias <= 0) return 'hoje'
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`
}

// "Nenhum evento", "1 evento", "2 eventos" (na janela do fator de evento).
export function contarEventos(quantidade) {
  if (!quantidade) return 'Nenhum evento'
  return quantidade === 1 ? '1 evento' : `${quantidade} eventos`
}
