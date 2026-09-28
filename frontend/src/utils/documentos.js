// Documentos do projeto abertos num modal da tela "Status do projeto" (ADRs, reconhecimentos de fonte, docs/*.md e
// CLAUDE.md): transforma as menções do markdown em links internos `doc:<id>`, que o renderizador
// (utils/markdown.js) vira um link que abre o modal em vez de sair da página.

// Caminho relativo à raiz do repositório -> id do documento. A MESMA regra está no backend
// (services/documentos-projeto.service.js), que serve o documento por esse id.
export function idDoCaminho(caminho) {
  const c = String(caminho || '').replace(/\\/g, '/').replace(/^\.\//, '')
  let m = /^docs\/adr\/(\d{4})-[^/]+\.md$/.exec(c)
  if (m) return `adr-${m[1]}`
  m = /^docs\/reconhecimento-fontes\/([^/]+)\.md$/.exec(c)
  if (m) return `reconhecimento-${m[1].toLowerCase()}`
  m = /^docs\/([^/]+)\.md$/.exec(c)
  if (m) return m[1].toLowerCase()
  if (c === 'CLAUDE.md') return 'claude'
  return null
}

// Resolve um link relativo (`clima.md`, `../adr/0015-x.md`) a partir da pasta do documento que o contém.
export function resolverCaminho(pastaBase, href) {
  const partes = [...String(pastaBase || '').split('/'), ...String(href).split('/')]
  const saida = []
  for (const parte of partes) {
    if (!parte || parte === '.') continue
    if (parte === '..') saida.pop()
    else saida.push(parte)
  }
  return saida.join('/')
}

// Id do documento para um caminho escrito no texto: primeiro a partir da raiz (a convenção dos documentos é
// escrever `docs/...` desde a raiz), depois a partir da pasta do documento atual (`clima.md` no índice das fontes).
export function idDaReferencia(caminho, pastaBase = '') {
  const semAncora = String(caminho).split('#')[0]
  return idDoCaminho(semAncora) || (pastaBase ? idDoCaminho(resolverCaminho(pastaBase, semAncora)) : null)
}

// "ADR 0027", "ADRs 0022 e 0023", "ADRs 0001, 0006", "ADRs 0017–0024": com um número só, a expressão inteira vira
// o link; com vários, cada número vira um link (os separadores ficam como texto).
const RE_ADR = /\b(ADRs?) (\d{4}((?:, | e | a |–|-)\d{4})*)/g

function ligarAdrs(texto) {
  return texto.replace(RE_ADR, (tudo, rotulo, numeros, _resto, posicao, original) => {
    // Já é texto de um link markdown ("[ADR 0027](...)"): não mexe.
    if (original[posicao - 1] === '[') return tudo
    const lista = numeros.match(/\d{4}/g)
    if (lista.length === 1) return `[${rotulo} ${numeros}](doc:adr-${numeros})`
    return `${rotulo} ${numeros.replace(/\d{4}/g, (n) => `[${n}](doc:adr-${n})`)}`
  })
}

// Um trecho `caminho.md` (código inline) que é um documento conhecido vira link, com o código dentro.
function ligarCaminho(codigo, pastaBase) {
  const m = /^`([^`\s]+\.md)`$/.exec(codigo)
  const id = m && idDaReferencia(m[1], pastaBase)
  return id ? `[${codigo}](doc:${id})` : codigo
}

// Aplica as duas regras só no texto comum: fora de bloco de código (``` / ~~~), fora das linhas de <details> e
// <summary> (HTML cru, que o renderizador mostra como texto: um link markdown ali apareceria cru) e, para os ADRs,
// fora de código inline.
export function ligarReferencias(markdown, { pastaBase = '' } = {}) {
  let emBloco = false
  return String(markdown ?? '')
    .split('\n')
    .map((linha) => {
      if (/^\s*(```|~~~)/.test(linha)) {
        emBloco = !emBloco
        return linha
      }
      if (emBloco || /<\/?(details|summary)\b/i.test(linha)) return linha
      return linha
        .split(/(`[^`]+`)/)
        .map((parte, i, partes) => {
          if (i % 2 === 1) return partes[i - 1]?.endsWith('[') ? parte : ligarCaminho(parte, pastaBase)
          return ligarAdrs(parte)
        })
        .join('')
    })
    .join('\n')
}

// "adr-0027" -> "ADR 0027"; os demais, o próprio id (usado no "voltar para ..." do modal antes de o título chegar).
export function rotuloDoId(id) {
  const m = /^adr-(\d{4})$/.exec(String(id || ''))
  return m ? `ADR ${m[1]}` : String(id || '')
}
