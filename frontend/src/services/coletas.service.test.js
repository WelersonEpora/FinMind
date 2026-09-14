import { test } from 'node:test'
import assert from 'node:assert/strict'

import coletasService from './coletas.service.js'

test('coletas.service: expõe listarExecucoes, getExecucaoDetalhe e executarColeta como funções', () => {
  assert.equal(typeof coletasService.listarExecucoes, 'function')
  assert.equal(typeof coletasService.getExecucaoDetalhe, 'function')
  assert.equal(typeof coletasService.executarColeta, 'function')
})
