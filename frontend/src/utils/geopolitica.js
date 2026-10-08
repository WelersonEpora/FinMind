// Rótulos da leitura diária de eventos de mercado (ADRs 0047 e 0049) para a tela Eventos e o Centro de Decisão.
// Funções puras, testáveis sem DOM. Os códigos estão em sincronia com o backend (shared/eventos-mercado.js).

const NIVEIS = {
  NORMAL: { rotulo: 'Normal', classe: 'normal' },
  ATENCAO: { rotulo: 'Atenção', classe: 'atencao' },
  RELEVANTE: { rotulo: 'Relevante', classe: 'relevante' },
  EXCEPCIONAL: { rotulo: 'Excepcional', classe: 'excepcional' }
}

export const ATIVOS = { OURO: 'Ouro', PETROLEO: 'Petróleo', MILHO: 'Milho', CAFE: 'Café', SOJA: 'Soja' }
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

// Tipo do evento (ADR 0049): a geopolítica é um deles.
export const TIPOS = {
  GEOPOLITICA: 'Geopolítica',
  POLITICA_COMERCIAL: 'Política comercial',
  CLIMA_EXTREMO: 'Clima extremo',
  REGULACAO: 'Regulação',
  CHOQUE_LOGISTICO: 'Choque logístico',
  SANIDADE: 'Sanidade',
  POLITICA_OFERTA: 'Política de oferta'
}

export function rotuloTipo(codigo) {
  return TIPOS[codigo] || '—'
}
