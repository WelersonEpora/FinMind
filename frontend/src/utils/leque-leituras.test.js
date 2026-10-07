import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoDaBarra, faixaDesenhada, foraDaMetrica, janelaDoGrafico, linhasDoGrafico, marcasDoEixo, montarLeque, segmentosDoContexto, segmentosDoPreco } from './leque-leituras.js'

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

test('montarLeque: as barras em preço a partir da base da avaliação, o marcador e a escala pelo preço e pelas faixas', () => {
  const precos = [{ seriesCode: 'B3.CCM.CCMU26.SETTLE', pontos: [{ data: '2026-09-01', valor: 100 }, { data: '2026-09-08', valor: 102 }] }]
  const quatro = montarLeque({ linhas: [linha()], precos, horizontes: HORIZONTES, modo: 'quatro', hoje: '2026-09-20' })
  assert.equal(quatro.barras.length, 1)
  const barra = quatro.barras[0]
  assert.deepEqual([barra.indice, barra.estado, barra.seta], [1, 'dentro', null])
  assert.ok(Math.abs(barra.precoDe - 101) < 1e-9 && Math.abs(barra.precoAte - 103) < 1e-9)
  assert.equal(quatro.marcadores.length, 0)
  // A escala cobre o preço da janela (100 a 102) e a faixa inteira (101 a 103), com 6% de folga: a faixa não é cortada.
  assert.ok(Math.abs(quatro.escala.min - 94) < 1e-9 && Math.abs(quatro.escala.max - 103 * 1.06) < 1e-9)

  const um = montarLeque({ linhas: [linha()], precos, horizontes: HORIZONTES, modo: 'um', horizonte: 'CURTO', persistencia: true, hoje: '2026-09-20' })
  assert.deepEqual(um.marcadores, [{ data: '2026-09-08', valor: 102, distancia: 0, foraDaMetrica: null }])
  assert.equal(um.persistencias.length, 1)
  assert.ok(Math.abs(um.persistencias[0].precoDe - 99) < 1e-9)
})

test('marcas do eixo: um passo redondo, no máximo 7', () => {
  assert.deepEqual(marcasDoEixo({ min: 94, max: 108.12 }), [95, 97.5, 100, 102.5, 105, 107.5])
})

test('contexto (o Brent à vista no petróleo): linha à parte, sem os dias em que o preço já é essa série; entra na escala', () => {
  const contexto = {
    seriesCode: 'EIA.BRENT',
    nome: 'Brent à vista (EIA)',
    pontos: [
      { data: '2026-09-01', valor: 120 },
      { data: '2026-09-02', valor: 121 },
      { data: '2026-09-03', valor: 119 },
      { data: '2026-09-04', valor: 118 }
    ]
  }
  // A leitura de 02/09 usou a própria EIA (configuração antiga); a de 03/09, o futuro.
  const linhas = [linha({ dataAnalise: '2026-09-02', seriesCode: 'EIA.BRENT' }), linha({ dataAnalise: '2026-09-03', seriesCode: 'YAHOO.BZ.BZZ26.SETTLE' })]
  // Antes da 1ª leitura, vale a série dela (a EIA): 01 e 02/09 somem; 03 e 04/09 ficam.
  assert.deepEqual(segmentosDoContexto(contexto, linhas, { ini: '2026-09-01', fim: '2026-09-04' }), [
    [
      { data: '2026-09-03', valor: 119 },
      { data: '2026-09-04', valor: 118 }
    ]
  ])
  assert.deepEqual(segmentosDoContexto(null, linhas, { ini: '2026-09-01', fim: '2026-09-04' }), [])

  const futuro = [linha({ dataAnalise: '2026-09-01', seriesCode: 'YAHOO.BZ.BZZ26.SETTLE' })]
  const precos = [{ seriesCode: 'YAHOO.BZ.BZZ26.SETTLE', pontos: [{ data: '2026-09-01', valor: 100 }] }]
  const leque = montarLeque({ linhas: futuro, precos, horizontes: HORIZONTES, modo: 'quatro', hoje: '2026-09-20', contexto })
  assert.equal(leque.contexto.nome, 'Brent à vista (EIA)')
  assert.equal(leque.contexto.segmentos[0].length, 4)
  assert.ok(leque.escala.max > 121, 'a escala cobre a linha de contexto')
  assert.equal(montarLeque({ linhas: futuro, precos, horizontes: HORIZONTES, modo: 'quatro', hoje: '2026-09-20' }).contexto, null)
})

test('contrato por horizonte: a linha é o contrato mais próximo nos quatro horizontes e o do horizonte na visão de um', () => {
  // Leitura de 07/10 do petróleo: BZZ26 no curto, BZH27 no longo (o último da leitura).
  const linhas = [
    linha({ dataAnalise: '2026-10-07', horizonte: 'CURTO', dataAlvo: '2026-10-14', seriesCode: 'YAHOO.BZ.BZZ26.SETTLE' }),
    linha({ dataAnalise: '2026-10-07', horizonte: 'LONGO', dataAlvo: '2027-01-05', seriesCode: 'YAHOO.BZ.BZH27.SETTLE' })
  ]
  const precos = [
    { seriesCode: 'YAHOO.BZ.BZZ26.SETTLE', pontos: [{ data: '2026-10-06', valor: 100.58 }] },
    { seriesCode: 'YAHOO.BZ.BZH27.SETTLE', pontos: [{ data: '2026-10-06', valor: 93.25 }] }
  ]
  const horizontes = [
    { horizonte: 'CURTO', dias: 7 },
    { horizonte: 'LONGO', dias: 90 }
  ]
  const ultimo = (leque) => leque.segmentos.at(-1).at(-1).valor
  assert.equal(ultimo(montarLeque({ linhas, precos, horizontes, modo: 'quatro', hoje: '2026-10-07' })), 100.58)
  assert.equal(ultimo(montarLeque({ linhas, precos, horizontes, modo: 'um', horizonte: 'LONGO', hoje: '2026-10-07' })), 93.25)
  assert.equal(ultimo(montarLeque({ linhas, precos, horizontes, modo: 'um', horizonte: 'CURTO', hoje: '2026-10-07' })), 100.58)
})
