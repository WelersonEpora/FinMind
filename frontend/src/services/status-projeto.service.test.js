import { test } from 'node:test'
import assert from 'node:assert/strict'

import statusProjetoService from './status-projeto.service.js'

test('status-projeto.service: expõe getStatusProjeto como função', () => {
  assert.equal(typeof statusProjetoService.getStatusProjeto, 'function')
})
