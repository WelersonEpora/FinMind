import { test } from 'node:test'
import assert from 'node:assert/strict'
import { periodoPadrao, formatarPct, rotuloCaptura, rotuloRelevante, situacaoDaMeta } from './captura-eventos.js'

const CRITERIO = { metaPct: 80, periodoDias: 30 }

test('periodoPadrao: os 30 dias que terminam ontem', () => {
  assert.deepEqual(periodoPadrao('2026-10-23'), { dataInicio: '2026-09-23', dataFim: '2026-10-22' })
})

test('rótulos da avaliação: a captura só existe no relevante', () => {
  assert.equal(rotuloRelevante(null), 'A avaliar')
  assert.equal(rotuloRelevante(false), 'Não relevante')
  assert.equal(rotuloCaptura({ relevante: false, captura: null }), '—')
  assert.equal(rotuloCaptura({ relevante: true, captura: null }), 'A conferir')
  assert.equal(rotuloCaptura({ relevante: true, captura: 'NAO_CAPTURADO' }), 'Não capturado')
  assert.equal(formatarPct(66.6667), '66,7%')
  assert.equal(formatarPct(null), '—')
})

test('situacaoDaMeta: provisório enquanto falta avaliar ou o período não tem 30 dias', () => {
  const completo = { pctCaptura: 85, atingeMeta: true, completo: true, periodoDoCriterio: true, diasDoPeriodo: 30 }
  assert.deepEqual(situacaoDaMeta(completo, CRITERIO), { classe: 'atinge', texto: 'Atinge a meta de 80%.' })
  assert.equal(situacaoDaMeta({ ...completo, pctCaptura: 60, atingeMeta: false }, CRITERIO).classe, 'abaixo')
  const parcial = situacaoDaMeta({ ...completo, completo: false, periodoDoCriterio: false, diasDoPeriodo: 22 }, CRITERIO)
  assert.equal(parcial.classe, 'parcial')
  assert.equal(parcial.texto, 'Atinge a meta de 80%, ainda provisório: há eventos a avaliar ou a conferir e o período tem 22 dias, não 30.')
  assert.equal(situacaoDaMeta({ pctCaptura: null }, CRITERIO).classe, 'neutra')
})
