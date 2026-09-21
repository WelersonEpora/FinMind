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

const marked = new Marked({
  gfm: true,
  renderer: {
    // HTML cru dentro do markdown nunca é interpretado - vira texto escapado.
    html({ text }) {
      return escapar(text)
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
