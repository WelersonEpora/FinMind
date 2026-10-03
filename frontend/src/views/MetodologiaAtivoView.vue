<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/layout/AppShell.vue'
import SeletorOpcao from '../components/centro-decisao/SeletorOpcao.vue'
import CalculoFator from '../components/metodologia/CalculoFator.vue'
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

const ativo = computed(() => (route.params.ativo || 'PETROLEO').toUpperCase())
const metodologia = computed(() => resposta.value?.metodologia || null)
const opcoesAtivo = computed(() => (resposta.value?.ativos || []).map((a) => ({ ...a, icone: iconeAtivo(a.codigo) })))

const ROTULO_SITUACAO = { PROPOSTA: 'Proposta, aguardando o David', VALIDADA: 'Validada pelo David' }

function abrirFator(fator) {
  fatorSelecionado.value = fator
}

function fecharFator() {
  fatorSelecionado.value = null
}

// Esc fecha o modal, como numa janela.
function fecharComEsc(evento) {
  if (evento.key === 'Escape') fecharFator()
}

watch(fatorSelecionado, (fator) => {
  if (fator) window.addEventListener('keydown', fecharComEsc)
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

        <section class="metodologia-ativo__contexto">
          <SeletorOpcao :model-value="resposta.ativo.codigo" :opcoes="opcoesAtivo" rotulo="Ativo" @update:model-value="selecionarAtivo" />
          <p v-if="metodologia" class="metodologia-ativo__contexto-resumo">
            {{ metodologia.fatores.length }} fatores · proposta v{{ metodologia.versao }} de
            {{ formatarData(metodologia.dataVersao) }}
          </p>
        </section>

        <div class="metodologia-ativo__conteudo" :class="{ 'metodologia-ativo__conteudo--atualizando': atualizando }">
          <div v-if="!metodologia" class="alert alert-light">
            A metodologia do {{ resposta.ativo.nome.toLowerCase() }} ainda não foi montada. O petróleo é o primeiro
            ativo: os outros seguem o mesmo molde depois de o especialista reagir a ele.
          </div>

          <template v-else>
            <h2 class="metodologia-ativo__secao-titulo">Fatores</h2>

            <div class="metodologia-ativo__cards">
              <article v-for="(fator, index) in metodologia.fatores" :key="fator.codigo" class="metodologia-ativo__card">
                <!-- Como na barra do modal: o nome e, logo depois, o peso; o botão de detalhes à direita. -->
                <div class="metodologia-ativo__card-topo">
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
                  <button type="button" class="btn btn-outline-primary btn-sm metodologia-ativo__botao" @click="abrirFator(fator)">
                    Detalhes
                  </button>
                </div>
                <p class="metodologia-ativo__objetivo">{{ fator.fel1.direcao }}</p>

                <div class="metodologia-ativo__marcas">
                  <!-- O aviso do topo já diz que tudo é proposta: no card, só a exceção (fator validado). -->
                  <span v-if="fator.proposta.situacao === 'VALIDADA'" class="metodologia-ativo__situacao metodologia-ativo__situacao--validada">
                    {{ ROTULO_SITUACAO.VALIDADA }}
                  </span>
                  <span v-if="fator.dados.avaliacao" class="metodologia-ativo__calculado">
                    <i class="bi" :class="fator.dados.avaliacao.suficiente ? 'bi-check-circle' : 'bi-exclamation-circle'"></i>
                    {{ fator.dados.avaliacao.suficiente ? 'Dado suficiente' : 'Dado insuficiente' }}
                  </span>
                  <span v-if="fator.calculado" class="metodologia-ativo__calculado"><i class="bi bi-graph-up"></i> Proposta calculada</span>
                </div>
              </article>
            </div>

            <div class="alert alert-warning small metodologia-ativo__aviso">
              <strong>Proposta para validação do especialista.</strong>
              Os fatores, o peso, a direção e o mecanismo são do especialista. A forma de medir, ler e decidir cada fator
              é do FinMind, para abrir a conversa: ainda não alimenta o Centro de Decisão nem a IA.
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
                {{ ROTULO_SITUACAO[fatorSelecionado.proposta.situacao] }}
              </span>
            </h4>
            <ul>
              <li><strong>Objetivo:</strong> {{ fatorSelecionado.proposta.objetivo }}</li>
              <li><strong>A. Medir:</strong> {{ fatorSelecionado.proposta.medida }}</li>
              <li><strong>B. Ler (comparar com):</strong> {{ fatorSelecionado.proposta.comparacao }}</li>
              <li><strong>C. Decidir (simulação; o Comitê ajusta os parâmetros):</strong> {{ fatorSelecionado.proposta.leitura }}</li>
            </ul>
          </section>

          <CalculoFator
            v-if="fatorSelecionado.calculado"
            :ativo="metodologia.ativo"
            :fator="fatorSelecionado.codigo"
          />

          <section class="metodologia-ativo__bloco metodologia-ativo__bloco--perguntas">
            <h4>Pendências <small>o que o especialista ainda decide</small></h4>
            <ol>
              <li v-for="pergunta in fatorSelecionado.perguntas" :key="pergunta">{{ pergunta }}</li>
            </ol>
          </section>
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

.metodologia-ativo__conteudo {
  transition: opacity 0.15s;
}

.metodologia-ativo__secao-titulo {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
  font-weight: 600;
}

.metodologia-ativo__aviso {
  margin: 1rem 0 0;
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

/* Tela estreita: um card por linha. */
@media (max-width: 900px) {
  .metodologia-ativo__cards {
    grid-template-columns: minmax(0, 1fr);
  }
}

.metodologia-ativo__card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem 1.15rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 16px;
  background: var(--p-content-background);
}

.metodologia-ativo__card-topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
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

/* Mais alto que o título de uma linha: as margens negativas evitam que ele afaste a descrição do título. */
.metodologia-ativo__botao {
  flex-shrink: 0;
  margin: -0.3rem 0 -0.4rem;
}

.metodologia-ativo__card-topo + .metodologia-ativo__objetivo {
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
