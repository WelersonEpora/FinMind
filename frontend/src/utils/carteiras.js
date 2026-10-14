// Carteiras virtuais (ADR 0127): rótulos, formatação e os campos dos parâmetros, para as telas. Funções puras.

export { formatarData } from './geopolitica.js'

// O manual das carteiras (docs/manual-carteiras.md), aberto no DocumentoModal pelo botão "Manual" das telas.
export const DOCUMENTO_MANUAL = 'manual-carteiras'

// As trilhas: as três que decidem e as três referências calculadas. O operador só rende o caixa até a etapa 6 (o
// diário).
export const TRILHAS = [
  { tipo: 'OPERADOR', nome: 'Operador', grupo: 'trilha', descricao: 'Suas decisões, registradas no diário.', aguarda: 'O diário do operador entra na etapa 6: até lá, só rende o caixa.' },
  { tipo: 'IA', nome: 'IA', grupo: 'trilha', descricao: 'Segue a recomendação diária da IA.' },
  { tipo: 'DETERMINISTICA', nome: 'Determinística', grupo: 'trilha', descricao: 'A regra fixa sobre a leitura de tendência do MÉDIO.' },
  { tipo: 'CAIXA', nome: 'Caixa', grupo: 'referencia', descricao: 'Só rende a Selic.' },
  { tipo: 'COMPRAR_E_SEGURAR', nome: 'Comprar e segurar', grupo: 'referencia', descricao: '1/n do patrimônio comprado em cada ativo, sem stop.' },
  { tipo: 'PERSISTENCIA', nome: 'Persistência', grupo: 'referencia', descricao: 'A direção dos últimos 30 dias, pela regra fixa.' }
]

const POR_TIPO = Object.fromEntries(TRILHAS.map((t) => [t.tipo, t]))
export const trilha = (tipo) => POR_TIPO[tipo] || { tipo, nome: tipo, grupo: 'trilha', descricao: '' }
export const nomeTrilha = (tipo) => trilha(tipo).nome

const ROTULOS = {
  // Ações das intenções.
  ENTRAR_COMPRADO: 'Entrar comprado',
  ENTRAR_VENDIDO: 'Entrar vendido',
  NAO_ENTRAR: 'Não entrar',
  MANTER: 'Manter',
  REDUZIR: 'Reduzir',
  ZERAR: 'Zerar',
  // Resultado de uma intenção.
  ORDEM: 'Virou ordem',
  SEM_ORDEM: 'Sem ordem',
  BLOQUEADA: 'Bloqueada',
  // Origem.
  REGRA: 'Regra',
  RECOMENDACAO: 'Recomendação',
  FALLBACK: 'Contingência',
  OPERADOR: 'Operador',
  // Rodada.
  DECIDIDA: 'Decidida',
  SEM_DECISAO: 'Sem decisão',
  PENDENTE: 'Pendente',
  LIQUIDADA: 'Liquidada',
  ROTINA_NAO_RODOU: 'A rotina não rodou neste dia',
  LIQUIDACAO_PENDENTE: 'Uma liquidação anterior está pendente',
  ERRO_NA_DECISAO: 'Erro ao decidir',
  // Ordens.
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  REDUCAO: 'Redução',
  INTENCAO: 'Pela intenção',
  VENCIMENTO: 'Vencimento do contrato',
  CRIADA: 'Aguardando liquidação',
  EXECUTADA: 'Executada',
  REJEITADA: 'Rejeitada',
  EXPIRADA: 'Expirada',
  SEM_PREGAO: 'Sem pregão no dia',
  POSICAO_ENCERRADA: 'A posição já tinha sido encerrada',
  JA_TEM_POSICAO: 'Já havia posição no ativo',
  STOP_DO_LADO_ERRADO: 'Stop do lado errado',
  FORA_DA_FAIXA: 'Preço fora da faixa do dia',
  // Posições.
  ABERTA: 'Aberta',
  ENCERRADA: 'Encerrada',
  COMPRADO: 'Comprado',
  VENDIDO: 'Vendido',
  STOP: 'Stop',
  ALVO1: 'Alvo 1',
  ALVO2: 'Alvo 2',
  // Bloqueios.
  MAX_POSICOES: 'Sem vaga (máximo de posições)',
  PERDA_DIARIA: 'Trava de perda diária',
  PERDA_SEMANAL: 'Trava de perda semanal',
  DRAWDOWN: 'Trava de drawdown',
  PERDAS_SEGUIDAS: 'Pausa por perdas seguidas',
  VENCIMENTO_PROXIMO: 'Contrato perto do vencimento',
  SEM_CONTRATO: 'Sem contrato com liquidez',
  SEM_ATR: 'Sem ATR',
  RR_MINIMO: 'Abaixo do R:R mínimo',
  QUANTIDADE_ZERO: 'Quantidade zero',
  JA_REDUZIDA: 'Já reduzida nesta operação',
  ATIVO_FORA_DA_CARTEIRA: 'Ativo fora da carteira',
  INTENCAO_INVALIDA: 'Intenção inválida',
  // Recomendação da IA.
  VALIDA: 'Válida',
  FALHA: 'Falhou',
  PRINCIPAL: 'Do dia',
  REPLICA: 'Réplica semanal',
  RESPOSTA_INVALIDA: 'Duas respostas fora do formato',
  MODELO_DIFERENTE: 'O modelo devolvido não é o fixado',
  GEMINI_FORA: 'O Gemini não respondeu',
  MODELO_NAO_FIXADO: 'Modelo da recomendação não configurado (ou um alias)',
  SEM_CHAVE_PAGA: 'Sem a chave paga do Gemini',
  SEM_LEITURAS: 'Nenhum ativo com leitura no dia',
  SEM_RECOMENDACAO: 'Sem recomendação: mantém',
  SEM_LEITURA: 'Sem leitura no dia',
  // Diário do operador.
  PLANEJADA: 'Planejada',
  EM_GESTAO: 'Em gestão',
  NAO_EXECUTADA: 'Não executada',
  CANCELADA: 'Cancelada',
  CANCELADA_PELO_OPERADOR: 'Cancelada pelo operador',
  EDITADA: 'Substituída por uma edição',
  STOP_MOVIDO: 'Stop movido',
  AGUARDANDO_INICIO: 'A carteira ainda não começou',
  SEM_RODADA: 'Ainda não há rodada',
  RODADA_LIQUIDADA: 'O dia já foi liquidado; o próximo abre com a rotina das 06h30',
  LIQUIDACAO_ANTERIOR_PENDENTE: 'Uma liquidação anterior está pendente',
  ROTINA_ATRASADA: 'A rotina diária está atrasada',
  // Medição.
  AGREGA: 'Agrega valor',
  NAO_AGREGA: 'Não agrega valor',
  INCONCLUSIVO: 'Inconclusivo',
  parametrosVersao: 'os parâmetros',
  modelo: 'o modelo da IA',
  versaoPrompt: 'a versão do prompt'
}

// As verificações da entrada do operador (o motor de risco), na conferência do diário.
export const VERIFICACOES = {
  STOP_DO_LADO: 'Stop do lado certo',
  PISO_ATR: 'Piso de ATR(14)',
  RR_MINIMO: 'R:R mínimo',
  QUANTIDADE: 'Tamanho pelo risco',
  VAGAS_E_TRAVAS: 'Vaga e travas'
}

export const rotulo = (codigo) => (codigo == null ? '—' : ROTULOS[codigo] || codigo)

export const ATIVOS = { MILHO: 'Milho', CAFE: 'Café', SOJA: 'Soja', OURO: 'Ouro', PETROLEO: 'Petróleo' }
export const nomeAtivo = (codigo) => ATIVOS[codigo] || codigo

const NUMERO = (casas) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })
const N2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatarMoeda(valor, moeda = 'BRL') {
  if (valor == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(valor)
}

// Com sinal: "+1,25%", "−0,40%", "0,00%".
export function formatarRetorno(pct) {
  if (pct == null) return '—'
  if (pct === 0) return '0,00%'
  return `${pct > 0 ? '+' : '−'}${N2.format(Math.abs(pct))}%`
}

export const formatarPreco = (v) => (v == null ? '—' : NUMERO(4).format(v))
export const formatarQuantidade = (v) => (v == null ? '—' : NUMERO(6).format(v))
export const formatarR = (v) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${N2.format(Math.abs(v))}R`)

// AAAA-MM-DD <-> Date à meia-noite local (o calendário trabalha com Date; um Date em UTC mudaria o dia no fuso de Brasília).
export function dataDeIso(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, mes - 1, dia)
}
export const isoDeData = (data) =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`

// Os dias, entre o primeiro e o último da lista, que não estão nela (o calendário os desabilita).
export function diasFora(datasIso) {
  if (!datasIso.length) return []
  const tem = new Set(datasIso)
  const ordenadas = [...tem].sort()
  const fim = ordenadas[ordenadas.length - 1]
  const fora = []
  for (let d = dataDeIso(ordenadas[0]); isoDeData(d) <= fim; d.setDate(d.getDate() + 1)) {
    if (!tem.has(isoDeData(d))) fora.push(isoDeData(d))
  }
  return fora
}

// Um número digitado: com vírgula, o ponto é de milhar ("1.234,5"); sem vírgula, o ponto é o decimal ("70.5").
export function lerNumero(texto) {
  const t = String(texto ?? '').trim()
  if (!t) return NaN
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
}

// A classe de cor de um número com sinal.
export const classeSinal = (v) => (v > 0 ? 'text-success' : v < 0 ? 'text-danger' : '')

// Os pontos do gráfico: o retorno acumulado (% do capital inicial) de cada trilha por dia, uma série por trilha, com o
// nome dela na legenda. Em %, as trilhas se comparam na mesma escala.
export function pontosDoPatrimonio(trilhas, capitalInicial) {
  const retorno = (patrimonio) => Math.round((patrimonio / capitalInicial - 1) * 1e4) / 100
  const pontos = trilhas.flatMap((t) => t.serie.map((p) => ({ data: p.data, valor: retorno(p.patrimonio), serie: t.tipo })))
  const rotulos = Object.fromEntries(trilhas.map((t) => [t.tipo, nomeTrilha(t.tipo)]))
  return { pontos, rotulos }
}

// Os campos dos parâmetros (ADR 0127, §8), na ordem da tela. `tipo`: 'numero' (decimal), 'inteiro' ou 'texto' (não
// editável aqui). `nulo`: aceita vazio (o custo pendente).
export const CAMPOS_ATIVO = [
  { chave: 'riscoPct', rotulo: 'Risco por operação', unidade: '% do patrimônio', tipo: 'numero' },
  { chave: 'pisoAtr', rotulo: 'Piso do stop', unidade: '× ATR(14)', tipo: 'numero' },
  { chave: 'alvo1R', rotulo: 'Alvo 1', unidade: 'R', tipo: 'numero' },
  { chave: 'alvo2R', rotulo: 'Alvo 2', unidade: 'R', tipo: 'numero' },
  { chave: 'rrMinimo', rotulo: 'R:R mínimo', unidade: '1 : x', tipo: 'numero' },
  { chave: 'slippageTicks', rotulo: 'Slippage', unidade: 'ticks', tipo: 'inteiro' },
  { chave: 'custoPorContrato', rotulo: 'Custo por contrato', unidade: 'moeda da conta', tipo: 'numero', nulo: true }
]

export const CAMPOS_CARTEIRA = [
  { chave: 'maxPosicoes', rotulo: 'Posições simultâneas (máx.)', unidade: '', tipo: 'inteiro' },
  { chave: 'perdaDiariaPct', rotulo: 'Perda diária máxima', unidade: '%', tipo: 'numero' },
  { chave: 'perdaSemanalPct', rotulo: 'Perda semanal máxima', unidade: '%', tipo: 'numero' },
  { chave: 'drawdownMaxPct', rotulo: 'Drawdown máximo', unidade: '%', tipo: 'numero' },
  { chave: 'perdasSeguidas', rotulo: 'Perdas seguidas para pausar', unidade: '', tipo: 'inteiro' },
  { chave: 'pausaPregoes', rotulo: 'Pausa depois das perdas', unidade: 'pregões', tipo: 'inteiro' },
  { chave: 'saidaAlvo1Pct', rotulo: 'Saída no alvo 1', unidade: '% da posição', tipo: 'numero' },
  { chave: 'fracaoReduzirPct', rotulo: 'Fração ao reduzir', unidade: '% da posição', tipo: 'numero' },
  { chave: 'fatorOvernight', rotulo: 'Fator do risco overnight', unidade: '×', tipo: 'numero' }
]

export const CAMPOS_EXECUCAO = [
  { chave: 'quantidade', rotulo: 'Quantidade', unidade: '', tipo: 'texto' },
  { chave: 'periodoAtr', rotulo: 'Período do ATR', unidade: 'pregões', tipo: 'inteiro' },
  { chave: 'diasUteisMinimosAteOLimite', rotulo: 'Folga mínima até o limite do contrato', unidade: 'dias úteis', tipo: 'inteiro' },
  { chave: 'diasUteisEncerrarAntesDoLimite', rotulo: 'Encerrar antes do limite', unidade: 'dias úteis', tipo: 'inteiro' },
  { chave: 'liquidezMinima', rotulo: 'Liquidez mínima', unidade: 'contratos no dia', tipo: 'inteiro' },
  { chave: 'registroTardioDiasUteis', rotulo: 'Registro tardio até', unidade: 'dias úteis', tipo: 'inteiro' }
]

export function formatarParametro(valor, campo) {
  if (valor === null) return campo?.nulo ? 'Pendente' : '—'
  if (campo?.tipo === 'texto') return valor === 'FRACIONARIA' ? 'Fracionária' : String(valor)
  return NUMERO(4).format(valor)
}

// Os parâmetros como um formulário de texto (o que o usuário digita) e de volta. Vírgula ou ponto como decimal; o
// custo vazio volta a nulo (pendente). -> { parametros, erros }.
export function paraFormulario(parametros) {
  const texto = (v) => (v == null ? '' : String(v).replace('.', ','))
  const grupo = (obj, campos) => Object.fromEntries(campos.map((c) => [c.chave, c.tipo === 'texto' ? obj[c.chave] : texto(obj[c.chave])]))
  return {
    ativos: Object.fromEntries(Object.entries(parametros.ativos).map(([ativo, a]) => [ativo, grupo(a, CAMPOS_ATIVO)])),
    carteira: grupo(parametros.carteira, CAMPOS_CARTEIRA),
    execucao: grupo(parametros.execucao, CAMPOS_EXECUCAO)
  }
}

export function doFormulario(formulario, base) {
  const erros = []
  const ler = (texto, campo, onde) => {
    if (campo.tipo === 'texto') return texto
    const limpo = String(texto ?? '').trim()
    if (limpo === '') {
      if (campo.nulo) return null
      erros.push(`${onde}: ${campo.rotulo} é obrigatório.`)
      return null
    }
    const n = Number(limpo.replace(',', '.'))
    if (!Number.isFinite(n) || (campo.tipo === 'inteiro' && !Number.isInteger(n))) {
      erros.push(`${onde}: ${campo.rotulo} deve ser ${campo.tipo === 'inteiro' ? 'um número inteiro' : 'um número'}.`)
      return null
    }
    return n
  }
  const grupo = (valores, campos, onde) => Object.fromEntries(campos.map((c) => [c.chave, ler(valores[c.chave], c, onde)]))
  const parametros = {
    ...base,
    ativos: Object.fromEntries(Object.entries(formulario.ativos).map(([ativo, v]) => [ativo, grupo(v, CAMPOS_ATIVO, nomeAtivo(ativo))])),
    carteira: grupo(formulario.carteira, CAMPOS_CARTEIRA, 'Carteira'),
    execucao: grupo(formulario.execucao, CAMPOS_EXECUCAO, 'Execução')
  }
  return { parametros, erros }
}

// Os três ramos da recomendação, na ordem da tela.
export const RAMOS = [
  { chave: 'semPosicao', nome: 'Sem posição' },
  { chave: 'comprado', nome: 'Se comprado' },
  { chave: 'vendido', nome: 'Se vendido' }
]

// A cor de uma ação: entrar comprado e manter em verde, vendido e zerar em vermelho, o resto neutro.
export function corDaAcao(acao) {
  if (acao === 'ENTRAR_COMPRADO') return 'text-bg-success'
  if (acao === 'ENTRAR_VENDIDO' || acao === 'ZERAR') return 'text-bg-danger'
  if (acao === 'REDUZIR') return 'text-bg-warning'
  return 'text-bg-light border'
}

// Quantos ramos a réplica repetiu da recomendação do dia (a consistência, ADR 0127, §4). -> { iguais, total }.
export function consistencia(principal, replica) {
  if (!principal?.recomendacoes || !replica?.recomendacoes) return null
  let iguais = 0
  let total = 0
  for (const p of principal.recomendacoes) {
    const r = replica.recomendacoes.find((x) => x.ativo === p.ativo)
    for (const { chave } of RAMOS) {
      total += 1
      if (r && r[chave].acao === p[chave].acao) iguais += 1
    }
  }
  return { iguais, total }
}

export const formatarUsd = (v) => (v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(v))

export const TIPOS_VERSAO = {
  INICIAL: 'Inicial',
  AJUSTE: 'Ajuste',
  CORRECAO_CUSTO: 'Correção de custo'
}
