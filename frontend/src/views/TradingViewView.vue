<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/layout/AppShell.vue'
import TradingViewWidget from '../components/charts/TradingViewWidget.vue'
import vTooltip from 'primevue/tooltip'
import {
  GRUPOS_TRADINGVIEW,
  simboloValido,
  itemDoSimbolo,
  rotuloComparacao,
  rotuloIntervalo,
  linkTradingView,
  lerTema,
  salvarTema
} from '../utils/tradingview.js'

// Tela TradingView (ADR 0128): o gráfico gratuito do TradingView (widget), embutido, para os contratos da B3 e os CFDs
// da Pepperstone, com a lista de ativos ao lado. O dado e o gráfico são do TradingView: nada passa pelo FinMind nem
// alimenta o motor, a IA ou as carteiras. O símbolo fica na URL (?simbolo=), para um link abrir no mesmo gráfico.

const route = useRoute()
const router = useRouter()

const simbolo = computed(() => simboloValido(route.query.simbolo))
const item = computed(() => itemDoSimbolo(simbolo.value))
const comparacao = computed(() => rotuloComparacao(item.value))

// Aviso do selo "Dado do TradingView" (ADR 0128: o painel com os "Sinais técnicos" fica por decisão do usuário).
const AVISO_TRADINGVIEW =
  'Tudo dentro do quadro do gráfico é do TradingView: os dados, os indicadores e o painel à direita, inclusive os ' +
  '"Sinais técnicos" de compra e venda. Não é análise do FinMind nem do Comitê e não alimenta a IA nem as carteiras.\n\n' +
  'Desenhos e indicadores não ficam salvos.'

// Tema do gráfico (escuro ou claro), lembrado no navegador; vale também na tela de comparação.
const tema = ref(lerTema())

// O widget, para o botão de tela cheia (o widget não tem um).
const grafico = ref(null)

// Altura do gráfico: do ponto onde ele começa até o fim da janela (menos uma margem), medida em vez de estimada,
// e refeita quando a janela muda de tamanho. Mínimo de 440 px (janela baixa; no celular, a lista fica acima).
const ALTURA_MINIMA = 440
const MARGEM_INFERIOR = 26 // o espaço do fim da página (24 px) e a borda do card
const areaGrafico = ref(null)
const alturaGrafico = ref(ALTURA_MINIMA)

function medirAltura() {
  const area = areaGrafico.value
  if (!area) return
  const topo = area.getBoundingClientRect().top + window.scrollY
  alturaGrafico.value = Math.max(ALTURA_MINIMA, Math.round(window.innerHeight - topo - MARGEM_INFERIOR))
}

onMounted(() => {
  medirAltura()
  window.addEventListener('resize', medirAltura)
})
onBeforeUnmount(() => window.removeEventListener('resize', medirAltura))

function alternarTema() {
  tema.value = tema.value === 'dark' ? 'light' : 'dark'
  salvarTema(tema.value)
}

function escolher(novo) {
  if (novo === simbolo.value) return
  router.replace({ query: { ...route.query, simbolo: novo } })
}
</script>

<template>
  <AppShell>
    <div class="tv">
      <header class="tv__cabecalho">
        <div class="tv__cabecalho-texto">
          <h1 class="tv__titulo">TradingView</h1>
          <p class="tv__subtitulo">
            Candles diários para os contratos da B3 e os CFDs da Pepperstone.
          </p>
        </div>
        <div class="tv__selos">
          <span
            v-tooltip.bottom="{ value: AVISO_TRADINGVIEW, class: 'tooltip-ajuda' }"
            class="tv__selo tv__selo--ajuda"
            tabindex="0"
            :aria-label="AVISO_TRADINGVIEW"
          >
            Dado do TradingView <i class="bi bi-info-circle"></i>
          </span>
          <span class="tv__selo">Só visualização</span>
        </div>
      </header>

      <div class="tv__corpo">
        <nav class="tv__lista" aria-label="Ativos">
          <div v-for="grupo in GRUPOS_TRADINGVIEW" :key="grupo.codigo" class="tv__grupo">
            <div class="tv__grupo-cabecalho">
              <span class="tv__grupo-rotulo">{{ grupo.rotulo }}</span>
              <span class="tv__grupo-selo">{{ grupo.selo }}</span>
            </div>
            <button
              v-for="opcao in grupo.simbolos"
              :key="opcao.simbolo"
              type="button"
              class="tv__ativo"
              :class="{ 'tv__ativo--marcado': opcao.simbolo === simbolo }"
              :aria-pressed="opcao.simbolo === simbolo"
              :title="opcao.simbolo"
              @click="escolher(opcao.simbolo)"
            >
              <span class="tv__ativo-texto">
                <span class="tv__ativo-nome">{{ opcao.ativo }}</span>
                <span class="tv__ativo-unidade">{{ opcao.unidadeCurta || opcao.unidade }}</span>
              </span>
              <span class="tv__ativo-codigo">{{ opcao.curto }}</span>
            </button>
          </div>
        </nav>

        <section class="tv__painel" aria-label="Gráfico">
          <div class="tv__painel-cabecalho">
            <div class="tv__painel-texto">
              <div class="tv__painel-linha">
                <h2 class="tv__painel-titulo">{{ item.ativo }}</h2>
                <span class="tv__painel-grupo">{{ item.grupoRotulo }}</span>
                <span class="tv__codigo">{{ item.simbolo }}</span>
              </div>
              <div class="tv__painel-meta">
                <span>{{ item.unidade }}</span>
                <span>{{ rotuloIntervalo(simbolo) }}</span>
                <span>{{ item.serie }}</span>
              </div>
            </div>
            <div class="tv__acoes">
              <router-link
                v-if="comparacao"
                :to="{ name: 'dados-mercado-tradingview-comparar', query: { par: item.par.toLowerCase() } }"
                class="btn btn-sm btn-outline-primary"
              >
                <i class="bi bi-layout-split"></i> Comparar {{ comparacao }}
              </router-link>
              <a :href="linkTradingView(simbolo)" class="btn btn-sm btn-dark" target="_blank" rel="noopener">
                Abrir no TradingView <i class="bi bi-box-arrow-up-right"></i>
              </a>
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                :title="tema === 'dark' ? 'Gráfico claro' : 'Gráfico escuro'"
                :aria-label="tema === 'dark' ? 'Gráfico claro' : 'Gráfico escuro'"
                @click="alternarTema"
              >
                <i class="bi" :class="tema === 'dark' ? 'bi-sun' : 'bi-moon-stars'"></i>
              </button>
              <button
                v-if="grafico?.suportaTelaCheia"
                type="button"
                class="btn btn-sm btn-outline-secondary"
                title="Gráfico em tela cheia (Esc sai)"
                aria-label="Gráfico em tela cheia"
                @click="grafico.alternarTelaCheia()"
              >
                <i class="bi bi-arrows-fullscreen"></i>
              </button>
            </div>
          </div>

          <div ref="areaGrafico" class="tv__grafico" :style="{ height: `${alturaGrafico}px` }">
            <TradingViewWidget
              ref="grafico"
              :simbolo="simbolo"
              :tema="tema"
              :titulo="`${item.ativo} · ${item.grupoRotulo}`"
            />
          </div>

        </section>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.tv {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tv__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}

.tv__cabecalho-texto {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 1rem;
}

.tv__grupo-rotulo {
  font-size: 1.05rem;
  font-weight: 700;
}

.tv__titulo {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.tv__subtitulo {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.95rem;
  line-height: 1.5;
}

.tv__selos {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tv__selo {
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  border-radius: 999px;
  padding: 0.3rem 0.75rem;
}

.tv__selo--ajuda {
  cursor: help;
}

.tv__corpo {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  align-items: flex-start;
}

/* Lista de ativos */
/* Lista estreita, para o gráfico ganhar largura; no celular, ocupa a linha toda, acima do gráfico. */
.tv__lista {
  flex: 0 0 210px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 14px;
  background: var(--p-content-background);
}

.tv__grupo {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tv__grupo + .tv__grupo {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--p-content-border-color);
}

.tv__grupo-cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem 0.4rem;
}

.tv__grupo-selo {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  background: rgba(0, 0, 0, 0.05);
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  white-space: nowrap;
}

.tv__ativo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 40px;
  padding: 0.3rem 0.75rem;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.tv__ativo:hover {
  background: rgba(13, 110, 253, 0.05);
}

.tv__ativo:focus-visible {
  outline: 2px solid var(--bs-primary);
  outline-offset: 1px;
}

.tv__ativo--marcado,
.tv__ativo--marcado:hover {
  background: rgba(13, 110, 253, 0.1);
}

.tv__ativo-texto {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.tv__ativo-nome {
  font-size: 0.85rem;
  font-weight: 500;
}

.tv__ativo--marcado .tv__ativo-nome {
  font-weight: 700;
}

.tv__ativo-unidade {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
}

.tv__ativo-codigo {
  font-family: var(--bs-font-monospace);
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.tv__ativo--marcado .tv__ativo-codigo {
  color: var(--bs-primary);
}

/* Painel do gráfico */
.tv__painel {
  flex: 999 1 560px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-content-border-color);
  border-radius: 14px;
  background: var(--p-content-background);
  overflow: hidden;
}

.tv__painel-cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1.4rem 0.8rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.tv__painel-texto {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}

.tv__painel-linha {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.6rem;
}

.tv__painel-titulo {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
}

.tv__painel-grupo {
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
}

.tv__codigo {
  font-family: var(--bs-font-monospace);
  font-size: 0.8rem;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  padding: 0.15rem 0.5rem;
}

.tv__painel-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.tv__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tv__acoes .btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.tv__grafico {
  min-height: 440px;
}

@media (max-width: 767.98px) {
  .tv__lista {
    flex-basis: 100%;
  }
}
</style>
