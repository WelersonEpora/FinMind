import { test } from 'node:test'
import assert from 'node:assert/strict'

import observaveisService from './observaveis.service.js'

test('observaveis.service: expõe listarObservaveis, getObservavelDetalhe e getObservavelHistorico como funções', () => {
  assert.equal(typeof observaveisService.listarObservaveis, 'function')
  assert.equal(typeof observaveisService.getObservavelDetalhe, 'function')
  assert.equal(typeof observaveisService.getObservavelHistorico, 'function')
})
