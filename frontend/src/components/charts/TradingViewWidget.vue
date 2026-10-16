<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { configuracaoWidget, FUNDO_ESCURO } from '../../utils/tradingview.js'

// Widget "Advanced Real-Time Chart" do TradingView (ADR 0128): o script oficial cria um iframe deles dentro do
// container. Nada do iframe chega ao FinMind (outro domínio): é só visualização. Trocar o símbolo ou o tema recria o
// widget. O widget não tem botão de tela cheia: a tela chama `alternarTelaCheia()` (API de tela cheia do navegador,
// sobre a moldura deste componente; Esc também sai). Em tela cheia, uma faixa no topo mostra o título e o botão de
// sair, porque o cabeçalho da tela fica de fora. Sem suporte (ex.: Safari do iPhone), `suportaTelaCheia` é false e a
// tela esconde o botão.

const SCRIPT_WIDGET = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'

const props = defineProps({
  simbolo: { type: String, required: true },
  tema: { type: String, default: 'dark' },
  // false tira o painel de detalhes do widget; `comparar` sobrepõe um 2º símbolo do catálogo, em %.
  detalhes: { type: Boolean, default: true },
  comparar: { type: String, default: '' },
  // Título da faixa da tela cheia (ex.: "Milho · B3").
  titulo: { type: String, default: '' }
})

const moldura = ref(null)
const container = ref(null)
const emTelaCheia = ref(false)
const suportaTelaCheia = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled)

// Trocar de ativo depressa desfazia o widget enquanto o anterior carregava: o gráfico ficava vazio, ou o TradingView
// media o espaço antes da hora e desenhava o gráfico pequeno, num canto do iframe, sem recalcular depois. Por isso:
// a remontagem espera a pessoa parar de clicar; cada widget nasce numa caixa nova (o carregamento atrasado do anterior
// não alcança o atual); e, carregado o iframe, a largura dele muda 1 px e volta algumas vezes, o que dispara o
// redimensionamento dentro do widget e o faz medir de novo.
const ESPERA_REMONTAGEM_MS = 250
const AJUSTES_APOS_CARREGAR_MS = [300, 1200, 3000]

let temporizadorMontagem = null
let observadorIframe = null
let ajustes = []

function limparAjustes() {
  ajustes.forEach(clearTimeout)
  ajustes = []
  observadorIframe?.disconnect()
  observadorIframe = null
}

function recalcularTamanho(iframe) {
  if (!iframe.isConnected) return
  iframe.style.width = 'calc(100% - 1px)'
  requestAnimationFrame(() => {
    iframe.style.width = '100%'
  })
}

function vigiarIframe(caixa) {
  observadorIframe = new MutationObserver(() => {
    const iframe = caixa.querySelector('iframe')
    if (!iframe) return
    observadorIframe.disconnect()
    iframe.addEventListener(
      'load',
      () => {
        ajustes = AJUSTES_APOS_CARREGAR_MS.map((ms) => setTimeout(() => recalcularTamanho(iframe), ms))
      },
      { once: true }
    )
  })
  observadorIframe.observe(caixa, { childList: true, subtree: true })
}

function montar() {
  const raiz = container.value
  if (!raiz) return
  limparAjustes()
  raiz.replaceChildren()
  const caixa = document.createElement('div')
  caixa.className = 'tradingview-widget-container'
  caixa.style.height = '100%'
  const alvo = document.createElement('div')
  alvo.className = 'tradingview-widget-container__widget'
  alvo.style.height = '100%'
  const script = document.createElement('script')
  script.src = SCRIPT_WIDGET
  script.async = true
  script.text = JSON.stringify(
    configuracaoWidget(props.simbolo, props.tema, { detalhes: props.detalhes, comparar: props.comparar || null })
  )
  caixa.append(alvo, script)
  vigiarIframe(caixa)
  raiz.append(caixa)
}

function agendarMontagem() {
  clearTimeout(temporizadorMontagem)
  temporizadorMontagem = setTimeout(montar, ESPERA_REMONTAGEM_MS)
}

function atualizarTelaCheia() {
  emTelaCheia.value = Boolean(moldura.value) && document.fullscreenElement === moldura.value
}

async function alternarTelaCheia() {
  if (!suportaTelaCheia || !moldura.value) return
  try {
    if (document.fullscreenElement === moldura.value) await document.exitFullscreen()
    else await moldura.value.requestFullscreen()
  } catch {
    // o navegador recusou (ex.: sem gesto do usuário): fica como está
  }
}

onMounted(() => {
  montar()
  document.addEventListener('fullscreenchange', atualizarTelaCheia)
})
watch(() => [props.simbolo, props.tema, props.detalhes, props.comparar], agendarMontagem)
onBeforeUnmount(() => {
  clearTimeout(temporizadorMontagem)
  limparAjustes()
  document.removeEventListener('fullscreenchange', atualizarTelaCheia)
  if (document.fullscreenElement === moldura.value) document.exitFullscreen().catch(() => {})
  container.value?.replaceChildren()
})

defineExpose({ alternarTelaCheia, emTelaCheia, suportaTelaCheia })
</script>

<template>
  <div ref="moldura" class="tv-widget" :class="`tv-widget--${tema}`" :style="{ '--tv-fundo-escuro': FUNDO_ESCURO }">
    <div v-if="emTelaCheia" class="tv-widget__faixa">
      <span class="tv-widget__titulo">{{ titulo || simbolo }}</span>
      <button type="button" class="tv-widget__sair" @click="alternarTelaCheia">
        <i class="bi bi-fullscreen-exit"></i> Sair da tela cheia <span class="tv-widget__tecla">Esc</span>
      </button>
    </div>
    <div ref="container" class="tv-widget__grafico"></div>
  </div>
</template>

<style scoped>
.tv-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.tv-widget__grafico {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.tv-widget--dark:fullscreen {
  background: var(--tv-fundo-escuro);
  color: #d1d4dc;
}

.tv-widget--light:fullscreen {
  background: #fff;
  color: #131722;
}

.tv-widget__faixa {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}

.tv-widget__titulo {
  font-weight: 600;
  font-size: 0.95rem;
}

.tv-widget__sair {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 36px;
  padding: 0 0.75rem;
  border: 1px solid rgba(128, 128, 128, 0.45);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.tv-widget__sair:hover {
  background: rgba(128, 128, 128, 0.15);
}

.tv-widget__tecla {
  font-size: 0.7rem;
  border: 1px solid rgba(128, 128, 128, 0.45);
  border-radius: 4px;
  padding: 0 0.3rem;
  opacity: 0.8;
}
</style>
