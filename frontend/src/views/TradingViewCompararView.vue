<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/layout/AppShell.vue'
import TradingViewWidget from '../components/charts/TradingViewWidget.vue'
import { PARES_TRADINGVIEW, parDoCodigo, lerTema, salvarTema } from '../utils/tradingview.js'

// Comparar B3 e Pepperstone (ADR 0128): o mesmo ativo nos dois instrumentos, lado a lado, cada um num widget do
// TradingView. O par fica na URL (?par=milho). Só visualização, como a tela TradingView.

const route = useRoute()
const router = useRouter()

const par = computed(() => parDoCodigo(route.query.par))

const lados = computed(() => [
  { grupo: 'B3', atraso: 'Série contínua, 15 min de atraso', ...par.value.b3 },
  { grupo: 'Pepperstone', atraso: 'CFD da corretora', ...par.value.pepperstone }
])

const diferencas = computed(() => [
  { rotulo: 'Bolsa', texto: par.value.bolsa },
  { rotulo: 'Unidade', texto: `${par.value.b3.unidade} na B3; ${par.value.pepperstone.unidade} no CFD.` },
  {
    rotulo: 'Série',
    texto: 'Na B3, a série contínua do TradingView troca de vencimento na regra dele, que pode não coincidir com a do Profit.'
  }
])

// Tema dos gráficos: o mesmo da tela TradingView, lembrado no navegador.
const tema = ref(lerTema())

function alternarTema() {
  tema.value = tema.value === 'dark' ? 'light' : 'dark'
  salvarTema(tema.value)
}

// Os dois widgets (por grupo), para o botão de tela cheia de cada um.
const graficos = reactive({})

function escolher(codigo) {
  if (codigo === par.value.codigo) return
  router.replace({ query: { ...route.query, par: codigo.toLowerCase() } })
}
</script>

<template>
  <AppShell>
    <div class="tvc">
      <header class="tvc__cabecalho">
        <div class="tvc__cabecalho-texto">
          <router-link
            :to="{ name: 'dados-mercado-tradingview', query: { simbolo: par.b3.simbolo } }"
            class="tvc__voltar"
          >
            <i class="bi bi-chevron-left"></i> TradingView
          </router-link>
          <h1 class="tvc__titulo">Comparar B3 e Pepperstone</h1>
          <p class="tvc__subtitulo">
            O mesmo ativo em dois instrumentos, lado a lado: o contrato da B3 e o CFD da Pepperstone, que segue a bolsa
            americana.
          </p>
        </div>
        <div class="tvc__controles">
          <button
            type="button"
            class="btn btn-outline-secondary tvc__tema"
            :title="tema === 'dark' ? 'Gráficos claros' : 'Gráficos escuros'"
            :aria-label="tema === 'dark' ? 'Gráficos claros' : 'Gráficos escuros'"
            @click="alternarTema"
          >
            <i class="bi" :class="tema === 'dark' ? 'bi-sun' : 'bi-moon-stars'"></i>
          </button>
          <div class="tvc__seletor" role="group" aria-label="Ativo">
            <button
              v-for="opcao in PARES_TRADINGVIEW"
              :key="opcao.codigo"
              type="button"
              class="tvc__opcao"
              :class="{ 'tvc__opcao--marcada': opcao.codigo === par.codigo }"
              :aria-pressed="opcao.codigo === par.codigo"
              @click="escolher(opcao.codigo)"
            >
              {{ opcao.ativo }}
            </button>
          </div>
        </div>
      </header>

      <div class="tvc__graficos">
        <section v-for="lado in lados" :key="lado.simbolo" class="tvc__painel" :aria-label="lado.grupo">
          <div class="tvc__painel-cabecalho">
            <div class="tvc__painel-texto">
              <span class="tvc__painel-grupo">{{ lado.grupo }}</span>
              <h2 class="tvc__painel-titulo">{{ lado.titulo }}</h2>
            </div>
            <div class="tvc__painel-acoes">
              <span class="tvc__codigo">{{ lado.simbolo }}</span>
              <button
                v-if="graficos[lado.grupo]?.suportaTelaCheia"
                type="button"
                class="btn btn-sm btn-outline-secondary"
                :title="`${lado.titulo} em tela cheia (Esc sai)`"
                :aria-label="`${lado.titulo} em tela cheia`"
                @click="graficos[lado.grupo].alternarTelaCheia()"
              >
                <i class="bi bi-arrows-fullscreen"></i>
              </button>
            </div>
          </div>
          <div class="tvc__painel-meta">
            <span>{{ lado.unidade }}</span>
            <span>{{ lado.atraso }}</span>
          </div>
          <div class="tvc__grafico">
            <TradingViewWidget
              :ref="(el) => (graficos[lado.grupo] = el)"
              :detalhes="false"
              :simbolo="lado.simbolo"
              :tema="tema"
              :titulo="`${lado.titulo} · ${lado.grupo}`"
            />
          </div>
        </section>
      </div>

      <section class="tvc__painel" aria-label="Os dois no mesmo gráfico">
        <div class="tvc__painel-cabecalho">
          <div class="tvc__painel-texto">
            <span class="tvc__painel-grupo">B3 × Pepperstone</span>
            <h2 class="tvc__painel-titulo">Os dois no mesmo gráfico, em %</h2>
          </div>
          <div class="tvc__painel-acoes">
            <button
              v-if="graficos.sobreposto?.suportaTelaCheia"
              type="button"
              class="btn btn-sm btn-outline-secondary"
              title="Os dois no mesmo gráfico em tela cheia (Esc sai)"
              aria-label="Os dois no mesmo gráfico em tela cheia"
              @click="graficos.sobreposto.alternarTelaCheia()"
            >
              <i class="bi bi-arrows-fullscreen"></i>
            </button>
          </div>
        </div>
        <div class="tvc__painel-meta">
          <span>Variação de cada um desde o início da janela; unidades e moedas diferentes não atrapalham</span>
        </div>
        <div class="tvc__grafico">
          <TradingViewWidget
            :ref="(el) => (graficos.sobreposto = el)"
            :simbolo="par.b3.simbolo"
            :comparar="par.pepperstone.simbolo"
            :detalhes="false"
            :tema="tema"
            :titulo="`${par.b3.titulo} × ${par.pepperstone.titulo}`"
          />
        </div>
      </section>

      <section class="tvc__diferencas" aria-label="O que muda entre os dois">
        <div v-for="d in diferencas" :key="d.rotulo" class="tvc__diferenca">
          <span class="tvc__diferenca-rotulo">{{ d.rotulo }}</span>
          <span>{{ d.texto }}</span>
        </div>
      </section>

      <p class="tvc__nota">
        <i class="bi bi-info-circle"></i>
        Tudo dentro dos quadros dos gráficos é do TradingView: os dados e os indicadores. Não é análise do FinMind nem do
        Comitê e não alimenta a IA nem as carteiras.
      </p>
    </div>
  </AppShell>
</template>

<style scoped>
.tvc {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.tvc__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}

.tvc__cabecalho-texto {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-width: 80ch;
}

.tvc__voltar {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
  font-weight: 500;
  text-decoration: none;
}

.tvc__titulo {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.tvc__subtitulo,
.tvc__nota {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.95rem;
  line-height: 1.5;
}

.tvc__nota {
  font-size: 0.8rem;
}

.tvc__controles {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.tvc__tema {
  min-height: 48px;
  min-width: 48px;
}

.tvc__seletor {
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
}

.tvc__opcao {
  min-height: 40px;
  min-width: 72px;
  padding: 0 1rem;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}

.tvc__opcao:hover {
  background: rgba(0, 0, 0, 0.04);
}

.tvc__opcao:focus-visible {
  outline: 2px solid var(--bs-primary);
  outline-offset: 1px;
}

.tvc__opcao--marcada,
.tvc__opcao--marcada:hover {
  background: var(--bs-dark);
  color: #fff;
  font-weight: 600;
}

.tvc__graficos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
  gap: 1.25rem;
}

.tvc__painel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--p-content-border-color);
  border-radius: 14px;
  background: var(--p-content-background);
  overflow: hidden;
}

.tvc__painel-cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding: 1rem 1.25rem 0.5rem;
}

.tvc__painel-acoes {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tvc__painel-texto {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.tvc__painel-grupo,
.tvc__diferenca-rotulo {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
}

.tvc__painel-titulo {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
}

.tvc__codigo {
  font-family: var(--bs-font-monospace);
  font-size: 0.8rem;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  padding: 0.15rem 0.5rem;
}

.tvc__painel-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  padding: 0 1.25rem 0.75rem;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  border-bottom: 1px solid var(--p-content-border-color);
}

.tvc__grafico {
  height: max(380px, calc(100vh - 470px));
}

.tvc__diferencas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 1rem 1.75rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 14px;
  background: var(--p-content-background);
  font-size: 0.9rem;
  line-height: 1.5;
}

.tvc__diferenca {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
</style>
