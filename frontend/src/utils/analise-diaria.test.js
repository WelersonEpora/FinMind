import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contarEventos, etiquetaLeitura, realizadoDoHorizonte, faltaNoFator, idadeDoDado, rotuloMedida, intervaloDaFaixa, leituraDoFator, leituraDoMotor, nivelConfianca, rotuloConfianca, rotuloDias, rotuloFaixa, rotuloPapelCot, tendencia } from './analise-diaria.js'

test('faixa em % a partir de T1 e T2 do horizonte, com as bordas da classificação', () => {
  const medio = { t1: 5, t2: 12 }
  assert.equal(intervaloDaFaixa('ALTA_FORTE', medio), '≥ +12%')
  assert.equal(intervaloDaFaixa('ALTA_LEVE', medio), '+5% a +12%')
  assert.equal(intervaloDaFaixa('LATERAL', medio), 'entre −5% e +5%')
  assert.equal(intervaloDaFaixa('BAIXA_LEVE', medio), '−5% a −12%')
  assert.equal(intervaloDaFaixa('BAIXA_FORTE', medio), '≤ −12%')
  assert.equal(intervaloDaFaixa('ALTA_LEVE', { t1: 1, t2: 2.5 }), '+1% a +2,5%')
})

test('sem limites ou sem faixa (INSUFICIENTE), não inventa intervalo', () => {
  assert.equal(intervaloDaFaixa('ALTA_LEVE', { t1: null, t2: null }), null)
  assert.equal(intervaloDaFaixa(null, { t1: 1, t2: 2.5 }), null)
})

test('rótulos das escalas; código desconhecido aparece como veio', () => {
  assert.equal(tendencia('ALTA').rotulo, 'Alta')
  assert.equal(tendencia('INSUFICIENTE').classe, 'insuficiente')
  assert.equal(tendencia('OUTRA').rotulo, 'OUTRA')
  assert.equal(rotuloFaixa('BAIXA_LEVE'), 'Baixa leve')
  assert.equal(rotuloConfianca('MEDIA'), 'Confiança média')
  assert.equal(rotuloPapelCot('RISCO_DE_REVERSAO'), 'Risco de reversão')
  assert.equal(rotuloDias(1), '1 dia')
  assert.equal(rotuloDias(90), '90 dias')
})

test('chip da confiança: baixa, média e alta com classes próprias; sem confiança, neutro', () => {
  assert.deepEqual(nivelConfianca('ALTA'), { rotulo: 'Confiança alta', classe: 'alta' })
  assert.deepEqual(nivelConfianca('MEDIA'), { rotulo: 'Confiança média', classe: 'media' })
  assert.deepEqual(nivelConfianca('BAIXA'), { rotulo: 'Confiança baixa', classe: 'baixa' })
  assert.deepEqual(nivelConfianca(null), { rotulo: 'Sem confiança', classe: 'nenhuma' })
})

test('etiqueta do card: tendência com a intensidade; forte é destacada; lateral e insuficiente sem intensidade', () => {
  assert.deepEqual(
    [etiquetaLeitura('ALTA', 'ALTA_FORTE'), etiquetaLeitura('BAIXA', 'BAIXA_LEVE')].map((e) => [e.rotulo, e.classe, e.forte]),
    [
      ['Alta forte', 'alta', true],
      ['Baixa leve', 'baixa', false]
    ]
  )
  assert.deepEqual([etiquetaLeitura('LATERAL', 'LATERAL').rotulo, etiquetaLeitura('LATERAL', 'LATERAL').forte], ['Lateral', false])
  assert.deepEqual([etiquetaLeitura('INSUFICIENTE', null).rotulo, etiquetaLeitura('INSUFICIENTE', null).forte], ['Insuficiente', false])
})

test('leitura de um fator: pressão com intensidade e tendência; neutra sem intensidade; sem leitura, null', () => {
  assert.deepEqual(leituraDoFator({ pressao: 'BAIXA', intensidade: 'MODERADA', tendencia: 'SUBINDO' }), {
    rotulo: 'Pressão de baixa',
    icone: 'bi-arrow-down',
    classe: 'baixa',
    texto: 'Pressão de baixa, moderada',
    tendencia: 'subindo'
  })
  assert.equal(leituraDoFator({ pressao: 'NEUTRA', intensidade: 'FRACA', tendencia: 'ESTAVEL' }).texto, 'Neutra')
  assert.equal(leituraDoFator(null), null)
  assert.equal(faltaNoFator('SEM_DADO'), 'Sem dado')
  assert.equal(faltaNoFator('ESTIMADO'), null)
})

test('textos da tabela de evidências: medida sem a camada, idade do dado e contagem de eventos', () => {
  assert.equal(rotuloMedida('Desvio (B)'), 'Desvio')
  assert.equal(rotuloMedida('Crescimento anual (B)'), 'Crescimento anual')
  assert.equal(rotuloMedida('Posição relativa'), 'Posição relativa')
  assert.equal(idadeDoDado(0), 'hoje')
  assert.equal(idadeDoDado(1), 'há 1 dia')
  assert.equal(idadeDoDado(94), 'há 94 dias')
  assert.equal(idadeDoDado(null), null)
  assert.equal(contarEventos(0), 'Nenhum evento')
  assert.equal(contarEventos(1), '1 evento')
  assert.equal(contarEventos(2), '2 eventos')
})

test('fator de contexto (ADR 0054): sem pressão, o chip diz Contexto, com a tendência', () => {
  const leitura = leituraDoFator({ papel: 'CONTEXTO', contextoDe: 'OURO_JUROS_REAIS', tendencia: 'CAINDO' })
  assert.equal(leitura.texto, 'Contexto')
  assert.equal(leitura.classe, 'lateral')
  assert.equal(leitura.tendencia, 'caindo')
})

test('realizado de um horizonte: variação e faixa quando apurado; nas outras situações, só a nota', () => {
  const fmt = (d) => (d ? d.split('-').reverse().join('/') : '—')
  assert.deepEqual(
    realizadoDoHorizonte({ situacao: 'APURADO', dataAlvo: '2026-09-02', dataPreco: '2026-09-02', variacaoPct: -1.54, faixa: 'BAIXA_LEVE' }, fmt),
    { apurado: true, variacao: '−1,5%', faixa: 'Baixa leve', classe: 'baixa', nota: 'preço de 02/09/2026' }
  )
  assert.equal(realizadoDoHorizonte({ situacao: 'APURADO', dataPreco: '2026-09-02', variacaoPct: 0.3, faixa: 'LATERAL' }, fmt).variacao, '+0,3%')
  assert.deepEqual(realizadoDoHorizonte({ situacao: 'A_APURAR', dataAlvo: '2026-12-01' }, fmt), { apurado: false, nota: 'apura em 01/12/2026' })
  assert.equal(realizadoDoHorizonte({ situacao: 'SEM_PREGAO', dataAlvo: '2026-09-06' }, fmt).nota, 'sem pregão novo até 06/09/2026')
  assert.equal(realizadoDoHorizonte({ situacao: 'SEM_BASE', dataAlvo: null }, fmt).nota, 'sem preço-base na leitura')
  assert.equal(realizadoDoHorizonte(undefined, fmt), null)
})

test('leituraDoMotor: a leitura agregada de um horizonte, se diverge da IA e o que a formou', () => {
  const agregacao = {
    versao: 'cafe-agregacao-v1 (2026-10-05)',
    horizontes: [
      {
        horizonte: 'CURTO',
        tendencia: 'BAIXA',
        faixa: 'BAIXA_LEVE',
        confianca: 'BAIXA',
        score: -1.2,
        cobertura: 1,
        conflito: null,
        fundos: 'RISCO_DE_REVERSAO',
        motivosConfianca: ['F7 (fundos) em extremo contra a direção: risco de reversão'],
        familias: [
          { codigo: 'OFERTA', ativa: true, pesoEfetivo: 0.6, score: -2, ausente: false, contribuicao: -1.2 },
          { codigo: 'CAMBIO', ativa: true, pesoEfetivo: 0.4, score: 0, ausente: true, contribuicao: 0 }
        ]
      }
    ]
  }
  const m = leituraDoMotor(agregacao, 'CURTO', { tendencia: 'ALTA' })
  assert.equal(m.etiqueta.classe, 'baixa')
  assert.equal(m.score, '−1,20')
  assert.equal(m.cobertura, '100%')
  assert.equal(m.diverge, true)
  assert.deepEqual(m.familias, [
    { rotulo: 'Oferta', texto: '60% × −2,00 = −1,20' },
    { rotulo: 'Câmbio', texto: '40%, sem dado' }
  ])
  assert.equal(leituraDoMotor(agregacao, 'CURTO', { tendencia: 'BAIXA' }).diverge, false)
  assert.equal(leituraDoMotor(agregacao, 'LONGO'), null)
  assert.equal(leituraDoMotor(null, 'CURTO'), null)
})
