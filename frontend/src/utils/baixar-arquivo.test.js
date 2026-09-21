import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nomeArquivoExportacao } from './baixar-arquivo.js'

test('nomeArquivoExportacao junta o código e a data (UTC) da exportação', () => {
  assert.equal(nomeArquivoExportacao('USD_BRL', null, new Date('2026-09-21T23:30:00Z')), 'USD_BRL_2026-09-21.csv')
})

test('nomeArquivoExportacao inclui a métrica quando o card tem seletor', () => {
  assert.equal(nomeArquivoExportacao('WASDE_MILHO_EUA', 'PRODUCTION', new Date('2026-09-21T23:30:00Z')), 'WASDE_MILHO_EUA_PRODUCTION_2026-09-21.csv')
})
