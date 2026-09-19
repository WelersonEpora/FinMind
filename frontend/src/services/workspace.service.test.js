import { test } from 'node:test'
import assert from 'node:assert/strict'

import workspaceService from './workspace.service.js'

test('workspace.service: expõe as operações de espaço e de membros como funções', () => {
  for (const nome of ['listarEspacos', 'criarEspaco', 'listarMembros', 'listarCandidatos', 'adicionarMembro', 'removerMembro', 'excluirEspaco']) {
    assert.equal(typeof workspaceService[nome], 'function', nome)
  }
})
