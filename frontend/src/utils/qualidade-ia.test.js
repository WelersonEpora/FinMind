import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compararComBenchmark,
  desdeDoPeriodo,
  filtrarLinhas,
  formatarDistancia,
  formatarPct,
  formatarVariacao,
  motivosPresentes,
  rotuloMotivo
} from './qualidade-ia.js'

test('distância média com duas casas; sem valor, um traço', () => {
  assert.equal(formatarDistancia(0.5), '0,50')
  assert.equal(formatarDistancia(null), '—')
})

test('contra o melhor benchmark: p.p. no acerto, faixas na distância (menor é melhor), sem cor', () => {
  assert.deepEqual(compararComBenchmark(50), { texto: '+50,0 p.p.', sentido: 'melhor' })
  assert.deepEqual(compararComBenchmark(-12.5), { texto: '−12,5 p.p.', sentido: 'pior' })
  assert.deepEqual(compararComBenchmark(0), { texto: '0,0 p.p.', sentido: 'igual' })
  assert.deepEqual(compararComBenchmark(-0.5, { menorEhMelhor: true }), { texto: '−0,50', sentido: 'melhor' })
  assert.deepEqual(compararComBenchmark(0.25, { menorEhMelhor: true }), { texto: '+0,25', sentido: 'pior' })
  assert.equal(compararComBenchmark(null), null)
})

test('motivos de ficar fora, na ordem da verificação, só os presentes', () => {
  assert.deepEqual(
    motivosPresentes({ INSUFICIENTE: 1, A_APURAR: 3, SEM_PRECO: 0 }).map((m) => [m.codigo, m.quantidade]),
    [['A_APURAR', 3], ['INSUFICIENTE', 1]]
  )
  assert.equal(rotuloMotivo(null), 'Na métrica')
  assert.equal(rotuloMotivo('SEM_PREGAO_NA_DATA'), 'Sem pregão na data da análise')
})

test('linhas por horizonte e só as avaliadas', () => {
  const linhas = [
    { horizonte: 'IMEDIATO', motivoFora: null },
    { horizonte: 'IMEDIATO', motivoFora: 'A_APURAR' },
    { horizonte: 'CURTO', motivoFora: null }
  ]
  assert.equal(filtrarLinhas(linhas).length, 3)
  assert.equal(filtrarLinhas(linhas, { horizonte: 'IMEDIATO' }).length, 2)
  assert.equal(filtrarLinhas(linhas, { horizonte: 'IMEDIATO', somenteAvaliadas: true }).length, 1)
})

test('variação com sinal; período em dias a partir de hoje', () => {
  assert.equal(formatarPct(66.666), '66,7%')
  assert.equal(formatarPct(null), '')
  assert.equal(formatarVariacao(5.882), '+5,9%')
  assert.equal(formatarVariacao(-1.25), '−1,3%')
  assert.equal(formatarVariacao(null), '—')
  assert.equal(desdeDoPeriodo(30, new Date(2026, 9, 5)), '2026-09-06')
  assert.equal(desdeDoPeriodo(null), null)
})
