import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GRUPOS_TRADINGVIEW,
  PARES_TRADINGVIEW,
  SIMBOLO_PADRAO,
  PAR_PADRAO,
  simboloValido,
  itemDoSimbolo,
  parValido,
  parDoCodigo,
  rotuloComparacao,
  linkTradingView,
  configuracaoWidget,
  TEMA_PADRAO,
  FUNDO_ESCURO,
  intervaloDoSimbolo,
  rotuloIntervalo,
  temaValido,
  lerTema,
  salvarTema
} from './tradingview.js'

function armazenamentoFalso() {
  const dados = new Map()
  return { getItem: (k) => (dados.has(k) ? dados.get(k) : null), setItem: (k, v) => dados.set(k, String(v)) }
}

test('catálogo: B3 e Pepperstone, sem símbolo repetido', () => {
  assert.deepEqual(GRUPOS_TRADINGVIEW.map((g) => g.codigo), ['B3', 'PEPPERSTONE'])
  const simbolos = GRUPOS_TRADINGVIEW.flatMap((g) => g.simbolos.map((s) => s.simbolo))
  assert.equal(new Set(simbolos).size, simbolos.length)
  assert.equal(SIMBOLO_PADRAO, 'BMFBOVESPA:CCM1!')
})

test('pares: os dois lados de cada par estão no catálogo e apontam de volta para o par', () => {
  for (const par of PARES_TRADINGVIEW) {
    assert.equal(itemDoSimbolo(par.b3.simbolo).par, par.codigo)
    assert.equal(itemDoSimbolo(par.b3.simbolo).grupo, 'B3')
    assert.equal(itemDoSimbolo(par.pepperstone.simbolo).par, par.codigo)
    assert.equal(itemDoSimbolo(par.pepperstone.simbolo).grupo, 'PEPPERSTONE')
  }
  const comPar = GRUPOS_TRADINGVIEW.flatMap((g) => g.simbolos).filter((s) => s.par)
  assert.equal(comPar.length, PARES_TRADINGVIEW.length * 2)
})

test('simboloValido: só aceita símbolo do catálogo', () => {
  assert.equal(simboloValido('PEPPERSTONE:XAUUSD'), 'PEPPERSTONE:XAUUSD')
  assert.equal(simboloValido('BMFBOVESPA:GLD1!'), SIMBOLO_PADRAO)
  assert.equal(simboloValido(undefined), SIMBOLO_PADRAO)
})

test('itemDoSimbolo: devolve o ativo e o grupo', () => {
  const brent = itemDoSimbolo('PEPPERSTONE:SPOTBRENT')
  assert.deepEqual({ ativo: brent.ativo, grupo: brent.grupo, grupoRotulo: brent.grupoRotulo }, {
    ativo: 'Brent',
    grupo: 'PEPPERSTONE',
    grupoRotulo: 'Pepperstone'
  })
  assert.equal(itemDoSimbolo('TVC:GOLD'), null)
})

test('parValido e parDoCodigo: aceita minúsculas e cai no padrão', () => {
  assert.equal(parValido('cafe'), 'CAFE')
  assert.equal(parValido('OURO'), PAR_PADRAO)
  assert.equal(parValido(undefined), PAR_PADRAO)
  assert.equal(parDoCodigo('dolar').pepperstone.simbolo, 'PEPPERSTONE:USDBRL')
})

test('rotuloComparacao: B3 compara com a bolsa americana; Pepperstone, com a B3; sem par, null', () => {
  assert.equal(rotuloComparacao(itemDoSimbolo('BMFBOVESPA:ICF1!')), 'com Nova York')
  assert.equal(rotuloComparacao(itemDoSimbolo('PEPPERSTONE:CORN')), 'com a B3')
  assert.equal(rotuloComparacao(itemDoSimbolo('BMFBOVESPA:WDO1!')), null)
  assert.equal(rotuloComparacao(itemDoSimbolo('PEPPERSTONE:XAUUSD')), null)
  assert.equal(rotuloComparacao(null), null)
})

test('linkTradingView: o símbolo codificado na URL do gráfico', () => {
  assert.equal(linkTradingView('BMFBOVESPA:CCM1!'), 'https://br.tradingview.com/chart/?symbol=BMFBOVESPA%3ACCM1!')
})

test('configuracaoWidget: diário, em português, sem troca de símbolo no widget', () => {
  const config = configuracaoWidget('BMFBOVESPA:ICF1!')
  assert.equal(config.symbol, 'BMFBOVESPA:ICF1!')
  assert.equal(config.interval, 'D')
  assert.equal(config.locale, 'br')
  assert.equal(config.allow_symbol_change, false)
  assert.equal(config.theme, 'dark')
  assert.equal(config.backgroundColor, FUNDO_ESCURO)
  assert.equal(configuracaoWidget('BMFBOVESPA:ICF1!', 'light').backgroundColor, undefined)
  assert.equal(config.hide_side_toolbar, false)
  assert.equal(config.withdateranges, true)
  assert.equal(config.details, true)
  assert.equal(config.range, '12M')
  assert.deepEqual(config.studies, ['STD;Average_True_Range'])
  assert.equal(config.compareSymbols, undefined)
  assert.equal(configuracaoWidget('BMFBOVESPA:ICF1!', 'light').theme, 'light')
  assert.equal(configuracaoWidget('NYMEX:BZ1!').symbol, SIMBOLO_PADRAO)
})

test('intervalo: ouro e Brent em 4 horas, sem janela fixa (ela trocaria o tempo gráfico); o resto no diário', () => {
  assert.equal(intervaloDoSimbolo('PEPPERSTONE:XAUUSD'), '240')
  assert.equal(intervaloDoSimbolo('PEPPERSTONE:SPOTBRENT'), '240')
  assert.equal(intervaloDoSimbolo('BMFBOVESPA:CCM1!'), 'D')
  assert.equal(intervaloDoSimbolo('PEPPERSTONE:CORN'), 'D')
  assert.equal(rotuloIntervalo('PEPPERSTONE:XAUUSD'), '4 horas')
  assert.equal(rotuloIntervalo('BMFBOVESPA:CCM1!'), 'Diário')
  const ouro = configuracaoWidget('PEPPERSTONE:XAUUSD')
  assert.equal(ouro.interval, '240')
  assert.equal(ouro.range, undefined)
})

test('sobreposto: 2º símbolo do catálogo na mesma escala, sem ATR e sem detalhes quando pedido', () => {
  const config = configuracaoWidget('BMFBOVESPA:CCM1!', 'dark', { detalhes: false, comparar: 'PEPPERSTONE:CORN' })
  assert.deepEqual(config.compareSymbols, [{ symbol: 'PEPPERSTONE:CORN', position: 'SameScale' }])
  assert.deepEqual(config.studies, [])
  assert.equal(config.details, false)
  assert.equal(configuracaoWidget('BMFBOVESPA:CCM1!', 'dark', { comparar: 'CBOT:ZC1!' }).compareSymbols, undefined)
  assert.equal(configuracaoWidget('BMFBOVESPA:CCM1!', 'dark', { comparar: 'BMFBOVESPA:CCM1!' }).compareSymbols, undefined)
})

test('tema: escuro por padrão, lembrado no armazenamento, valor estranho cai no padrão', () => {
  assert.equal(TEMA_PADRAO, 'dark')
  assert.equal(temaValido('azul'), 'dark')
  const storage = armazenamentoFalso()
  assert.equal(lerTema(storage), 'dark')
  salvarTema('light', storage)
  assert.equal(lerTema(storage), 'light')
  assert.equal(lerTema(null), 'dark')
  const quebrado = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } }
  assert.equal(lerTema(quebrado), 'dark')
  assert.doesNotThrow(() => salvarTema('light', quebrado))
})
