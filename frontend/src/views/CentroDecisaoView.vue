<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Dialog from 'primevue/dialog'
import AppShell from '../components/layout/AppShell.vue'
import SeletorOpcao from '../components/centro-decisao/SeletorOpcao.vue'
import SeletorData from '../components/centro-decisao/SeletorData.vue'
import PrecoCard from '../components/centro-decisao/PrecoCard.vue'
import EventoDetalhe from '../components/eventos/EventoDetalhe.vue'
import NivelBadge from '../components/eventos/NivelBadge.vue'
import PressaoIndicador from '../components/eventos/PressaoIndicador.vue'
import centroDecisaoService from '../services/centro-decisao.service.js'
import { iconeAtivo } from '../utils/centro-decisao.js'
import { formatarData, rotuloTipo } from '../utils/geopolitica.js'

// Centro de Decisão (ADR 0048): a tela inicial, no desenho do Centro de Decisão do AgroMind. Um ativo e uma data
// mudam a tela inteira: o preço como era conhecido no fim daquele dia (point-in-time) e a leitura de eventos de mercado
// dela (ADR 0049). O espaço da análise (fatores, leitura por prazo, síntese) fica reservado até o David e o Comitê definirem as
// regras do Motor: nenhum sinal ou recomendação é gerado aqui.
//
// O ativo, a data e a série ficam na URL (?ativo=&data=&serie=): recarregar ou compartilhar o link abre a mesma leitura.

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const atualizando = ref(false)
const errorMessage = ref('')
const centro = ref(null)

const eventoAberto = ref(null)
const detalheEventoVisivel = computed({
  get: () => Boolean(eventoAberto.value),
  set: (visivel) => {
    if (!visivel) eventoAberto.value = null
  }
})

const opcoesAtivo = computed(() => (centro.value?.ativos || []).map((a) => ({ ...a, icone: iconeAtivo(a.codigo) })))

function filtrosDaRota() {
  const { ativo, data, serie } = route.query
  return { ativo: ativo || undefined, data: data || undefined, serie: serie || undefined }
}

async function carregar() {
  if (centro.value) atualizando.value = true
  else loading.value = true
  errorMessage.value = ''
  try {
    const { centroDecisao } = await centroDecisaoService.getCentroDecisao(filtrosDaRota())
    centro.value = centroDecisao
  } catch (err) {
    errorMessage.value = err.response?.data?.error?.message || 'Não foi possível carregar o Centro de Decisão.'
  } finally {
    loading.value = false
    atualizando.value = false
  }
}

// Troca de ativo volta para a série padrão dele; a data fica. A data de hoje não vai para a URL (a tela abre sempre
// no dia corrente).
function navegar({ ativo, data, serie }) {
  const query = { ativo, serie }
  if (data && data !== centro.value?.hoje) query.data = data
  router.replace({ query: Object.fromEntries(Object.entries(query).filter(([, v]) => v)) })
}

function selecionarAtivo(ativo) {
  navegar({ ativo, data: centro.value.data })
}

function selecionarData(data) {
  navegar({ ativo: centro.value.ativo.codigo, data, serie: centro.value.preco.codigo })
}

function selecionarSerie(serie) {
  navegar({ ativo: centro.value.ativo.codigo, data: centro.value.data, serie })
}

watch(() => route.query, carregar, { immediate: true })
</script>

<template>
  <AppShell>
    <div class="centro">
      <header class="centro__cabecalho">
        <h1 class="centro__titulo">Centro de Decisão</h1>
        <p class="centro__subtitulo">Troque o ativo ou a data e toda a leitura muda junto, com o que se sabia naquele dia.</p>
      </header>

      <div v-if="loading" class="text-muted">Carregando...</div>

      <div v-else-if="errorMessage && !centro" class="alert alert-danger">{{ errorMessage }}</div>

      <template v-else>
        <div v-if="errorMessage" class="alert alert-danger small">{{ errorMessage }}</div>

        <section class="centro__contexto">
          <SeletorOpcao :model-value="centro.ativo.codigo" :opcoes="opcoesAtivo" rotulo="Ativo" @update:model-value="selecionarAtivo" />
          <SeletorData :model-value="centro.data" :hoje="centro.hoje" @update:model-value="selecionarData" />
        </section>

        <div class="centro__conteudo" :class="{ 'centro__conteudo--atualizando': atualizando }">
          <div class="centro__linha">
            <PrecoCard
              :ativo-codigo="centro.ativo.codigo"
              :ativo-nome="centro.ativo.nome"
              :preco="centro.preco"
              :series="centro.series"
              :variacoes="centro.variacoes"
              :data="centro.data"
              @selecionar-serie="selecionarSerie"
            />

            <!-- Espaço do Motor: no AgroMind, o "Insight" (sinal, leitura por prazo, fatores). No FinMind, as regras são
                 do David e do Comitê (CLAUDE.md): até lá, só o aviso. -->
            <article class="centro__analise">
              <header class="centro__analise-topo">
                <h2><i class="bi bi-lightbulb"></i> Análise do FinMind</h2>
              </header>
              <div class="centro__analise-corpo">
                <i class="bi bi-hourglass-split centro__analise-icone"></i>
                <p class="centro__analise-texto">
                  Aqui vai a análise do {{ centro.ativo.nome.toLowerCase() }} para {{ formatarData(centro.data) }}: os
                  fatores, a leitura por prazo e a síntese.
                </p>
                <p class="centro__analise-nota">
                  As regras, os cálculos e os critérios de sinal são definidos pelo especialista de mercado e pelo Comitê.
                  Até lá, o FinMind não gera sinal nem recomendação.
                </p>
                <router-link to="/status-projeto" class="centro__analise-link">Ver o que falta decidir</router-link>
              </div>
            </article>
          </div>

          <section class="centro__secao">
            <div class="centro__secao-cabecalho">
              <h2 class="centro__secao-titulo">O que está movimentando o mercado</h2>
              <p class="centro__secao-subtitulo">
                Fatos externos relevantes para o preço que os dados coletados ainda não mostram, encontrados por IA com
                busca só em fontes autorizadas. Eventos dos 7 dias até a data.
              </p>
            </div>

            <template v-if="centro.geopolitica">
              <article v-if="centro.geopolitica.disponivel" class="centro__leitura">
                <div class="centro__leitura-topo">
                  <h3>Eventos do {{ centro.ativo.nome.toLowerCase() }} em {{ formatarData(centro.geopolitica.data) }}</h3>
                  <NivelBadge :codigo="centro.geopolitica.nivel" />
                </div>
                <p class="centro__leitura-resumo">{{ centro.geopolitica.resumo || 'Sem resumo.' }}</p>
                <p class="centro__leitura-rodape">
                  <!-- As fontes que a pesquisa do dia de fato leu (pelo grounding), não as que a IA diz ter consultado. -->
                  Fontes lidas na pesquisa do dia:
                  {{ centro.geopolitica.fontesLidas?.length ? centro.geopolitica.fontesLidas.join(', ') : 'nenhuma' }}.
                  Escala de nível provisória: a régua é do especialista.
                </p>
              </article>
              <div v-else class="alert alert-light small">
                Sem leitura de eventos do {{ centro.ativo.nome.toLowerCase() }} em {{ formatarData(centro.geopolitica.data) }}.
                A leitura só existe dos dias em que a coleta rodou (a do milho e a do café, desde 02/10/2026) e não é
                refeita para datas passadas.
              </div>

              <p v-if="centro.geopolitica.eventos.length === 0" class="text-muted small mb-0">
                Nenhum evento fora do normal nos 7 dias até {{ formatarData(centro.data) }}.
              </p>
              <div v-else class="centro__eventos">
                <button
                  v-for="evento in centro.geopolitica.eventos"
                  :key="evento.id"
                  type="button"
                  class="evento-card"
                  @click="eventoAberto = evento"
                >
                  <span class="evento-card__topo">
                    <span class="evento-card__data">{{ formatarData(evento.data) }}</span>
                    <span class="evento-card__tipo">{{ rotuloTipo(evento.tipo) }}</span>
                    <i class="bi bi-arrows-angle-expand evento-card__abrir"></i>
                  </span>
                  <span class="evento-card__titulo">{{ evento.titulo }}</span>
                  <span class="evento-card__pressao"><PressaoIndicador :codigo="evento.pressao" prefixo="Pressão:" /></span>
                </button>
              </div>
              <p v-if="centro.geopolitica.totalEventos > centro.geopolitica.eventos.length" class="centro__mais small">
                Mostrando {{ centro.geopolitica.eventos.length }} de {{ centro.geopolitica.totalEventos }}.
                <router-link to="/dados-mercado/eventos">Ver todos em Eventos</router-link>
              </p>
            </template>
          </section>
        </div>
      </template>

      <Dialog v-model:visible="detalheEventoVisivel" modal header="Evento" :style="{ width: '48rem' }" :breakpoints="{ '960px': '95vw' }">
        <EventoDetalhe v-if="eventoAberto" :evento="eventoAberto" />
      </Dialog>
    </div>
  </AppShell>
</template>

<style scoped>
.centro__cabecalho {
  margin-bottom: 1rem;
}

.centro__titulo {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.25rem;
  letter-spacing: -0.01em;
}

.centro__subtitulo {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
}

.centro__contexto {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.25rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 16px;
  background: var(--p-content-background);
}

.centro__conteudo {
  transition: opacity 0.15s;
}
.centro__conteudo--atualizando {
  opacity: 0.55;
  pointer-events: none;
}

.centro__linha {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 1.25rem;
  margin-bottom: 2rem;
}

.centro__analise {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-300);
  border-radius: 16px;
  background: var(--p-content-background);
  overflow: hidden;
}
.centro__analise-topo {
  padding: 0.85rem 1.15rem;
  border-bottom: 1px solid var(--p-content-border-color);
  background: var(--p-content-hover-background);
}
.centro__analise-topo h2 {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}
.centro__analise-corpo {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem 1.5rem;
  text-align: center;
}
.centro__analise-icone {
  font-size: 1.75rem;
  color: var(--p-text-muted-color);
}
.centro__analise-texto {
  margin: 0;
  font-weight: 600;
  max-width: 48ch;
}
.centro__analise-nota {
  margin: 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  max-width: 56ch;
}
.centro__analise-link,
.centro__mais a {
  color: var(--p-primary-color);
  text-decoration: none;
  font-size: 0.85rem;
}
.centro__analise-link:hover,
.centro__mais a:hover {
  text-decoration: underline;
}

.centro__secao-cabecalho {
  margin-bottom: 1rem;
}
.centro__secao-titulo {
  margin: 0 0 0.25rem;
  font-size: 1.3rem;
  font-weight: 700;
}
.centro__secao-subtitulo {
  margin: 0;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.centro__leitura {
  margin-bottom: 1rem;
  padding: 0.9rem 1.1rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 14px;
  background: var(--p-content-background);
}
.centro__leitura-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
.centro__leitura-topo h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}
.centro__leitura-resumo {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
}
.centro__leitura-rodape {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.centro__eventos {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.evento-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 14px;
  background: var(--p-content-background);
  color: var(--p-text-color);
  text-align: left;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.evento-card:hover {
  border-color: var(--p-primary-color);
  box-shadow: 0 2px 10px color-mix(in srgb, var(--p-text-color) 8%, transparent);
}
.evento-card__topo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}
.evento-card__data {
  font-weight: 600;
}
.evento-card__tipo {
  padding: 0.05rem 0.45rem;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--p-content-hover-background);
}
.evento-card__abrir {
  margin-left: auto;
  color: var(--p-text-muted-color);
}
.evento-card__titulo {
  font-weight: 700;
  font-size: 0.92rem;
  line-height: 1.35;
}
.evento-card__pressao {
  margin-top: auto;
  font-size: 0.8rem;
}

.centro__mais {
  margin: 0.75rem 0 0;
  color: var(--p-text-muted-color);
}

@media (max-width: 991.98px) {
  .centro__linha {
    grid-template-columns: 1fr;
  }
}
</style>
