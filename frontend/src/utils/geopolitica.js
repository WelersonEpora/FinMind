// Rótulos da leitura de geopolítica (ADR 0047) para a tela Eventos. Funções puras, testáveis sem DOM.

const NIVEIS = {
  NORMAL: { rotulo: 'Normal', classe: 'normal' },
  ATENCAO: { rotulo: 'Atenção', classe: 'atencao' },
  RELEVANTE: { rotulo: 'Relevante', classe: 'relevante' },
  EXCEPCIONAL: { rotulo: 'Excepcional', classe: 'excepcional' }
}

const ATIVOS = { OURO: 'Ouro', PETROLEO: 'Petróleo' }
const GRAUS = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta' }

// Pressão do fato sobre o preço (prompt v2): para que lado o fato, sozinho, empurra o preço. Não é previsão.
const PRESSOES = {
  ALTA: { rotulo: 'Alta', icone: 'bi-arrow-up', classe: 'alta' },
  BAIXA: { rotulo: 'Baixa', icone: 'bi-arrow-down', classe: 'baixa' },
  AMBIGUA: { rotulo: 'Ambígua', icone: 'bi-arrow-down-up', classe: 'ambigua' }
}

// null para leituras sem o dado (prompt v1) ou com valor não reconhecido.
export function pressao(codigo) {
  return PRESSOES[codigo] || null
}

export function nivel(codigo) {
  return NIVEIS[codigo] || { rotulo: codigo || '—', classe: 'desconhecido' }
}

export function rotuloAtivo(codigo) {
  return ATIVOS[codigo] || codigo || '—'
}

export function rotuloGrau(codigo) {
  return GRAUS[codigo] || '—'
}

// "2026-10-01" -> "01/10/2026" (data sem hora: não passa por Date, para o fuso não mudar o dia).
export function formatarData(dataIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dataIso || ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

// Texto do link de uma fonte: o nome; sem nome, o domínio da URL.
export function rotuloFonte(fonte) {
  if (fonte?.nome) return fonte.nome
  try {
    return new URL(fonte.url).hostname.replace(/^www\./, '')
  } catch {
    return fonte?.url || 'Fonte sem nome'
  }
}

// Assunto (o fator) e tipo do evento dentro dele. Em sincronia com o backend (GeopoliticaEvento.ASSUNTOS e .TIPOS).
export const ASSUNTOS = { GEOPOLITICA: 'Geopolítica' }
export const TIPOS = {
  CONFLITO_MILITAR: 'Conflito militar',
  ROTA_MARITIMA: 'Rota marítima',
  INFRAESTRUTURA: 'Infraestrutura',
  SANCAO: 'Sanção',
  PRODUCAO: 'Decisão de produção',
  DIPLOMACIA: 'Diplomacia',
  OUTRO: 'Outro'
}

export function rotuloAssunto(codigo) {
  return ASSUNTOS[codigo] || codigo || '—'
}

export function rotuloTipo(codigo) {
  return TIPOS[codigo] || '—'
}
