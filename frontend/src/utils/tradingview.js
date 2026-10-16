// Telas TradingView (ADR 0128): os símbolos que o widget gratuito do TradingView mostra, conferidos um a um em
// 2026-10-16 (o gráfico abriu com candles no widget). Dois grupos: a B3, os contratos do FinMind e os que o David
// acompanha no Profit, e a Pepperstone, a corretora em que ele opera ouro e Brent (os CFDs de milho, café, soja e
// dólar seguem a bolsa americana, em dólar e na unidade de lá: outro instrumento, para comparação). Ficaram de fora:
// o ouro da B3 (GLD1!, quase sem negócio: dias sem candle), o Brent na B3 (não existe) e o TVC (só repete ouro e
// Brent). O dado é do TradingView, não do FinMind, e não alimenta nada.

export const GRUPOS_TRADINGVIEW = [
  {
    codigo: 'B3',
    rotulo: 'B3',
    selo: '15 min de atraso',
    serie: 'Série contínua (1º vencimento)',
    atraso: '15 min de atraso',
    simbolos: [
      { simbolo: 'BMFBOVESPA:CCM1!', curto: 'CCM1!', ativo: 'Milho', unidade: 'R$/saca', par: 'MILHO' },
      { simbolo: 'BMFBOVESPA:ICF1!', curto: 'ICF1!', ativo: 'Café', unidade: 'US$/saca', par: 'CAFE' },
      { simbolo: 'BMFBOVESPA:SJC1!', curto: 'SJC1!', ativo: 'Soja', unidade: 'US$/saca', par: 'SOJA' },
      { simbolo: 'BMFBOVESPA:DOL1!', curto: 'DOL1!', ativo: 'Dólar', unidade: 'R$ por US$ 1.000', par: 'DOLAR' },
      { simbolo: 'BMFBOVESPA:WDO1!', curto: 'WDO1!', ativo: 'Minidólar', unidade: 'R$ por US$ 1.000', par: null }
    ]
  },
  {
    codigo: 'PEPPERSTONE',
    rotulo: 'Pepperstone',
    selo: 'CFD',
    serie: 'CFD da corretora',
    atraso: null,
    simbolos: [
      // Ouro e Brent abrem no gráfico de 4 horas: o tempo do ATR(14) deles na Cartilha (Tabela 2).
      { simbolo: 'PEPPERSTONE:XAUUSD', curto: 'XAUUSD', ativo: 'Ouro', unidade: 'US$/onça', par: null, intervalo: '240' },
      { simbolo: 'PEPPERSTONE:SPOTBRENT', curto: 'SPOTBRENT', ativo: 'Brent', unidade: 'US$/barril', par: null, intervalo: '240' },
      { simbolo: 'PEPPERSTONE:CORN', curto: 'CORN', ativo: 'Milho', unidade: 'Chicago, US$/bushel', par: 'MILHO' },
      // `unidadeCurta`: a da lista estreita de ativos; o cabeçalho do gráfico mostra a completa.
      {
        simbolo: 'PEPPERSTONE:COFFEE',
        curto: 'COFFEE',
        ativo: 'Café',
        unidade: 'Nova York, centavos de US$/libra',
        unidadeCurta: 'Nova York, ¢/libra',
        par: 'CAFE'
      },
      {
        simbolo: 'PEPPERSTONE:SOYBEANS',
        curto: 'SOYBEANS',
        ativo: 'Soja',
        unidade: 'Chicago, centavos de US$/bushel',
        unidadeCurta: 'Chicago, ¢/bushel',
        par: 'SOJA'
      },
      { simbolo: 'PEPPERSTONE:USDBRL', curto: 'USDBRL', ativo: 'Dólar', unidade: 'R$ por US$', par: 'DOLAR' }
    ]
  }
]

// Comparação B3 x Pepperstone: o mesmo ativo nos dois instrumentos. `rotuloB3` e `rotuloPepperstone` dizem, no botão
// "Comparar ...", com quem o gráfico aberto vai ser comparado.
export const PARES_TRADINGVIEW = [
  {
    codigo: 'MILHO',
    ativo: 'Milho',
    b3: { simbolo: 'BMFBOVESPA:CCM1!', titulo: 'Milho B3', unidade: 'R$/saca' },
    pepperstone: { simbolo: 'PEPPERSTONE:CORN', titulo: 'Milho Chicago', unidade: 'US$/bushel' },
    comparacaoDaB3: 'com Chicago',
    bolsa: 'A B3 negocia o milho entregue no Brasil; o CFD segue o contrato de Chicago (CBOT).'
  },
  {
    codigo: 'CAFE',
    ativo: 'Café',
    b3: { simbolo: 'BMFBOVESPA:ICF1!', titulo: 'Café arábica B3', unidade: 'US$/saca' },
    pepperstone: { simbolo: 'PEPPERSTONE:COFFEE', titulo: 'Café Nova York', unidade: 'centavos de US$/libra' },
    comparacaoDaB3: 'com Nova York',
    bolsa: 'A B3 negocia o arábica brasileiro; o CFD segue o contrato "C" de Nova York (ICE).'
  },
  {
    codigo: 'SOJA',
    ativo: 'Soja',
    b3: { simbolo: 'BMFBOVESPA:SJC1!', titulo: 'Soja B3', unidade: 'US$/saca' },
    pepperstone: { simbolo: 'PEPPERSTONE:SOYBEANS', titulo: 'Soja Chicago', unidade: 'centavos de US$/bushel' },
    comparacaoDaB3: 'com Chicago',
    bolsa: 'O minicontrato da B3 é liquidado pelo preço de Chicago; o CFD segue o mesmo contrato da CBOT.'
  },
  {
    codigo: 'DOLAR',
    ativo: 'Dólar',
    b3: { simbolo: 'BMFBOVESPA:DOL1!', titulo: 'Dólar futuro B3', unidade: 'R$ por US$ 1.000' },
    pepperstone: { simbolo: 'PEPPERSTONE:USDBRL', titulo: 'USDBRL', unidade: 'R$ por US$' },
    comparacaoDaB3: 'com o USDBRL',
    bolsa: 'A B3 negocia o dólar futuro; o CFD acompanha o câmbio à vista.'
  }
]

const TODOS = GRUPOS_TRADINGVIEW.flatMap((grupo) =>
  grupo.simbolos.map((item) => ({ ...item, grupo: grupo.codigo, grupoRotulo: grupo.rotulo, serie: grupo.serie, atraso: grupo.atraso }))
)

export const SIMBOLO_PADRAO = TODOS[0].simbolo
export const PAR_PADRAO = PARES_TRADINGVIEW[0].codigo

// O símbolo da URL, se for um do catálogo; senão o padrão (a tela nunca passa ao widget um símbolo que não conferimos).
export function simboloValido(simbolo) {
  return TODOS.some((item) => item.simbolo === simbolo) ? simbolo : SIMBOLO_PADRAO
}

export function itemDoSimbolo(simbolo) {
  return TODOS.find((item) => item.simbolo === simbolo) || null
}

export function parValido(codigo) {
  const normalizado = String(codigo || '').toUpperCase()
  return PARES_TRADINGVIEW.some((par) => par.codigo === normalizado) ? normalizado : PAR_PADRAO
}

export function parDoCodigo(codigo) {
  return PARES_TRADINGVIEW.find((par) => par.codigo === parValido(codigo))
}

// Rótulo do botão "Comparar ..." do gráfico aberto: com a bolsa americana, se o aberto é da B3; com a B3, se é da
// Pepperstone. null quando o ativo não tem par (minidólar, ouro, Brent).
export function rotuloComparacao(item) {
  if (!item?.par) return null
  const par = PARES_TRADINGVIEW.find((p) => p.codigo === item.par)
  return item.grupo === 'B3' ? par.comparacaoDaB3 : 'com a B3'
}

// O mesmo símbolo aberto direto no site do TradingView.
export function linkTradingView(simbolo) {
  return `https://br.tradingview.com/chart/?symbol=${encodeURIComponent(simboloValido(simbolo))}`
}

// Tema do gráfico: escuro por padrão (o visual que o David usa no Profit), claro por escolha. Preferência de cada
// navegador, no localStorage; sem armazenamento (janela privada, bloqueado), fica no padrão.
export const TEMA_PADRAO = 'dark'
const CHAVE_TEMA = 'finmind:tradingview-tema'

export function temaValido(tema) {
  return tema === 'light' || tema === 'dark' ? tema : TEMA_PADRAO
}

function armazenamento() {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

export function lerTema(storage = armazenamento()) {
  try {
    return temaValido(storage?.getItem(CHAVE_TEMA))
  } catch {
    return TEMA_PADRAO
  }
}

export function salvarTema(tema, storage = armazenamento()) {
  try {
    storage?.setItem(CHAVE_TEMA, temaValido(tema))
  } catch {
    // sem armazenamento: só não lembra
  }
}

// Indicadores que já abrem ligados: só o ATR(14), o da Cartilha de Operações (stop e alvos; ADR 0127), no padrão do
// TradingView (Wilder, 14 períodos, o mesmo cálculo de `backend/src/carteiras/atr.js`, mas sobre a série contínua e o
// fechamento deles). Outro indicador só por decisão registrada no ADR 0128; fora isso, cada um liga o que quiser no
// menu "Indicadores" do widget.
export const ESTUDOS_PADRAO = ['STD;Average_True_Range']

// Tempo gráfico de abertura de cada símbolo: diário, ou o do catálogo (4 horas no ouro e no Brent).
export const INTERVALO_PADRAO = 'D'
const ROTULOS_INTERVALO = { D: 'Diário', 240: '4 horas' }

export function intervaloDoSimbolo(simbolo) {
  return itemDoSimbolo(simbolo)?.intervalo || INTERVALO_PADRAO
}

export function rotuloIntervalo(simbolo) {
  return ROTULOS_INTERVALO[intervaloDoSimbolo(simbolo)]
}

// Janela inicial dos gráficos diários (12 meses). Nos de 4 horas fica de fora: a janela manda no tempo gráfico do
// widget (testado: 1 mês abria em 30 min, 3 meses em 1 h), e o 4h seria trocado.
const JANELA_DIARIO = '12M'

// O tema escuro usa o azul-marinho do Profit (o que o David vê) no lugar do preto do TradingView.
export const FUNDO_ESCURO = '#0B1A33'
const GRADE_ESCURA = 'rgba(255, 255, 255, 0.06)'

// Configuração do widget "Advanced Real-Time Chart": em português, sem troca de símbolo dentro do widget (a escolha
// fica na tela, só com os símbolos do catálogo), com a barra lateral de desenho (Fibonacci, linhas, textos, medição; os
// desenhos não ficam salvos), a barra de períodos embaixo (1D a Todos) e o painel de detalhes à direita (preço, faixas
// do dia e de 52 semanas e a curva dos vencimentos do futuro). Opções:
//   detalhes  false tira o painel de detalhes (o gráfico sobreposto da comparação)
//   comparar  um 2º símbolo do catálogo, sobreposto no mesmo gráfico, em % (sem o ATR, que seria só do 1º)
export function configuracaoWidget(simbolo, tema = TEMA_PADRAO, { detalhes = true, comparar = null } = {}) {
  const principal = simboloValido(simbolo)
  const intervalo = intervaloDoSimbolo(principal)
  const escuro = temaValido(tema) === 'dark'
  const sobreposto = comparar && itemDoSimbolo(comparar) && comparar !== principal ? comparar : null
  return {
    autosize: true,
    symbol: principal,
    interval: intervalo,
    ...(intervalo === INTERVALO_PADRAO ? { range: JANELA_DIARIO } : {}),
    timezone: 'America/Sao_Paulo',
    theme: temaValido(tema),
    ...(escuro ? { backgroundColor: FUNDO_ESCURO, gridColor: GRADE_ESCURA } : {}),
    style: '1',
    locale: 'br',
    allow_symbol_change: false,
    hide_side_toolbar: false,
    withdateranges: true,
    details: Boolean(detalhes),
    studies: sobreposto ? [] : [...ESTUDOS_PADRAO],
    ...(sobreposto ? { compareSymbols: [{ symbol: sobreposto, position: 'SameScale' }] } : {}),
    save_image: true,
    calendar: false,
    support_host: 'https://www.tradingview.com'
  }
}
