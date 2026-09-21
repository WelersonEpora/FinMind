import { Marked } from 'marked'

function escapar(texto) {
  return String(texto)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// Só links web e âncoras: um href `javascript:` vira texto simples. O markdown
// vem do repositório (arquivo próprio), mas o resultado vai para v-html.
function hrefSeguro(href) {
  return /^(https?:\/\/|mailto:|#)/i.test(href)
}

// Única exceção ao "HTML cru vira texto": as tags de seção recolhível, exatamente
// nestas formas e sem atributo algum (nada de onclick, style, etc.).
const TAG_PERMITIDA = /(<details>|<details open>|<\/details>|<summary>|<\/summary>)/g

// Mantém as tags permitidas e escapa todo o resto do bloco (inclusive o texto
// do <summary>), então `<script>` ou `<details onclick=...>` continuam inertes.
function htmlComTagsDeSecao(texto) {
  return String(texto)
    .split(TAG_PERMITIDA)
    .map((parte, i) => (i % 2 === 1 ? parte : escapar(parte)))
    .join('')
}

const marked = new Marked({
  gfm: true,
  renderer: {
    // HTML cru dentro do markdown nunca é interpretado - vira texto escapado,
    // salvo <details>/<summary> sem atributos (seção recolhível).
    html({ text }) {
      return htmlComTagsDeSecao(text)
    },
    link({ href, title, tokens }) {
      const texto = this.parser.parseInline(tokens)
      if (!hrefSeguro(href)) return texto
      const tituloAttr = title ? ` title="${escapar(title)}"` : ''
      return `<a href="${escapar(href)}"${tituloAttr} target="_blank" rel="noopener noreferrer">${texto}</a>`
    }
  }
})

export function renderizarMarkdown(markdown) {
  return marked.parse(String(markdown ?? ''), { async: false })
}
