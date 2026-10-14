import { test } from 'node:test'
import assert from 'node:assert/strict'

import { escolherEspacoAtivo, legendaDoEspaco, rotuloPapel } from './workspace.js'

const pessoal = { id: 'w1', nome: 'Espaço pessoal', pessoal: true, papel: 'owner' }
const familia = { id: 'w2', nome: 'Família Souza', pessoal: false, papel: 'editor' }
const cliente = { id: 'w3', nome: 'Cliente A', pessoal: false, papel: 'viewer' }
const espacos = [pessoal, familia, cliente]

test('escolherEspacoAtivo: lista vazia não tem espaço ativo', () => {
  assert.equal(escolherEspacoAtivo([], { rotaId: 'w1', salvoId: 'w1' }), null)
})

test('escolherEspacoAtivo: sem rota nem salvo, usa o espaço pessoal', () => {
  assert.equal(escolherEspacoAtivo([familia, pessoal]), 'w1')
})

test('escolherEspacoAtivo: o último usado vence o pessoal', () => {
  assert.equal(escolherEspacoAtivo(espacos, { salvoId: 'w2' }), 'w2')
})

test('escolherEspacoAtivo: a rota vence o último usado', () => {
  assert.equal(escolherEspacoAtivo(espacos, { rotaId: 'w3', salvoId: 'w2' }), 'w3')
})

test('escolherEspacoAtivo: id salvo que não é do usuário é ignorado', () => {
  assert.equal(escolherEspacoAtivo(espacos, { salvoId: 'espaco-de-outro-usuario' }), 'w1')
})

test('escolherEspacoAtivo: id de rota que não é do usuário é ignorado', () => {
  assert.equal(escolherEspacoAtivo(espacos, { rotaId: 'espaco-de-outro-usuario', salvoId: 'w2' }), 'w2')
})

test('escolherEspacoAtivo: sem espaço pessoal, cai no primeiro da lista', () => {
  assert.equal(escolherEspacoAtivo([familia, cliente]), 'w2')
})

test('rotuloPapel: traduz os papéis do espaço e preserva um desconhecido', () => {
  assert.equal(rotuloPapel('owner'), 'Proprietário')
  assert.equal(rotuloPapel('editor'), 'Editor')
  assert.equal(rotuloPapel('viewer'), 'Leitor')
  assert.equal(rotuloPapel('outro'), 'outro')
})

test('legendaDoEspaco: tipo + papel do usuário no espaço', () => {
  assert.equal(legendaDoEspaco(pessoal), 'Pessoal · Proprietário')
  assert.equal(legendaDoEspaco(familia), 'Compartilhado · Editor')
  assert.equal(legendaDoEspaco(cliente), 'Compartilhado · Leitor')
})
