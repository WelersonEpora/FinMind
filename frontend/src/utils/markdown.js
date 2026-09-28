import { Marked } from 'marked'
import { idDaReferencia, ligarReferencias } from './documentos.js'

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

// Contexto da renderização em curso (o parse é síncrono): com `documentos`, as menções a ADRs e documentos do
// projeto viram links internos e `pastaBase` resolve os links relativos (`clima.md`) do documento aberto.
let contexto = null

// Link interno para um documento do projeto: abre o modal da tela (o clique é tratado por MarkdownConteudo.vue,
// que lê `data-doc`); o href `?doc=<id>` mantém o "abrir em nova aba" e o link compartilhável.
function linkDeDocumento(id, texto) {
  return `<a href="?doc=${encodeURIComponent(id)}" data-doc="${escapar(id)}" class="finmind-doc-link">${texto}</a>`
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
      if (contexto) {
        if (href.startsWith('doc:')) return linkDeDocumento(href.slice(4), texto)
        // Link relativo para outro documento (`[clima.md](clima.md)`): vira link interno se for um documento conhecido.
        if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && /\.md(#.*)?$/i.test(href)) {
          const id = idDaReferencia(href, contexto.pastaBase)
          if (id) return linkDeDocumento(id, texto)
        }
      }
      if (!hrefSeguro(href)) return texto
      const tituloAttr = title ? ` title="${escapar(title)}"` : ''
      return `<a href="${escapar(href)}"${tituloAttr} target="_blank" rel="noopener noreferrer">${texto}</a>`
    }
  }
})

// `documentos: { pastaBase }` liga as referências a documentos do projeto (ver utils/documentos.js); sem a opção,
// o markdown é renderizado como sempre foi.
export function renderizarMarkdown(markdown, { documentos } = {}) {
  if (!documentos) return marked.parse(String(markdown ?? ''), { async: false })
  const pastaBase = documentos.pastaBase || ''
  contexto = { pastaBase }
  try {
    return marked.parse(ligarReferencias(markdown, { pastaBase }), { async: false })
  } finally {
    contexto = null
  }
}
