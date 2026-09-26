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

test('renderizarMarkdown: <details>/<summary> sem atributos viram seção recolhível, com a tabela dentro interpretada', () => {
  const html = renderizarMarkdown('<details>\n<summary>Entregas</summary>\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n</details>\n')

  assert.match(html, /<details>/)
  assert.match(html, /<summary>Entregas<\/summary>/)
  assert.match(html, /<table>/)
  assert.match(html, /<\/details>/)
})

test('renderizarMarkdown: <details open> e seção aninhada (sanfona por seção), com títulos e tabelas dentro', () => {
  const html = renderizarMarkdown(
    '<details open>\n<summary>4. Bloqueado</summary>\n\n### Tabela\n\n| a |\n|---|\n| 1 |\n\n' +
      '<details>\n<summary>Pergunta 2</summary>\n\n**detalhe**\n\n</details>\n\n</details>\n'
  )

  assert.match(html, /<details open>\s*<summary>4\. Bloqueado<\/summary>/)
  assert.match(html, /<h3[^>]*>Tabela<\/h3>/)
  assert.match(html, /<table>/)
  assert.match(html, /<details>\s*<summary>Pergunta 2<\/summary>/)
  assert.match(html, /<strong>detalhe<\/strong>/)
  assert.equal((html.match(/<\/details>/g) || []).length, 2)
  assert.equal(html.includes('&lt;'), false)
})

test('renderizarMarkdown: outras tags e atributos continuam escapados, mesmo dentro de <details>', () => {
  const html = renderizarMarkdown('<details onclick="alert(1)">\n<summary><b>x</b><script>alert(1)</script></summary>\n\ntexto\n\n</details>\n')

  assert.equal(html.includes('<details onclick'), false)
  assert.equal(html.includes('<script>'), false)
  assert.equal(html.includes('<b>'), false)
  assert.match(html, /&lt;details onclick=&quot;alert\(1\)&quot;&gt;/)
  assert.match(html, /&lt;script&gt;/)
})
