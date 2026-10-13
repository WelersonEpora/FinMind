import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consistencia, corDaAcao, doFormulario, formatarParametro, formatarR, formatarRetorno, nomeTrilha, paraFormulario, pontosDoPatrimonio, rotulo, CAMPOS_ATIVO } from './carteiras.js'

const PARAMETROS = {
  modelo: 'cartilha-1.0',
  conta: 'B3',
  ativos: { MILHO: { riscoPct: 2, pisoAtr: 1.5, alvo1R: 1, alvo2R: 3, rrMinimo: 2, slippageTicks: 2, custoPorContrato: null } },
  carteira: { maxPosicoes: 2, perdaDiariaPct: 4, perdaSemanalPct: 8, drawdownMaxPct: 10, perdasSeguidas: 3, pausaPregoes: 5, saidaAlvo1Pct: 50, fracaoReduzirPct: 50, fatorOvernight: 1 },
  execucao: { quantidade: 'FRACIONARIA', periodoAtr: 14, diasUteisMinimosAteOLimite: 30, diasUteisEncerrarAntesDoLimite: 15, liquidezMinima: 100, registroTardioDiasUteis: 5 }
}

test('o formulário dos parâmetros vai e volta igual; vírgula decimal; custo vazio é pendente', () => {
  const form = paraFormulario(PARAMETROS)
  assert.equal(form.ativos.MILHO.pisoAtr, '1,5')
  assert.equal(form.ativos.MILHO.custoPorContrato, '')
  assert.deepEqual(doFormulario(form, PARAMETROS), { parametros: PARAMETROS, erros: [] })

  form.ativos.MILHO.custoPorContrato = '1,20'
  form.ativos.MILHO.riscoPct = '1.5'
  const { parametros } = doFormulario(form, PARAMETROS)
  assert.deepEqual([parametros.ativos.MILHO.custoPorContrato, parametros.ativos.MILHO.riscoPct], [1.2, 1.5])
})

test('o formulário recusa vazio onde não pode, texto e decimal num inteiro', () => {
  const form = paraFormulario(PARAMETROS)
  form.ativos.MILHO.riscoPct = ''
  form.ativos.MILHO.slippageTicks = '2,5'
  form.carteira.maxPosicoes = 'dois'
  const { erros } = doFormulario(form, PARAMETROS)
  assert.equal(erros.length, 3)
  assert.match(erros[0], /Milho: Risco por operação é obrigatório/)
})

test('formatação: retorno com sinal, R, parâmetro pendente', () => {
  assert.equal(formatarRetorno(1.256), '+1,26%')
  assert.equal(formatarRetorno(-0.4), '−0,40%')
  assert.equal(formatarRetorno(0), '0,00%')
  assert.equal(formatarR(-1), '−1,00R')
  assert.equal(formatarParametro(null, CAMPOS_ATIVO.at(-1)), 'Pendente')
  assert.equal(formatarParametro(1.5, CAMPOS_ATIVO[1]), '1,5')
  assert.equal(rotulo('SEM_DECISAO'), 'Sem decisão')
  assert.equal(rotulo('DESCONHECIDO'), 'DESCONHECIDO')
  assert.equal(nomeTrilha('DETERMINISTICA'), 'Determinística')
})

test('gráfico do patrimônio: o retorno acumulado, uma série por trilha, com o nome na legenda', () => {
  const { pontos, rotulos } = pontosDoPatrimonio([
    { tipo: 'CAIXA', serie: [{ data: '2026-10-14', patrimonio: 10005 }] },
    { tipo: 'IA', serie: [] }
  ], 10000)
  assert.deepEqual(pontos, [{ data: '2026-10-14', valor: 0.05, serie: 'CAIXA' }])
  assert.deepEqual(rotulos, { CAIXA: 'Caixa', IA: 'IA' })
})

test('consistência da réplica: ramos iguais sobre o total; sem uma das duas, nulo', () => {
  const ramo = (acao) => ({ acao, porque: 'x' })
  const principal = { recomendacoes: [{ ativo: 'MILHO', semPosicao: ramo('NAO_ENTRAR'), comprado: ramo('MANTER'), vendido: ramo('ZERAR') }] }
  const replica = { recomendacoes: [{ ativo: 'MILHO', semPosicao: ramo('ENTRAR_VENDIDO'), comprado: ramo('MANTER'), vendido: ramo('ZERAR') }] }
  assert.deepEqual(consistencia(principal, replica), { iguais: 2, total: 3 })
  assert.equal(consistencia(principal, { recomendacoes: null }), null)
  assert.equal(corDaAcao('ZERAR'), 'text-bg-danger')
})
