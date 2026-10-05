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

// Um fator de CONTEXTO (a inflação do ouro, ADR 0054) foi ao prompt sem pressão: só o papel e a tendência.
export function leituraDoFator(leitura) {
  if (leitura?.papel === 'CONTEXTO') {
    return { rotulo: 'Contexto', icone: 'bi-info-circle', classe: 'lateral', texto: 'Contexto', tendencia: TENDENCIAS_FATOR[leitura.tendencia] || null }
  }
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

// O realizado de um horizonte (ADR 0063): em que faixa o preço de fato caiu, para mostrar ao lado da faixa lida. Só
// descreve: a leitura isolada não ganha marca de acerto ou erro (as medidas ficam na tela Qualidade da IA, ADR 0064).
// Sem realizado (resposta antiga da API), null.
const FORMATADOR_VARIACAO = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const CLASSES_FAIXA = { BAIXA_FORTE: 'baixa', BAIXA_LEVE: 'baixa', LATERAL: 'lateral', ALTA_LEVE: 'alta', ALTA_FORTE: 'alta' }

export function realizadoDoHorizonte(realizado, formatarData) {
  if (!realizado) return null
  const alvo = formatarData(realizado.dataAlvo)
  switch (realizado.situacao) {
    case 'APURADO': {
      const v = realizado.variacaoPct
      return {
        apurado: true,
        variacao: `${v > 0 ? '+' : v < 0 ? '−' : ''}${FORMATADOR_VARIACAO.format(Math.abs(v))}%`,
        faixa: realizado.faixa ? rotuloFaixa(realizado.faixa) : null,
        classe: CLASSES_FAIXA[realizado.faixa] || 'insuficiente',
        nota: `preço de ${formatarData(realizado.dataPreco)}`
      }
    }
    case 'A_APURAR':
      return { apurado: false, nota: `apura em ${alvo}` }
    case 'AGUARDANDO_DADO':
      return { apurado: false, nota: `aguardando o preço de ${alvo}` }
    case 'SEM_PREGAO':
      return { apurado: false, nota: `sem pregão novo até ${alvo}` }
    case 'SEM_PRECO':
      return { apurado: false, nota: `sem preço perto de ${alvo} (contrato vencido ou série parada)` }
    default:
      return { apurado: false, nota: 'sem preço-base na leitura' }
  }
}

// Os nomes das famílias da agregação do motor (o café, ADR 0066).
const FAMILIAS_MOTOR = { OFERTA: 'Oferta', CAMBIO: 'Câmbio', DEMANDA: 'Demanda', JUROS: 'Juros', CUSTOS: 'Custos' }
const NUMERO = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const comSinal = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${NUMERO.format(Math.abs(n))}`

// A leitura agregada do motor num horizonte, como o Centro de Decisão a mostra: a etiqueta (a mesma da IA), a confiança,
// se a direção diverge da IA e o que a formou (cada família com peso e contribuição, o papel do F7, os motivos). Sem a
// agregação gravada (outros ativos, leituras antigas) ou sem o horizonte, null. Só descreve o que foi gravado.
export function leituraDoMotor(agregacaoMotor, codigoHorizonte, leituraIa = null) {
  const h = (agregacaoMotor?.horizontes || []).find((x) => x.horizonte === codigoHorizonte)
  if (!h) return null
  const insuficiente = h.tendencia === 'INSUFICIENTE'
  return {
    etiqueta: etiquetaLeitura(h.tendencia, h.faixa),
    confianca: h.confianca ? nivelConfianca(h.confianca) : null,
    score: comSinal(h.score),
    cobertura: `${Math.round(h.cobertura * 100)}%`,
    diverge: Boolean(leituraIa && !insuficiente && leituraIa.tendencia !== 'INSUFICIENTE' && leituraIa.tendencia !== h.tendencia),
    familias: h.familias.map((f) => ({
      rotulo: FAMILIAS_MOTOR[f.codigo] || f.codigo,
      texto: !f.ativa
        ? 'fora deste horizonte (sem Conab recente)'
        : f.ausente
          ? `${Math.round(f.pesoEfetivo * 100)}%, sem dado`
          : `${Math.round(f.pesoEfetivo * 100)}% × ${comSinal(f.score)} = ${comSinal(f.contribuicao)}`
    })),
    fundos: rotuloPapelCot(h.fundos),
    conflito: h.conflito ? h.conflito.familias.map((c) => FAMILIAS_MOTOR[c] || c).join(' × ') : null,
    motivos: h.motivosConfianca || [],
    versao: agregacaoMotor.versao
  }
}
