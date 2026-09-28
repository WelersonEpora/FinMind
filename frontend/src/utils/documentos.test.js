import { test } from 'node:test'
import assert from 'node:assert/strict'

import { idDoCaminho, idDaReferencia, ligarReferencias, resolverCaminho, rotuloDoId } from './documentos.js'
import { renderizarMarkdown } from './markdown.js'

test('idDoCaminho: a mesma regra do backend (ADR pelo número, reconhecimento com prefixo, docs/ pelo nome, CLAUDE.md)', () => {
  assert.equal(idDoCaminho('docs/adr/0027-usda-area-plantada-milho-esmis.md'), 'adr-0027')
  assert.equal(idDoCaminho('docs/reconhecimento-fontes/README.md'), 'reconhecimento-readme')
  assert.equal(idDoCaminho('docs/cobertura-fatores-fel1-milho-ouro.md'), 'cobertura-fatores-fel1-milho-ouro')
  assert.equal(idDoCaminho('CLAUDE.md'), 'claude')
  assert.equal(idDoCaminho('STATUS_DO_PROJETO.md'), null)
  assert.equal(idDoCaminho('docs/Docs_David/x.md'), null)
})

test('resolverCaminho e idDaReferencia: caminho desde a raiz ou relativo à pasta do documento, com âncora', () => {
  assert.equal(resolverCaminho('docs/reconhecimento-fontes', '../adr/0015-x.md'), 'docs/adr/0015-x.md')
  assert.equal(idDaReferencia('clima.md', 'docs/reconhecimento-fontes'), 'reconhecimento-clima')
  assert.equal(idDaReferencia('docs/adr/0008-x.md#secao', 'docs/reconhecimento-fontes'), 'adr-0008')
  assert.equal(idDaReferencia('clima.md'), null, 'sem pasta, um nome solto não é resolvido')
})

test('ligarReferencias: "ADR 0027" inteiro vira link; com vários números, cada número vira link', () => {
  assert.equal(ligarReferencias('ver ADR 0027.'), 'ver [ADR 0027](doc:adr-0027).')
  assert.equal(
    ligarReferencias('ADRs 0022 e 0023; ADRs 0001, 0006; ADRs 0017–0024'),
    'ADRs [0022](doc:adr-0022) e [0023](doc:adr-0023); ADRs [0001](doc:adr-0001), [0006](doc:adr-0006); ADRs [0017](doc:adr-0017)–[0024](doc:adr-0024)'
  )
})

test('ligarReferencias: `docs/...md` conhecido vira link com o código dentro; desconhecido e STATUS ficam como estão', () => {
  assert.equal(ligarReferencias('ver `docs/pendente-especialista-david.md`'), 'ver [`docs/pendente-especialista-david.md`](doc:pendente-especialista-david)')
  assert.equal(ligarReferencias('`STATUS_DO_PROJETO.md` e `backend/src/x.js`'), '`STATUS_DO_PROJETO.md` e `backend/src/x.js`')
})

test('ligarReferencias: não mexe em bloco de código, em linhas de <details>/<summary>, em código inline nem em link já feito', () => {
  const md = ['```', 'ADR 0027', '```', '<summary>Pergunta (ADR 0009)</summary>', 'o `ADR 0009` citado', '[ADR 0021](https://x)'].join('\n')
  assert.equal(ligarReferencias(md), md)
})

test('renderizarMarkdown com documentos: menção vira link interno (data-doc, ?doc=), sem target _blank', () => {
  const html = renderizarMarkdown('Decisão no ADR 0027 e em `docs/architecture.md`.', { documentos: {} })
  assert.match(html, /<a href="\?doc=adr-0027" data-doc="adr-0027" class="finmind-doc-link">ADR 0027<\/a>/)
  assert.match(html, /<a href="\?doc=architecture" data-doc="architecture" class="finmind-doc-link"><code>docs\/architecture\.md<\/code><\/a>/)
  assert.equal(html.includes('target="_blank" rel="noopener noreferrer">ADR'), false)
})

test('renderizarMarkdown com documentos: link relativo a outro documento ([clima.md](clima.md)) abre no modal', () => {
  const html = renderizarMarkdown('[clima.md](clima.md) e [fora](../../README.md)', { documentos: { pastaBase: 'docs/reconhecimento-fontes' } })
  assert.match(html, /data-doc="reconhecimento-clima"/)
  assert.match(html, /e fora<\/p>/, 'README da raiz não é documento servido: vira texto simples')
  assert.equal(/data-doc="[^"]*readme/i.test(html), false)
})

test('renderizarMarkdown sem a opção: nada muda (menção a ADR continua texto; doc: não vira link)', () => {
  assert.equal(renderizarMarkdown('ADR 0027').includes('data-doc'), false)
  assert.equal(renderizarMarkdown('[x](doc:adr-0027)'), '<p>x</p>\n')
})

test('rotuloDoId: ADR com número, o resto como está', () => {
  assert.equal(rotuloDoId('adr-0027'), 'ADR 0027')
  assert.equal(rotuloDoId('reconhecimento-clima'), 'reconhecimento-clima')
})
