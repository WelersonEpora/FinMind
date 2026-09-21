import { test } from 'node:test'
import assert from 'node:assert/strict'

import { renderizarMarkdown } from './markdown.js'

test('renderizarMarkdown: título, negrito, tachado e tabela GFM', () => {
  const html = renderizarMarkdown('# Título\n\n**forte** ~~riscado~~\n\n| a | b |\n|---|---|\n| 1 | 2 |\n')

  assert.match(html, /<h1[^>]*>Título<\/h1>/)
  assert.match(html, /<strong>forte<\/strong>/)
  assert.match(html, /<del>riscado<\/del>/)
  assert.match(html, /<table>/)
  assert.match(html, /<td>2<\/td>/)
})

test('renderizarMarkdown: HTML cru é escapado, não interpretado', () => {
  const html = renderizarMarkdown('oi <script>alert(1)</script>\n\n<img src=x onerror=alert(1)>')

  assert.equal(html.includes('<script>'), false)
  assert.equal(html.includes('<img'), false)
  assert.match(html, /&lt;script&gt;/)
})

test('renderizarMarkdown: link web abre em nova aba com rel seguro', () => {
  const html = renderizarMarkdown('[FRED](https://fred.stlouisfed.org)')

  assert.match(html, /<a href="https:\/\/fred\.stlouisfed\.org" target="_blank" rel="noopener noreferrer">FRED<\/a>/)
})

test('renderizarMarkdown: href javascript: vira texto simples', () => {
  const html = renderizarMarkdown('[clique](javascript:alert(1))')

  assert.equal(html.includes('href'), false)
  assert.match(html, /clique/)
})

test('renderizarMarkdown: entrada vazia ou nula não quebra', () => {
  assert.equal(renderizarMarkdown(''), '')
  assert.equal(renderizarMarkdown(null), '')
})
