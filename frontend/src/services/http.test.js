import { test } from 'node:test'
import assert from 'node:assert/strict'

import http from './http.js'

test('http: tem um timeout configurado (nunca fica pendurado indefinidamente)', () => {
  assert.equal(typeof http.defaults.timeout, 'number')
  assert.ok(http.defaults.timeout > 0)
})

test('http: envia credenciais (cookie de sessão) nas chamadas', () => {
  assert.equal(http.defaults.withCredentials, true)
})
