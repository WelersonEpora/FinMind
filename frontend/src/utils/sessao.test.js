import { test } from 'node:test'
import assert from 'node:assert/strict'

import { verificarSessao, ehNaoAutenticado } from './sessao.js'

const erroHttp = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })
const erroTimeout = () => Object.assign(new Error('timeout of 20000ms exceeded'), { code: 'ECONNABORTED' })

// Devolve, em ordem, cada resultado (valor ou erro a lançar); registra quantas vezes foi chamado e as esperas.
function roteiro(...passos) {
  const chamadas = { buscar: 0, esperas: [] }
  const buscar = async () => {
    const passo = passos[chamadas.buscar]
    chamadas.buscar += 1
    if (passo instanceof Error) throw passo
    return passo
  }
  const esperar = async (ms) => {
    chamadas.esperas.push(ms)
  }
  return { buscar, esperar, chamadas }
}

const usuario = { id: 'u1', role: 'admin' }

test('verificarSessao: servidor respondeu, usuário autenticado na 1ª tentativa, sem espera', async () => {
  const { buscar, esperar, chamadas } = roteiro(usuario)
  assert.deepEqual(await verificarSessao(buscar, { esperar }), { status: 'autenticado', user: usuario })
  assert.equal(chamadas.buscar, 1)
  assert.deepEqual(chamadas.esperas, [])
})

test('verificarSessao: 401 é "não autenticado" na hora, sem tentar de novo', async () => {
  const { buscar, esperar, chamadas } = roteiro(erroHttp(401))
  assert.deepEqual(await verificarSessao(buscar, { esperar }), { status: 'nao-autenticado' })
  assert.equal(chamadas.buscar, 1)
})

test('verificarSessao: timeout, 502 e 500 NÃO deslogam; tenta de novo e recupera quando o servidor volta', async () => {
  const { buscar, esperar, chamadas } = roteiro(erroTimeout(), erroHttp(502), erroHttp(500), usuario)
  assert.deepEqual(await verificarSessao(buscar, { esperar }), { status: 'autenticado', user: usuario })
  assert.equal(chamadas.buscar, 4)
  assert.deepEqual(chamadas.esperas, [1000, 3000, 5000])
})

test('verificarSessao: servidor fora em todas as tentativas vira "indisponivel", com o último erro', async () => {
  const ultimo = erroHttp(503)
  const { buscar, esperar, chamadas } = roteiro(erroHttp(502), erroTimeout(), erroHttp(500), ultimo)
  const resultado = await verificarSessao(buscar, { esperar })
  assert.equal(resultado.status, 'indisponivel')
  assert.equal(resultado.erro, ultimo)
  assert.equal(chamadas.buscar, 4)
})

test('verificarSessao: 401 depois de uma falha temporária ainda é "não autenticado"', async () => {
  const { buscar, esperar } = roteiro(erroHttp(502), erroHttp(401))
  assert.deepEqual(await verificarSessao(buscar, { esperar }), { status: 'nao-autenticado' })
})

test('ehNaoAutenticado: só o status 401', () => {
  assert.equal(ehNaoAutenticado(erroHttp(401)), true)
  assert.equal(ehNaoAutenticado(erroHttp(403)), false)
  assert.equal(ehNaoAutenticado(erroHttp(500)), false)
  assert.equal(ehNaoAutenticado(erroTimeout()), false)
  assert.equal(ehNaoAutenticado(null), false)
})
