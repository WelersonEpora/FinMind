import { test } from 'node:test'
import assert from 'node:assert/strict'

import authService from './auth.service.js'

test('auth.service: expõe login, logout e me como funções', () => {
  assert.equal(typeof authService.login, 'function')
  assert.equal(typeof authService.logout, 'function')
  assert.equal(typeof authService.me, 'function')
})
