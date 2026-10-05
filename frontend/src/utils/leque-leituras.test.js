import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoDaBarra, faixaDesenhada, foraDaMetrica, janelaDoGrafico, linhasDoGrafico, marcasDoEixo, montarLeque, segmentosDoPreco } from './leque-leituras.js'

const HORIZONTES = [
  { horizonte: 'IMEDIATO', dias: 1 },
  { horizonte: 'CURTO', dias: 7 }
]

// Uma linha como GET /api/v1/qualidade-ia a devolve (só o que o gráfico usa).
function linha(over = {}) {
  return {
    dataAnalise: '2026-09-01',
    horizonte: 'CURTO',
    dataAlvo: '2026-09-08',
    t1: 1,
    t2: 3,
    seriesCode: 'B3.CCM.CCMU26.SETTLE',
    referenciaHorizontes: 'DATA_DA_ANALISE',
    precoRecebido: { valor: 99, data: '2026-08-31' },
    base: { valor: 100, data: '2026-09-01', confirmada: true },
    lida: { tendencia: 'ALTA', faixa: 'ALTA_LEVE', confianca: 'MEDIA' },
    realizado: { situacao: 'APURADO', preco: 102, faixa: 'ALTA_LEVE' },
    persistencia: { variacaoPct: -0.5, faixa: 'LATERAL' },
    motivoFora: null,
    ...over
  }
}

test('a faixa desenhada: as FORTE com a altura de uma leve e a seta na ponta aberta', () => {
  const r = { t1: 1, t2: 3 }
  assert.deepEqual(faixaDesenhada('LATERAL', r), { de: -1, ate: 1, seta: null })
  assert.deepEqual(faixaDesenhada('ALTA_LEVE', r), { de: 1, ate: 3, seta: null })
  assert.deepEqual(faixaDesenhada('ALTA_FORTE', r), { de: 3, ate: 5, seta: 'cima' })
  assert.deepEqual(faixaDesenhada('BAIXA_FORTE', r), { de: -5, ate: -3, seta: 'baixo' })
  assert.equal(faixaDesenhada(null, r), null)
})

test('o estado da barra: dentro, fora com a distância, pendente ou sem resultado', () => {
  assert.deepEqual(estadoDaBarra(linha()), { estado: 'dentro', distancia: 0 })
  assert.deepEqual(estadoDaBarra(linha({ realizado: { situacao: 'APURADO', preco: 95, faixa: 'BAIXA_FORTE' } })), { estado: 'fora', distancia: 3 })
  assert.deepEqual(estadoDaBarra(linha({ realizado: { situacao: 'AGUARDANDO_DADO' } })), { estado: 'pendente', distancia: null })
  assert.deepEqual(estadoDaBarra(linha({ realizado: { situacao: 'SEM_PRECO' } })), { estado: 'sem-resultado', distancia: null })
})

test('as leituras desenhadas: todas com faixa (as fora da métrica marcadas), menos as INSUFICIENTE', () => {
  const linhas = [
    linha(),
    linha({ dataAnalise: '2026-09-06' }), // domingo
    linha({ lida: { tendencia: 'INSUFICIENTE', faixa: null } }),
    linha({ referenciaHorizontes: 'DATA_DO_ULTIMO_PRECO' }),
    linha({ motivoFora: 'SEM_PREGAO_NA_DATA' }),
    linha({ horizonte: 'IMEDIATO', dataAlvo: '2026-09-02' })
  ]
  assert.equal(linhasDoGrafico(linhas, { modo: 'quatro' }).length, 5)
  assert.equal(linhasDoGrafico(linhas, { modo: 'um', horizonte: 'IMEDIATO' }).length, 1)
  assert.deepEqual(linhasDoGrafico(linhas, { modo: 'quatro' }).map(foraDaMetrica), [null, 'SEM_PREGAO_NA_DATA', 'REFERENCIA_ANTIGA', 'SEM_PREGAO_NA_DATA', null])
  assert.equal(foraDaMetrica(linha({ motivoFora: 'SEM_BENCHMARK' })), 'SEM_BENCHMARK')
  // Esperar o preço não esmaece: é só o tempo.
  assert.equal(foraDaMetrica(linha({ motivoFora: 'A_APURAR' })), null)
})

test('a janela: 180 dias com hoje no meio, a mesma em qualquer visão e horizonte', () => {
  assert.deepEqual(janelaDoGrafico({ hoje: '2026-10-05' }), { ini: '2026-07-07', fim: '2027-01-03' })
})

test('a linha do preço: o contrato que as leituras de cada dia usavam, partida na troca de contrato', () => {
  const precos = [
    { seriesCode: 'A', pontos: [{ data: '2026-09-01', valor: 10 }, { data: '2026-09-02', valor: 11 }, { data: '2026-09-03', valor: 12 }] },
    { seriesCode: 'B', pontos: [{ data: '2026-09-02', valor: 20 }, { data: '2026-09-03', valor: 21 }] }
  ]
  const linhas = [linha({ dataAnalise: '2026-09-01', seriesCode: 'A' }), linha({ dataAnalise: '2026-09-03', seriesCode: 'B' })]
  assert.deepEqual(segmentosDoPreco(precos, linhas, { ini: '2026-09-01', fim: '2026-09-03' }), [
    [{ data: '2026-09-01', valor: 10 }, { data: '2026-09-02', valor: 11 }],
    [{ data: '2026-09-03', valor: 21 }]
  ])
})

test('montarLeque: as barras em preço a partir da base da avaliação, o marcador e a escala pelo preço', () => {
  const precos = [{ seriesCode: 'B3.CCM.CCMU26.SETTLE', pontos: [{ data: '2026-09-01', valor: 100 }, { data: '2026-09-08', valor: 102 }] }]
  const quatro = montarLeque({ linhas: [linha()], precos, horizontes: HORIZONTES, modo: 'quatro', hoje: '2026-09-20' })
  assert.equal(quatro.barras.length, 1)
  const barra = quatro.barras[0]
  assert.deepEqual([barra.indice, barra.estado, barra.seta], [1, 'dentro', null])
  assert.ok(Math.abs(barra.precoDe - 101) < 1e-9 && Math.abs(barra.precoAte - 103) < 1e-9)
  assert.equal(quatro.marcadores.length, 0)
  // A escala sai do preço da janela (100 a 102), com 6% de folga.
  assert.ok(Math.abs(quatro.escala.min - 94) < 1e-9 && Math.abs(quatro.escala.max - 108.12) < 1e-9)

  const um = montarLeque({ linhas: [linha()], precos, horizontes: HORIZONTES, modo: 'um', horizonte: 'CURTO', persistencia: true, hoje: '2026-09-20' })
  assert.deepEqual(um.marcadores, [{ data: '2026-09-08', valor: 102, distancia: 0, foraDaMetrica: null }])
  assert.equal(um.persistencias.length, 1)
  assert.ok(Math.abs(um.persistencias[0].precoDe - 99) < 1e-9)
})

test('marcas do eixo: um passo redondo, no máximo 7', () => {
  assert.deepEqual(marcasDoEixo({ min: 94, max: 108.12 }), [95, 97.5, 100, 102.5, 105, 107.5])
})
