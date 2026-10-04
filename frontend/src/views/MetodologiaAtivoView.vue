<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/layout/AppShell.vue'
import SeletorOpcao from '../components/centro-decisao/SeletorOpcao.vue'
import CalculoFator from '../components/metodologia/CalculoFator.vue'
import EventosFator from '../components/metodologia/EventosFator.vue'
import ResultadoSimulacao from '../components/metodologia/ResultadoSimulacao.vue'
import PromptDiario from '../components/metodologia/PromptDiario.vue'
import metodologiaAtivoService from '../services/metodologia-ativo.service.js'
import { iconeAtivo } from '../utils/centro-decisao.js'

// Metodologia dos fatores de um ativo: uma PROPOSTA para o David validar, não regra (ADR 0050). Cada bloco diz de
// onde vem: o FEL 1 (o que o David escreveu), os dados (o que o FinMind coleta) e a proposta (rascunho). No desenho
// do Centro de Decisão: título, um card de contexto com o seletor de ativo e, depois, os fatores.
const route = useRoute()
const router = useRouter()
const loading = ref(true)
const atualizando = ref(false)
const errorMessage = ref('')
const resposta = ref(null)
const fatorSelecionado = ref(null)
// O modal do que vale para o ativo inteiro (preço de referência, leitura da IA): decisões e pendências.
const ativoAberto = ref(false)

const ativo = computed(() => (route.params.ativo || 'PETROLEO').toUpperCase())
const metodologia = computed(() => resposta.value?.metodologia || null)
// No card do ativo, a 1ª decisão (o preço de referência) até o primeiro ponto final ou dois-pontos de detalhe.
const resumoDoAtivo = computed(() => {
  const primeira = metodologia.value?.doAtivo?.decisoes?.[0]
  if (!primeira) return 'Nada decidido ainda para o ativo.'
  const fim = primeira.indexOf('. ')
  return fim > 0 ? primeira.slice(0, fim + 1) : primeira
})
const opcoesAtivo = computed(() => (resposta.value?.ativos || []).map((a) => ({ ...a, icone: iconeAtivo(a.codigo) })))

const ROTULO_SITUACAO = { PROPOSTA: 'Proposta, aguardando o David', VALIDADA: 'Validada pelo David' }

// A situação da proposta de um fator. A do próprio especialista (o milho, ADR 0055) aguarda o Comitê, não ele.
function rotuloSituacao(proposta) {
  if (proposta.situacao === 'PROPOSTA' && proposta.autoria) return 'Proposta do especialista, aguardando o Comitê'
  return ROTULO_SITUACAO[proposta.situacao]
}

// O nome de um fator do ativo pelo código (o fator de que outro é contexto, ADR 0054).
function nomeDoFator(codigo) {
  return metodologia.value?.fatores.find((f) => f.codigo === codigo)?.nome || codigo
}

// --- Simulação numa data (ADR 0050): o resultado de cada fator com o que se sabia até o fim dela e o prompt completo.
function hojeLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const hoje = hojeLocal()
const dataEscolhida = ref('')
const simulacao = ref(null)
const simulando = ref(false)
const erroSimulacao = ref('')
const promptAberto = ref(false)

const resultadosPorFator = computed(() => new Map((simulacao.value?.fatores || []).map((f) => [f.codigo, f])))

function resultadoDoFator(codigo) {
  return resultadosPorFator.value.get(codigo) || null
}

async function simular() {
  if (!dataEscolhida.value) return
  simulando.value = true
  erroSimulacao.value = ''
  try {
    const { simulacao: resultado } = await metodologiaAtivoService.getSimulacao(ativo.value, dataEscolhida.value)
    simulacao.value = resultado
  } catch (err) {
    erroSimulacao.value = err?.response?.data?.error?.message || 'Não foi possível simular os fatores nesta data.'
  } finally {
    simulando.value = false
  }
}

function limparSimulacao() {
  simulacao.value = null
  dataEscolhida.value = ''
  erroSimulacao.value = ''
  promptAberto.value = false
}

function abrirFator(fator) {
  fatorSelecionado.value = fator
}

function fecharFator() {
  fatorSelecionado.value = null
}

// Esc fecha o modal aberto, como numa janela.
function fecharComEsc(evento) {
  if (evento.key !== 'Escape') return
  if (promptAberto.value) promptAberto.value = false
  else if (ativoAberto.value) ativoAberto.value = false
  else fecharFator()
}

watch([fatorSelecionado, promptAberto, ativoAberto], ([fator, prompt, doAtivo]) => {
  if (fator || prompt || doAtivo) window.addEventListener('keydown', fecharComEsc)
  else window.removeEventListener('keydown', fecharComEsc)
})

onBeforeUnmount(() => window.removeEventListener('keydown', fecharComEsc))

function selecionarAtivo(codigo) {
  router.replace(`/dados-mercado/metodologia/${codigo}`)
}

function formatarData(iso) {
  return iso ? iso.split('-').reverse().join('/') : ''
}

// Na 1ª carga a página mostra "Carregando..."; ao trocar de ativo, o conteúdo fica esmaecido até a resposta.
async function carregar() {
  if (resposta.value) atualizando.value = true
  else loading.value = true
  errorMessage.value = ''
  fatorSelecionado.value = null
  ativoAberto.value = false
  // A simulação é de um ativo: trocar de ativo volta para hoje.
  limparSimulacao()

  try {
    resposta.value = await metodologiaAtivoService.getMetodologiaAtivo(ativo.value)
  } catch (_err) {
    errorMessage.value = 'Não foi possível carregar a metodologia deste ativo.'
  } finally {
    loading.value = false
    atualizando.value = false
  }
}

watch(ativo, carregar, { immediate: true })
</script>

<template>
  <AppShell>
    <div class="metodologia-ativo">
      <header class="metodologia-ativo__cabecalho">
        <h1 class="metodologia-ativo__titulo">Metodologia do Ativo</h1>
        <p class="metodologia-ativo__subtitulo">
          Como cada fator é medido, lido e decidido, com os dados existentes no FinMind.
        </p>
      </header>

      <div v-if="loading" class="text-muted">Carregando...</div>
      <div v-else-if="errorMessage && !resposta" class="alert alert-danger">{{ errorMessage }}</div>

      <template v-else>
        <div v-if="errorMessage" class="alert alert-danger small">{{ errorMessage }}</div>

        <div class="metodologia-ativo__topo">
          <section class="metodologia-ativo__contexto">
            <SeletorOpcao :model-value="resposta.ativo.codigo" :opcoes="opcoesAtivo" rotulo="Ativo" @update:model-value="selecionarAtivo" />
          </section>

          <!-- Simulação numa data: o que cada fator mostraria com o que se sabia até o fim dela. -->
          <form v-if="metodologia" class="metodologia-ativo__simulacao" @submit.prevent="simular">
            <label for="data-simulacao" class="metodologia-ativo__simulacao-rotulo">Simular em</label>
            <input id="data-simulacao" v-model="dataEscolhida" type="date" class="form-control form-control-sm" :max="hoje" required />
            <button type="submit" class="btn btn-primary btn-sm" :disabled="!dataEscolhida || simulando">
              {{ simulando ? 'Simulando...' : 'Simular' }}
            </button>
            <template v-if="simulacao">
              <!-- O prompt só existe para o ativo com o prompt diário aprovado (ADR 0052). -->
              <button v-if="metodologia?.promptDiario" type="button" class="btn btn-outline-primary btn-sm" @click="promptAberto = true">
                Ver prompt completo
              </button>
              <button type="button" class="btn btn-link btn-sm" @click="limparSimulacao">Voltar para hoje</button>
            </template>
          </form>
        </div>
        <div v-if="erroSimulacao" class="alert alert-danger small">{{ erroSimulacao }}</div>

        <div class="metodologia-ativo__conteudo" :class="{ 'metodologia-ativo__conteudo--atualizando': atualizando }">
          <div v-if="!metodologia" class="alert alert-light">
            A metodologia do {{ resposta.ativo.nome.toLowerCase() }} ainda não foi montada: segue o molde do petróleo e do
            ouro, depois de o especialista reagir a eles.
          </div>

          <template v-else>
            <!-- O que vale para o ativo inteiro, não para um fator: o preço de referência, a leitura da IA e o que o
                 especialista ainda decide sobre eles. Mesmo formato do card de um fator. -->
            <div class="metodologia-ativo__secao-cabecalho">
              <h2 class="metodologia-ativo__secao-titulo">Ativo</h2>
            </div>
            <div class="metodologia-ativo__cards metodologia-ativo__cards--ativo">
              <article class="metodologia-ativo__card">
                <div class="metodologia-ativo__card-corpo">
                  <div class="metodologia-ativo__card-titulo-grupo">
                    <h2 class="metodologia-ativo__card-titulo">{{ metodologia.nome }}: preço de referência e leitura da IA</h2>
                  </div>
                  <p class="metodologia-ativo__objetivo">{{ resumoDoAtivo }}</p>
                </div>
                <div class="metodologia-ativo__card-lateral">
                  <span v-if="metodologia.doAtivo.perguntas.length" class="metodologia-ativo__pendencias">
                    <i class="bi bi-question-circle"></i>
                    {{ metodologia.doAtivo.perguntas.length === 1 ? '1 pendência' : `${metodologia.doAtivo.perguntas.length} pendências` }}
                  </span>
                  <button type="button" class="btn btn-outline-primary btn-sm metodologia-ativo__botao" @click="ativoAberto = true">
                    Detalhes
                  </button>
                </div>
              </article>
            </div>

            <div class="metodologia-ativo__secao-cabecalho">
              <h2 class="metodologia-ativo__secao-titulo">Fatores</h2>
              <span class="metodologia-ativo__contexto-resumo">
                {{ metodologia.fatores.length }} fatores · proposta v{{ metodologia.versao }} de {{ formatarData(metodologia.dataVersao) }}
              </span>
            </div>
            <p v-if="simulacao" class="metodologia-ativo__simulando">
              <i class="bi bi-clock-history"></i>
              Simulando {{ formatarData(simulacao.data) }}: o que se sabia até o fim deste dia. A decisão usa os parâmetros
              em uso hoje.
            </p>

            <div class="metodologia-ativo__cards">
              <article v-for="(fator, index) in metodologia.fatores" :key="fator.codigo" class="metodologia-ativo__card">
                <!-- Duas colunas: o conteúdo (nome e peso, como na barra do modal; a direção; as marcas) e, à direita,
                     o botão de detalhes, no meio da altura do card. -->
                <div class="metodologia-ativo__card-corpo">
                  <div class="metodologia-ativo__card-titulo-grupo">
                    <h2 class="metodologia-ativo__card-titulo">{{ index + 1 }} - {{ fator.nome }}</h2>
                    <span
                      class="metodologia-ativo__badge"
                      :class="{
                        'metodologia-ativo__badge--alto': fator.peso === 'Alto',
                        'metodologia-ativo__badge--medio': fator.peso === 'Médio'
                      }"
                    >
                      Peso {{ fator.peso }}
                    </span>
                  </div>
                  <p class="metodologia-ativo__objetivo">{{ fator.fel1.direcao }}</p>

                  <div class="metodologia-ativo__marcas">
                    <!-- Tudo é proposta (o resumo ao lado de "Fatores" e o modal dizem): no card, só a exceção (fator validado). -->
                    <span v-if="fator.proposta.situacao === 'VALIDADA'" class="metodologia-ativo__situacao metodologia-ativo__situacao--validada">
                      {{ ROTULO_SITUACAO.VALIDADA }}
                    </span>
                    <!-- Dado insuficiente em vermelho, como etiqueta: é um alerta, não uma marca como as outras. -->
                    <span
                      v-if="fator.dados.avaliacao"
                      class="metodologia-ativo__calculado"
                      :class="{ 'metodologia-ativo__insuficiente': !fator.dados.avaliacao.suficiente }"
                    >
                      <i class="bi" :class="fator.dados.avaliacao.suficiente ? 'bi-check-circle' : 'bi-exclamation-circle'"></i>
                      {{ fator.dados.avaliacao.suficiente ? 'Dado suficiente' : 'Dado insuficiente' }}
                    </span>
                    <span v-if="fator.calculado" class="metodologia-ativo__calculado"><i class="bi bi-graph-up"></i> Proposta calculada</span>
                    <span v-if="fator.deEvento" class="metodologia-ativo__calculado"><i class="bi bi-broadcast"></i> Fator de evento</span>
                    <span v-if="fator.comEventos" class="metodologia-ativo__calculado"><i class="bi bi-broadcast"></i> Com eventos</span>
                    <span v-if="fator.contextoDe" class="metodologia-ativo__calculado">
                      <i class="bi bi-info-circle"></i> Contexto de {{ nomeDoFator(fator.contextoDe) }}
                    </span>
                  </div>

                  <!-- O resultado do fator na data simulada, numa linha. -->
                  <ResultadoSimulacao v-if="resultadoDoFator(fator.codigo)" :resultado="resultadoDoFator(fator.codigo)" :data="simulacao.data" />
                </div>
                <!-- Coluna da direita: as pendências no canto superior, o botão de detalhes no meio da altura do card. -->
                <div class="metodologia-ativo__card-lateral">
                  <!-- O que o especialista ainda decide neste fator: visível no card, sem abrir o modal. -->
                  <span v-if="fator.perguntas.length" class="metodologia-ativo__pendencias">
                    <i class="bi bi-question-circle"></i>
                    {{ fator.perguntas.length === 1 ? '1 pendência' : `${fator.perguntas.length} pendências` }}
                  </span>
                  <button type="button" class="btn btn-outline-primary btn-sm metodologia-ativo__botao" @click="abrirFator(fator)">
                    Detalhes
                  </button>
                </div>
              </article>
            </div>
          </template>
        </div>
      </template>
    </div>

    <div v-if="fatorSelecionado" class="metodologia-ativo__modal-backdrop" @click.self="fecharFator">
      <div class="metodologia-ativo__modal" role="dialog" aria-modal="true" aria-labelledby="fator-titulo">
        <div class="metodologia-ativo__modal-header">
          <div class="metodologia-ativo__modal-titulo">
            <h3 id="fator-titulo">{{ fatorSelecionado.nome }}</h3>
            <span
              class="metodologia-ativo__badge"
              :class="{
                'metodologia-ativo__badge--alto': fatorSelecionado.peso === 'Alto',
                'metodologia-ativo__badge--medio': fatorSelecionado.peso === 'Médio'
              }"
              :title="`Peso ${fatorSelecionado.peso}`"
            >
              Peso {{ fatorSelecionado.peso }}
            </span>
          </div>
          <button type="button" class="metodologia-ativo__fechar" aria-label="Fechar" title="Fechar" @click="fecharFator">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div class="metodologia-ativo__modal-body">
          <section class="metodologia-ativo__bloco metodologia-ativo__bloco--fel1">
            <h4>Definição <small>o que o especialista escreveu</small></h4>
            <ul>
              <!-- O título do card diz o dado usado; aqui fica o nome que o especialista deu ao fator, quando difere. -->
              <li v-if="fatorSelecionado.nomeFel1 !== fatorSelecionado.nome"><strong>Nome no FEL 1:</strong> {{ fatorSelecionado.nomeFel1 }}</li>
              <li><strong>Tipo:</strong> {{ fatorSelecionado.fel1.tipo }}</li>
              <li><strong>Direção do impacto:</strong> {{ fatorSelecionado.fel1.direcao }}</li>
              <li><strong>Mecanismo de transmissão:</strong> {{ fatorSelecionado.fel1.mecanismo }}</li>
              <li><strong>Fonte:</strong> {{ fatorSelecionado.fel1.fonte }}</li>
            </ul>
          </section>

          <section class="metodologia-ativo__bloco">
            <h4>Dados no FinMind <small>o que já é coletado</small></h4>
            <ul>
              <li v-for="observavel in fatorSelecionado.dados.observaveis" :key="observavel.codigo">
                <RouterLink :to="`/dados-mercado/observaveis/${observavel.codigo}`">{{ observavel.nome }}</RouterLink>
              </li>
              <li v-if="fatorSelecionado.dados.eventos">
                <RouterLink to="/dados-mercado/eventos">Eventos de mercado (leitura diária por IA)</RouterLink>
              </li>
            </ul>
            <p
              v-if="fatorSelecionado.dados.avaliacao"
              class="metodologia-ativo__avaliacao"
              :class="fatorSelecionado.dados.avaliacao.suficiente ? 'metodologia-ativo__avaliacao--ok' : 'metodologia-ativo__avaliacao--falta'"
            >
              <strong>{{ fatorSelecionado.dados.avaliacao.suficiente ? 'O dado basta.' : 'O dado não basta.' }}</strong>
              {{ fatorSelecionado.dados.avaliacao.texto }}
            </p>
            <template v-if="fatorSelecionado.dados.lacunas.length">
              <p class="metodologia-ativo__lacunas-titulo">Lacunas</p>
              <ul>
                <li v-for="lacuna in fatorSelecionado.dados.lacunas" :key="lacuna">{{ lacuna }}</li>
              </ul>
            </template>
          </section>

          <section class="metodologia-ativo__bloco metodologia-ativo__bloco--proposta">
            <h4>
              Como medir
              <span class="metodologia-ativo__situacao" :class="`metodologia-ativo__situacao--${fatorSelecionado.proposta.situacao.toLowerCase()}`">
                {{ rotuloSituacao(fatorSelecionado.proposta) }}
              </span>
            </h4>
            <p v-if="fatorSelecionado.proposta.autoria" class="metodologia-ativo__autoria">
              Proposta de {{ fatorSelecionado.proposta.autoria }}. O que o FinMind acrescentou para o cálculo está dito na leitura.
            </p>
            <ul>
              <li><strong>Objetivo:</strong> {{ fatorSelecionado.proposta.objetivo }}</li>
              <!-- Fator de evento: sem cálculo, os rótulos dizem o que entra, o contexto e quem lê. -->
              <template v-if="fatorSelecionado.deEvento">
                <li><strong>O que entra:</strong> {{ fatorSelecionado.proposta.medida }}</li>
                <li><strong>Contexto:</strong> {{ fatorSelecionado.proposta.comparacao }}</li>
                <li><strong>Leitura:</strong> {{ fatorSelecionado.proposta.leitura }}</li>
              </template>
              <template v-else>
                <li><strong>A. Medir:</strong> {{ fatorSelecionado.proposta.medida }}</li>
                <li><strong>B. Ler (comparar com):</strong> {{ fatorSelecionado.proposta.comparacao }}</li>
                <li><strong>C. Decidir (simulação; o Comitê ajusta os parâmetros):</strong> {{ fatorSelecionado.proposta.leitura }}</li>
              </template>
            </ul>
            <!-- As regras como o especialista as escreveu, sem reescrever (o milho, Motor do Milho v0). -->
            <template v-if="fatorSelecionado.proposta.regrasEspecialista">
              <p class="metodologia-ativo__lacunas-titulo">Regras do especialista, como escritas</p>
              <ul>
                <li><strong>Alta:</strong> {{ fatorSelecionado.proposta.regrasEspecialista.alta }}</li>
                <li><strong>Baixa:</strong> {{ fatorSelecionado.proposta.regrasEspecialista.baixa }}</li>
              </ul>
            </template>
          </section>

          <p v-if="simulacao" class="metodologia-ativo__simulando mb-0">
            <i class="bi bi-clock-history"></i> Simulando {{ formatarData(simulacao.data) }}: o que se sabia até o fim deste dia.
          </p>
          <CalculoFator
            v-if="fatorSelecionado.calculado"
            :ativo="metodologia.ativo"
            :fator="fatorSelecionado.codigo"
            :data="simulacao?.data || ''"
          />
          <EventosFator
            v-else-if="fatorSelecionado.deEvento"
            :ativo="metodologia.ativo"
            :fator="fatorSelecionado.codigo"
            :data="simulacao?.data || ''"
          />
          <!-- Calculado e com eventos (o milho, ADR 0058): os eventos marcados com o fator, depois do cálculo. -->
          <EventosFator
            v-if="fatorSelecionado.comEventos"
            :ativo="metodologia.ativo"
            :fator="fatorSelecionado.codigo"
            :data="simulacao?.data || ''"
          />

          <!-- O que o especialista já decidiu sobre o fator, com a data e o ADR (ex.: as decisões do ouro, ADR 0054). -->
          <section v-if="fatorSelecionado.decisoes?.length" class="metodologia-ativo__bloco metodologia-ativo__bloco--decisoes">
            <h4>Decidido <small>pelo especialista</small></h4>
            <ul>
              <li v-for="decisao in fatorSelecionado.decisoes" :key="decisao">{{ decisao }}</li>
            </ul>
          </section>

          <section v-if="fatorSelecionado.perguntas.length" class="metodologia-ativo__bloco metodologia-ativo__bloco--perguntas">
            <h4>Pendências <small>o que o especialista ainda decide</small></h4>
            <ol>
              <li v-for="pergunta in fatorSelecionado.perguntas" :key="pergunta">{{ pergunta }}</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
    <div v-if="ativoAberto && metodologia" class="metodologia-ativo__modal-backdrop" @click.self="ativoAberto = false">
      <div class="metodologia-ativo__modal" role="dialog" aria-modal="true" aria-labelledby="ativo-titulo">
        <div class="metodologia-ativo__modal-header">
          <div class="metodologia-ativo__modal-titulo">
            <h3 id="ativo-titulo">{{ metodologia.nome }}: preço de referência e leitura da IA</h3>
          </div>
          <button type="button" class="metodologia-ativo__fechar" aria-label="Fechar" title="Fechar" @click="ativoAberto = false">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="metodologia-ativo__modal-body">
          <section v-if="metodologia.doAtivo.decisoes.length" class="metodologia-ativo__bloco metodologia-ativo__bloco--decisoes">
            <h4>Decidido <small>pelo especialista</small></h4>
            <ul>
              <li v-for="decisao in metodologia.doAtivo.decisoes" :key="decisao">{{ decisao }}</li>
            </ul>
          </section>
          <section v-if="metodologia.doAtivo.perguntas.length" class="metodologia-ativo__bloco metodologia-ativo__bloco--perguntas">
            <h4>Pendências <small>o que o especialista ainda decide</small></h4>
            <ol>
              <li v-for="pergunta in metodologia.doAtivo.perguntas" :key="pergunta">{{ pergunta }}</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
    <!-- O prompt diário da data simulada: o que a IA de tendência receberia (ADR 0051). -->
    <div v-if="promptAberto && simulacao" class="metodologia-ativo__modal-backdrop" @click.self="promptAberto = false">
      <div class="metodologia-ativo__modal" role="dialog" aria-modal="true" aria-labelledby="prompt-titulo">
        <div class="metodologia-ativo__modal-header">
          <div class="metodologia-ativo__modal-titulo">
            <h3 id="prompt-titulo">Prompt diário de análise</h3>
            <span class="metodologia-ativo__simulacao-data">{{ formatarData(simulacao.data) }}</span>
          </div>
          <button type="button" class="metodologia-ativo__fechar" aria-label="Fechar" title="Fechar" @click="promptAberto = false">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="metodologia-ativo__modal-body">
          <PromptDiario :ativo="metodologia.ativo" :data="simulacao.data" />
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.metodologia-ativo {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.metodologia-ativo__cabecalho {
  margin: 0;
}

.metodologia-ativo__titulo {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.25rem;
  letter-spacing: -0.01em;
}

.metodologia-ativo__subtitulo {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
}

.metodologia-ativo__contexto {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.75rem 1rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 16px;
  background: var(--p-content-background);
}

.metodologia-ativo__contexto-resumo {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}

/* O card do ativo e o da simulação lado a lado; em tela estreita, um abaixo do outro. */
.metodologia-ativo__topo {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

/* O card do ativo ocupa 1/3 da largura e o da simulação, os outros 2/3 (descontado o vão entre eles); em tela estreita,
   cada um ocupa a linha toda. */
.metodologia-ativo__topo .metodologia-ativo__contexto {
  flex: 0 0 calc((100% - 2rem) / 3);
  min-width: 0;
}

.metodologia-ativo__topo .metodologia-ativo__simulacao {
  flex: 1 1 0;
  min-width: 0;
}

@media (max-width: 900px) {
  .metodologia-ativo__topo .metodologia-ativo__contexto,
  .metodologia-ativo__topo .metodologia-ativo__simulacao {
    flex-basis: 100%;
  }
}

.metodologia-ativo__simulacao {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 16px;
  background: var(--p-content-background);
}

.metodologia-ativo__simulacao input {
  width: auto;
}

.metodologia-ativo__simulacao-rotulo {
  font-size: 0.85rem;
  font-weight: 600;
}

.metodologia-ativo__simulando {
  margin: -0.25rem 0 0.75rem;
  padding: 0.45rem 0.75rem;
  border-radius: 10px;
  background: rgba(17, 102, 255, 0.07);
  color: #0d4fc4;
  font-size: 0.85rem;
}

.metodologia-ativo__simulacao-data {
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(17, 102, 255, 0.1);
  color: #0d4fc4;
  font-size: 0.75rem;
  font-weight: 700;
}

.metodologia-ativo__conteudo {
  transition: opacity 0.15s;
}

.metodologia-ativo__secao-cabecalho {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  margin-bottom: 0.75rem;
}

.metodologia-ativo__secao-titulo {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.metodologia-ativo__conteudo--atualizando {
  opacity: 0.55;
  pointer-events: none;
}

.metodologia-ativo__cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

/* De quem é a proposta, quando não é do FinMind (o milho): uma linha discreta logo abaixo do título do bloco. */
.metodologia-ativo__autoria {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: var(--bs-secondary-color, #6c757d);
}

/* O card do ativo é um só: largura inteira, com o mesmo espaço antes do título "Fatores". */
.metodologia-ativo__cards--ativo {
  grid-template-columns: minmax(0, 1fr);
  margin-bottom: 1.5rem;
}

/* Tela estreita: um card por linha. */
@media (max-width: 900px) {
  .metodologia-ativo__cards {
    grid-template-columns: minmax(0, 1fr);
  }
}

.metodologia-ativo__card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.15rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 16px;
  background: var(--p-content-background);
}

.metodologia-ativo__card-corpo {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.metodologia-ativo__card-titulo-grupo {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  min-width: 0;
}

.metodologia-ativo__badge {
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #fff;
}

.metodologia-ativo__badge--alto {
  background: #d63c3c;
}

.metodologia-ativo__badge--medio {
  background: #d39a17;
}

.metodologia-ativo__card-titulo {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.35;
}

.metodologia-ativo__objetivo {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
  line-height: 1.5;
}

.metodologia-ativo__marcas {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.75rem;
}

.metodologia-ativo__botao {
  flex-shrink: 0;
}

/* A coluna da direita ocupa a altura do card: as pendências no topo, o botão centrado no espaço que sobra. */
.metodologia-ativo__card-lateral {
  align-self: stretch;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
}

.metodologia-ativo__card-lateral .metodologia-ativo__botao {
  margin: auto 0;
}

.metodologia-ativo__card-titulo-grupo + .metodologia-ativo__objetivo {
  margin-top: -0.25rem;
}

.metodologia-ativo__modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 17, 32, 0.55);
  display: grid;
  place-items: center;
  padding: 1rem;
  z-index: 1100;
}

.metodologia-ativo__modal {
  width: min(1100px, 100%);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.2);
}

/* Barra de título fixa, como numa janela: o corpo rola por baixo dela. */
.metodologia-ativo__modal-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1rem 0.85rem 1.25rem;
  border-bottom: 1px solid rgba(19, 33, 59, 0.1);
}

.metodologia-ativo__modal-titulo {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  min-width: 0;
}

.metodologia-ativo__modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.metodologia-ativo__fechar {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 0;
  background: transparent;
  border-radius: 8px;
  color: var(--p-text-muted-color);
  font-size: 1.1rem;
}

.metodologia-ativo__fechar:hover {
  background: rgba(19, 33, 59, 0.08);
  color: inherit;
}

.metodologia-ativo__modal-body {
  overflow-y: auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.metodologia-ativo__bloco {
  background: rgba(19, 33, 59, 0.025);
  border: 1px solid rgba(19, 33, 59, 0.08);
  border-radius: 12px;
  padding: 1rem;
}

.metodologia-ativo__bloco h4 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}

.metodologia-ativo__bloco p,
.metodologia-ativo__bloco li {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.6;
}

.metodologia-ativo__bloco ul,
.metodologia-ativo__bloco ol {
  list-style: disc;
  margin: 0;
  padding-left: 1.1rem;
}

.metodologia-ativo__bloco h4 small {
  margin-left: 0.4rem;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
}

.metodologia-ativo__lacunas-titulo {
  margin: 0.75rem 0 0.35rem !important;
  font-weight: 700;
}

.metodologia-ativo__bloco--fel1 {
  background: rgba(17, 102, 255, 0.04);
  border-color: rgba(17, 102, 255, 0.18);
}

.metodologia-ativo__bloco--proposta {
  border-style: dashed;
  border-color: rgba(211, 154, 23, 0.6);
  background: rgba(211, 154, 23, 0.04);
}

.metodologia-ativo__bloco--perguntas {
  border-color: rgba(214, 60, 60, 0.25);
  background: rgba(214, 60, 60, 0.03);
}

.metodologia-ativo__bloco--decisoes {
  border-color: rgba(25, 135, 84, 0.25);
  background: rgba(25, 135, 84, 0.04);
}

.metodologia-ativo__situacao {
  align-self: flex-start;
  display: inline-flex;
  margin-left: 0.4rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  vertical-align: middle;
}

.metodologia-ativo__card .metodologia-ativo__situacao {
  margin-left: 0;
}

.metodologia-ativo__avaliacao {
  margin: 0.75rem 0 0 !important;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
}

.metodologia-ativo__avaliacao--ok {
  background: rgba(25, 135, 84, 0.08);
}

.metodologia-ativo__avaliacao--falta {
  background: rgba(214, 60, 60, 0.06);
}

.metodologia-ativo__calculado {
  font-size: 0.72rem;
  color: #8a5f00;
}

.metodologia-ativo__pendencias {
  white-space: nowrap;
  padding: 0.05rem 0.4rem;
  /* O mesmo vermelho claro do bloco "Pendências" do modal (.metodologia-ativo__bloco--perguntas). */
  border: 1px solid rgba(214, 60, 60, 0.25);
  border-radius: 999px;
  background: rgba(214, 60, 60, 0.06);
  color: #b02a2a;
  font-size: 0.65rem;
  font-weight: 600;
}

.metodologia-ativo__insuficiente {
  padding: 0.1rem 0.45rem;
  border: 1px solid rgba(214, 60, 60, 0.35);
  border-radius: 999px;
  background: rgba(214, 60, 60, 0.1);
  color: #b02a2a;
  font-weight: 600;
}

.metodologia-ativo__situacao--proposta {
  background: rgba(211, 154, 23, 0.15);
  color: #8a5f00;
}

.metodologia-ativo__situacao--validada {
  background: rgba(25, 135, 84, 0.12);
  color: #146c43;
}

@media (max-width: 768px) {
  .metodologia-ativo__header {
    align-items: stretch;
  }

  .metodologia-ativo__resumo {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
}
</style>
