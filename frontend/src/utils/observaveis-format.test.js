import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatarValor, descreverPublicacao } from './observaveis-format.js'

// Intl usa NBSP em alguns ambientes - normaliza só para comparar.
const n = (texto) => texto.replace(/ /g, ' ')

test('formatarValor: sem casasDecimais mantém as 4 casas de sempre (dólar/Selic)', () => {
  assert.equal(formatarValor(5.1575), '5,1575')
  assert.equal(formatarValor(13.75), '13,7500')
})

test('formatarValor: contratos do COT são inteiros, sem ",0000"', () => {
  assert.equal(formatarValor(409899, 0), '409.899')
})

test('formatarValor: ouro com 2 casas', () => {
  assert.equal(formatarValor(4348.15, 2), '4.348,15')
})

test('formatarValor: ausência de valor vira "-", mas zero é um valor', () => {
  assert.equal(formatarValor(null), '-')
  assert.equal(formatarValor(undefined, 2), '-')
  assert.equal(formatarValor(0, 2), '0,00')
})

test('descreverPublicacao: 100% estimada, 0% (real) e mista', () => {
  assert.equal(descreverPublicacao({ totalVersoes: 5932, versoesEstimadas: 5932, percentualEstimado: 100 }), 'Estimada por regra')
  assert.equal(descreverPublicacao({ totalVersoes: 10, versoesEstimadas: 0, percentualEstimado: 0 }), 'Real (informada pela fonte)')
  assert.equal(n(descreverPublicacao({ totalVersoes: 3174, versoesEstimadas: 2526, percentualEstimado: 79.6 })), '79,6% estimada por regra')
})

test('descreverPublicacao: observável sem published_at (market_quote) ou sem dado não mostra nada', () => {
  assert.equal(descreverPublicacao(null), '-')
  assert.equal(descreverPublicacao({ totalVersoes: 0, versoesEstimadas: 0, percentualEstimado: null }), '-')
})
