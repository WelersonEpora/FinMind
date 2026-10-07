import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// Documento do projeto (ADR, reconhecimento de fonte, docs/*.md) aberto no DocumentoModal: o id fica na URL
// (`?doc=adr-0027`), então o link é compartilhável, o F5 reabre o modal e o "voltar" do navegador fecha o modal em vez
// de sair da página. `trilha` = documentos abertos nesta sessão do modal, para o "Voltar para ..." (link de um
// documento para outro troca o conteúdo do mesmo modal, com `replace`, sem empilhar histórico). Os outros parâmetros
// da URL (ex.: `?ativo=`) são mantidos.
export function useDocumentoNaUrl() {
  const route = useRoute()
  const router = useRouter()

  const documentoAberto = computed(() => (typeof route.query.doc === 'string' && route.query.doc) || null)
  const trilha = ref([])
  const anterior = computed(() => (trilha.value.length > 1 ? trilha.value[trilha.value.length - 2] : null))
  // Se o modal foi aberto por um clique na tela (push), fechar = voltar no histórico; se veio por link direto, tira
  // o `doc` da URL (replace).
  let abertoPorClique = false

  watch(
    documentoAberto,
    (id) => {
      if (!id) {
        trilha.value = []
        abertoPorClique = false
      } else if (trilha.value[trilha.value.length - 1] !== id) {
        trilha.value = [id]
      }
    },
    { immediate: true }
  )

  function queryCom(doc) {
    const query = { ...route.query }
    delete query.doc
    return doc ? { ...query, doc } : query
  }

  function abrirDocumento(id) {
    trilha.value = [id]
    abertoPorClique = true
    router.push({ query: queryCom(id) })
  }

  function navegarDocumento(id) {
    if (id === documentoAberto.value) return
    trilha.value = [...trilha.value, id]
    router.replace({ query: queryCom(id) })
  }

  function voltarDocumento() {
    trilha.value = trilha.value.slice(0, -1)
    router.replace({ query: queryCom(trilha.value[trilha.value.length - 1]) })
  }

  function fecharDocumento() {
    if (abertoPorClique) router.back()
    else router.replace({ query: queryCom(null) })
  }

  return { documentoAberto, anterior, abrirDocumento, navegarDocumento, voltarDocumento, fecharDocumento }
}
