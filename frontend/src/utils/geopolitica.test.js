import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nivel, pressao, rotuloAtivo, rotuloGrau, formatarData, rotuloFonte, rotuloTipo, TIPOS, ATIVOS } from './geopolitica.js'

test('nível: rótulo e classe de cada um da escala; código desconhecido aparece como veio', () => {
  assert.deepEqual(nivel('ATENCAO'), { rotulo: 'Atenção', classe: 'atencao' })
  assert.deepEqual(nivel('EXCEPCIONAL'), { rotulo: 'Excepcional', classe: 'excepcional' })
  assert.deepEqual(nivel('OUTRO'), { rotulo: 'OUTRO', classe: 'desconhecido' })
  assert.equal(nivel(null).rotulo, '—')
})

test('ativo e grau', () => {
  assert.equal(rotuloAtivo('PETROLEO'), 'Petróleo')
  assert.equal(rotuloAtivo('CAFE'), 'Café')
  assert.deepEqual(Object.keys(ATIVOS), ['OURO', 'PETROLEO', 'MILHO', 'CAFE', 'SOJA'])
  assert.equal(rotuloGrau('MEDIA'), 'Média')
  assert.equal(rotuloGrau(null), '—')
})

test('formatarData: dia/mês/ano sem passar pelo fuso', () => {
  assert.equal(formatarData('2026-10-01'), '01/10/2026')
  assert.equal(formatarData(null), '—')
})

test('rotuloFonte: o nome; sem nome, o domínio', () => {
  assert.equal(rotuloFonte({ nome: 'Reuters', url: 'https://www.reuters.com/x' }), 'Reuters')
  assert.equal(rotuloFonte({ nome: null, url: 'https://www.opec.org/pr.html' }), 'opec.org')
  assert.equal(rotuloFonte({ nome: null, url: 'sem-url' }), 'sem-url')
})

test('pressão: seta e rótulo; sem o dado (prompt v1), null', () => {
  assert.deepEqual(pressao('ALTA'), { rotulo: 'Alta', icone: 'bi-arrow-up', classe: 'alta' })
  assert.equal(pressao('AMBIGUA').rotulo, 'Ambígua')
  assert.equal(pressao(null), null)
})

test('tipo: os 7 tipos do ADR 0049; código desconhecido', () => {
  assert.equal(rotuloTipo('POLITICA_OFERTA'), 'Política de oferta')
  assert.equal(rotuloTipo('ROTA_MARITIMA'), '—')
  assert.equal(rotuloTipo(null), '—')
  assert.equal(Object.keys(TIPOS).length, 7)
})
