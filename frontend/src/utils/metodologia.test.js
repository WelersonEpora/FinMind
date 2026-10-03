import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  desdeDoPeriodo,
  seriesEstoquesPetroleo,
  explicarDecisao,
  parametrosAlterados,
  seriesDesvioComFaixas,
  descreverOrigemParametros
} from './metodologia.js'

test('desdeDoPeriodo: anos para trás, e o histórico inteiro sem data', () => {
  assert.equal(desdeDoPeriodo('1A', '2026-10-02'), '2025-10-02')
  assert.equal(desdeDoPeriodo('10A', '2026-10-02'), '2016-10-02')
  assert.equal(desdeDoPeriodo('TUDO', '2026-10-02'), undefined)
  assert.equal(desdeDoPeriodo('XYZ', '2026-10-02'), undefined)
})

test('seriesEstoquesPetroleo: estoque e média, só onde há média', () => {
  const linhas = seriesEstoquesPetroleo([
    { observedAt: '2026-09-18', estoque: 10, media5Anos: null },
    { observedAt: '2026-09-25', estoque: 12, media5Anos: 11 }
  ])
  assert.deepEqual(linhas, [
    { data: '2026-09-25', valor: 12, serie: 'estoque' },
    { data: '2026-09-25', valor: 11, serie: 'media5Anos' }
  ])
})

const PARAMS = { limiarModeradoPct: 3, limiarFortePct: 10, semanasTendencia: 4, limiarTendenciaPp: 2 }

test('explicarDecisao: os passos com os números da semana e os parâmetros', () => {
  const passos = explicarDecisao(
    { desvioPct: 1.86, decisao: { direcao: 'NEUTRA', intensidade: 'FRACA', tendencia: 'ESTAVEL', mudancaDesvioPp: 0.5 } },
    PARAMS,
    'Alto'
  )
  assert.equal(passos.length, 5)
  assert.match(passos[0], /\+1,86%/)
  assert.match(passos[1], /de −3,0% a \+3,0%.*Neutra/)
  assert.match(passos[2], /menor que 3,0% → Fraca/)
  assert.match(passos[3], /era \+1,36%; mudou \+0,50 p\.p\..*Estável/)
  assert.match(passos[4], /Alto, do FEL 1/)
})

test('explicarDecisao: pressão de alta forte e afrouxando; sem decisão, nada', () => {
  const passos = explicarDecisao(
    { desvioPct: -12.52, decisao: { direcao: 'ALTA', intensidade: 'FORTE', tendencia: 'AFROUXANDO', mudancaDesvioPp: 2.66 } },
    PARAMS
  )
  assert.match(passos[1], /abaixo de −3,0%.*Pressão de alta/)
  assert.match(passos[2], /Forte/)
  assert.match(passos[3], /Afrouxando/)
  assert.equal(passos.length, 4)
  assert.deepEqual(explicarDecisao({ desvioPct: null, decisao: null }, PARAMS), [])
})

test('parametrosAlterados e seriesDesvioComFaixas', () => {
  assert.equal(parametrosAlterados({ ...PARAMS }, PARAMS), false)
  assert.equal(parametrosAlterados({ ...PARAMS, limiarModeradoPct: '5' }, PARAMS), true)
  const linhas = seriesDesvioComFaixas([{ observedAt: '2026-09-25', desvioPct: 1.86 }, { observedAt: '2026-09-18', desvioPct: null }], PARAMS)
  assert.deepEqual(linhas.map((l) => l.valor), [1.86, 10, 3, -3, -10])
})

test('descreverOrigemParametros: padrão do código ou a versão salva', () => {
  assert.equal(descreverOrigemParametros(null), 'Padrão do FinMind (nenhum ajuste salvo ainda)')
  assert.equal(
    descreverOrigemParametros({ versao: 2, alteradoPor: { nome: 'Welerson' }, alteradoEm: '2026-10-02T18:00:00Z' }),
    'Versão 2, salva por Welerson em 02/10/2026'
  )
})
