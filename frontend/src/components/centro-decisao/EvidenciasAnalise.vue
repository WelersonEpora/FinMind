<script setup>
import { computed, ref } from 'vue'
import Dialog from 'primevue/dialog'
import NivelBadge from '../eventos/NivelBadge.vue'
import centroDecisaoService from '../../services/centro-decisao.service.js'
import { formatarData } from '../../utils/geopolitica.js'
import { formatarValor, formatarVariacao } from '../../utils/centro-decisao.js'
import { formatarMedida } from '../../utils/metodologia.js'
import { contarEventos, faltaNoFator, idadeDoDado, leituraDoFator, rotuloDias, rotuloMedida } from '../../utils/analise-diaria.js'

// Evidências analisadas pelo FinMind (ADR 0052): o que formou o prompt da leitura de tendência da data, lido da leitura
// GRAVADA (nada é recalculado agora). O card resume (preço, cada fator com a leitura do motor, lacunas); "Ver detalhes"
// abre a tabela completa e, no mesmo modal, "Ver prompt completo" mostra o texto exato enviado à IA e a resposta dela,
// carregados só ao abrir.
const props = defineProps({
  analise: { type: Object, required: true },
  ativoCodigo: { type: String, required: true },
  ativoNome: { type: String, required: true }
})

const evidencias = computed(() => props.analise.evidencias || { fatores: [], lacunas: [] })
const calculados = computed(() => evidencias.value.fatores.filter((f) => f.tipo === 'CALCULADO').length)
const deEvento = computed(() => evidencias.value.fatores.filter((f) => f.tipo === 'EVENTO').length)

// O card mostra os primeiros fatores (na ordem do catálogo: os de peso alto vêm antes); a lista completa fica no detalhe.
const FATORES_NO_CARD = 4
const fatoresDoCard = computed(() => evidencias.value.fatores.slice(0, FATORES_NO_CARD))
const fatoresSoNoDetalhe = computed(() => Math.max(evidencias.value.fatores.length - FATORES_NO_CARD, 0))

function variacao(v) {
  return formatarVariacao(v.percentual)
}

// --- Um modal só, com duas vistas: os detalhes e o prompt enviado (trocar o conteúdo, não abrir um modal sobre outro).
const detalhesVisivel = ref(false)
const vista = ref('detalhes')
const tituloDoModal = computed(() =>
  vista.value === 'prompt'
    ? `Prompt enviado em ${formatarData(props.analise.data)}`
    : `Evidências da leitura de ${formatarData(props.analise.data)}`
)

function abrirDetalhes() {
  vista.value = 'detalhes'
  detalhesVisivel.value = true
}

// O nível da leitura de eventos do dia é do ATIVO (o mesmo nos dois fatores de evento): aparece uma vez, abaixo da tabela.
const nivelDoDia = computed(
  () => evidencias.value.fatores.find((f) => f.tipo === 'EVENTO' && f.ultimaLeitura?.nivel)?.ultimaLeitura || null
)

function descreverParametros(parametros) {
  if (!parametros) return '-'
  return Object.entries(parametros)
    .map(([chave, valor]) => `${chave}: ${valor}`)
    .join(' · ')
}

// --- Prompt enviado (sob demanda)
const carregandoPrompt = ref(false)
const erroPrompt = ref('')
const enviada = ref(null)
const aba = ref('prompt')
const copiado = ref(false)

const ABAS = [
  { codigo: 'prompt', rotulo: 'Prompt do dia', campo: 'prompt' },
  {
    codigo: 'instrucao',
    rotulo: 'Instrução do sistema',
    campo: 'instrucaoDoSistema'
  },
  { codigo: 'resposta', rotulo: 'Resposta da IA', campo: 'respostaBruta' }
]

const textoDaAba = computed(() => {
  if (!enviada.value) return ''
  const campo = ABAS.find((a) => a.codigo === aba.value).campo
  if (campo !== 'respostaBruta') return enviada.value[campo]
  try {
    return JSON.stringify(JSON.parse(enviada.value.respostaBruta), null, 2)
  } catch {
    return enviada.value.respostaBruta
  }
})

async function abrirPrompt() {
  vista.value = 'prompt'
  aba.value = 'prompt'
  if (enviada.value?.data === props.analise.data) return
  carregandoPrompt.value = true
  erroPrompt.value = ''
  try {
    const { analiseEnviada } = await centroDecisaoService.getAnaliseEnviada(props.ativoCodigo, props.analise.data)
    enviada.value = analiseEnviada
  } catch (err) {
    enviada.value = null
    erroPrompt.value = err?.response?.data?.error?.message || 'Não foi possível carregar o prompt enviado.'
  } finally {
    carregandoPrompt.value = false
  }
}

async function copiar() {
  try {
    await navigator.clipboard.writeText(textoDaAba.value)
    copiado.value = true
    setTimeout(() => {
      copiado.value = false
    }, 2000)
  } catch {
    erroPrompt.value = 'Não foi possível copiar: selecione e copie manualmente.'
  }
}
</script>

<template>
  <article class="evidencias">
    <header class="evidencias__topo">
      <span class="evidencias__icone"><i class="bi bi-clipboard-data"></i></span>
      <div class="evidencias__titulos">
        <h2>Evidências analisadas pelo FinMind</h2>
        <p v-if="analise.disponivel">
          O que formou o prompt da leitura de {{ formatarData(analise.data) }}: {{ evidencias.fatores.length }} fatores ({{
            calculados
          }}
          calculados, {{ deEvento }} de evento)<template v-if="evidencias.lacunas.length">
            · {{ evidencias.lacunas.length }} {{ evidencias.lacunas.length === 1 ? 'lacuna' : 'lacunas' }}</template
          >
        </p>
      </div>
    </header>

    <div v-if="!analise.disponivel" class="evidencias__vazia">
      <i class="bi bi-inbox"></i>
      <p>Sem leitura de tendência em {{ formatarData(analise.data) }}: nenhum prompt foi enviado nesta data.</p>
    </div>

    <template v-else>
      <section v-if="evidencias.preco" class="evidencias__preco">
        <span class="evidencias__preco-valor">
          {{ evidencias.preco.serie }}
          <strong>US$ {{ formatarValor(evidencias.preco.valor) }}</strong> <span class="text-muted">em {{ formatarData(evidencias.preco.dataReferencia) }}</span>
        </span>
        <span class="evidencias__variacoes">
          <span v-for="v in evidencias.preco.variacoes" :key="v.horizonte" class="evidencias__variacao">
            <span class="text-muted">{{ v.dias }}d</span>
            <span v-if="variacao(v)" :class="`var--${variacao(v).direcao}`">{{ variacao(v).texto }}</span>
            <span v-else class="text-muted">-</span>
          </span>
        </span>
      </section>

      <ul class="evidencias__fatores">
        <li v-for="fator in fatoresDoCard" :key="fator.codigo" class="fator">
          <span class="fator__nome" :title="fator.nome">{{ fator.nome }}</span>
          <span class="fator__peso" :class="`fator__peso--${(fator.peso || '').toLowerCase()}`">{{ fator.peso }}</span>
          <span class="fator__leitura">
            <span v-if="faltaNoFator(fator.situacao)" class="fator__falta">{{ faltaNoFator(fator.situacao) }}</span>
            <span v-else-if="fator.tipo === 'EVENTO'" class="fator__evento">
              <i class="bi bi-lightning-charge"></i>
              {{ contarEventos(fator.eventos) }} em {{ fator.janelaDias }} dias
            </span>
            <span
              v-else-if="leituraDoFator(fator.leitura)"
              :class="`fator__pressao fator__pressao--${leituraDoFator(fator.leitura).classe}`"
            >
              <i class="bi" :class="leituraDoFator(fator.leitura).icone"></i>
              {{ leituraDoFator(fator.leitura).texto }}
            </span>
            <span v-else class="text-muted">-</span>
          </span>
        </li>
      </ul>

      <p v-if="evidencias.lacunas.length" class="evidencias__lacunas">
        <i class="bi bi-exclamation-circle"></i>
        Lacunas: {{ evidencias.lacunas.map((l) => l.descricao).join('; ') }}.
      </p>

      <footer class="evidencias__acoes">
        <span v-if="fatoresSoNoDetalhe" class="text-muted">
          e mais {{ fatoresSoNoDetalhe }} {{ fatoresSoNoDetalhe === 1 ? 'fator' : 'fatores' }} no detalhe
        </span>
        <button type="button" class="evidencias__abrir" @click="abrirDetalhes">Ver detalhes <i class="bi bi-arrow-right-short"></i></button>
      </footer>
    </template>

    <!-- Detalhes (a tabela completa do que foi ao prompt) e, no mesmo modal, o prompt enviado e a resposta. -->
    <Dialog v-model:visible="detalhesVisivel" modal :header="tituloDoModal" :style="{ width: '72rem' }" :breakpoints="{ '1200px': '95vw' }">
      <div v-if="analise.disponivel && vista === 'detalhes'" class="detalhes modal-vista">
        <div class="detalhes__topo">
          <button type="button" class="btn btn-outline-primary btn-sm" @click="abrirPrompt">
            <i class="bi bi-file-earmark-text"></i> Ver prompt completo
          </button>
          <span class="text-muted small">
            Como foram enviados à IA, gravados com a leitura: um parâmetro alterado depois não muda esta tabela.
          </span>
        </div>

        <h4>Preço de referência</h4>
        <p v-if="evidencias.preco" class="small">
          {{ evidencias.preco.serie }} US$ {{ formatarValor(evidencias.preco.valor) }} em
          {{ formatarData(evidencias.preco.dataReferencia) }}, publicado em
          {{ formatarData((evidencias.preco.publicadoEm || '').slice(0, 10))
          }}{{ evidencias.preco.publicadoEmEstimado ? ' (data estimada)' : '' }}.
          {{
            evidencias.referenciaHorizontes === 'DATA_DA_ANALISE'
              ? `Os horizontes contam da data da leitura (${formatarData(analise.data)}); o preço depois deste é desconhecido para a IA.`
              : 'Os horizontes contam desta data.'
          }}
        </p>
        <p v-else class="small text-muted">Sem preço de referência na data.</p>

        <h4>Horizontes e faixas</h4>
        <div class="table-responsive">
          <table class="table table-sm detalhes__tabela">
            <thead>
              <tr>
                <th>Horizonte</th>
                <th>Variação do preço até a data</th>
                <th>T1</th>
                <th>T2</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in analise.horizontes" :key="h.codigo">
                <td>{{ h.rotulo }} ({{ rotuloDias(h.dias) }})</td>
                <td>
                  <template v-if="evidencias.preco">
                    {{ variacao(evidencias.preco.variacoes.find((v) => v.horizonte === h.codigo))?.texto || '-' }}
                  </template>
                  <template v-else>-</template>
                </td>
                <td>{{ h.t1 != null ? `${h.t1}%` : '-' }}</td>
                <td>{{ h.t2 != null ? `${h.t2}%` : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4>Fatores</h4>
        <div class="table-responsive">
          <table class="table table-sm align-middle detalhes__tabela">
            <thead>
              <tr>
                <th>Fator</th>
                <th>Leitura do motor</th>
                <th>Medida</th>
                <th>Dado usado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="fator in evidencias.fatores" :key="fator.codigo">
                <td :title="fator.codigo">
                  <span class="detalhes__fator">{{ fator.nome }}</span>
                  <span class="fator__peso" :class="`fator__peso--${(fator.peso || '').toLowerCase()}`"
                    >Peso {{ (fator.peso || '').toLowerCase() }}</span
                  >
                </td>
                <td>
                  <span v-if="faltaNoFator(fator.situacao)" class="fator__falta">{{ faltaNoFator(fator.situacao) }}</span>
                  <span v-else-if="fator.tipo === 'EVENTO'" class="pilula pilula--evento">
                    <i class="bi bi-lightning-charge"></i>
                    {{ contarEventos(fator.eventos) }} em {{ fator.janelaDias }} dias
                  </span>
                  <template v-else-if="leituraDoFator(fator.leitura)">
                    <span class="pilula" :class="`pilula--${leituraDoFator(fator.leitura).classe}`">
                      <i class="bi" :class="leituraDoFator(fator.leitura).icone"></i>
                      {{ leituraDoFator(fator.leitura).texto }}
                    </span>
                    <span v-if="leituraDoFator(fator.leitura).tendencia" class="detalhes__sub">
                      Tendência: {{ leituraDoFator(fator.leitura).tendencia }}
                    </span>
                  </template>
                  <span v-else class="text-muted">-</span>
                </td>
                <td>
                  <template v-if="fator.medida">
                    <span class="detalhes__sub">{{ rotuloMedida(fator.medida.rotulo) }}</span>
                    <strong class="detalhes__numero">{{ formatarMedida(fator.medida.valor, fator.medida.unidade) }}</strong>
                  </template>
                  <span v-else-if="fator.tipo === 'EVENTO'" class="detalhes__sub">Eventos da leitura diária, sem cálculo</span>
                  <span v-else class="text-muted">-</span>
                </td>
                <td>
                  <span v-if="fator.situacao === 'SEM_DADO'" class="text-muted">Sem dado até a data</span>
                  <template v-else-if="fator.dataReferencia">
                    <strong>{{ formatarData(fator.dataReferencia) }}</strong>
                    <span class="detalhes__sub">
                      {{ idadeDoDado(fator.idadeDias) }}<template v-if="fator.situacao === 'ESTIMADO'"> · publicação estimada</template>
                    </span>
                  </template>
                  <template v-else-if="fator.ultimaLeitura">
                    <strong>{{ formatarData(fator.ultimaLeitura.data) }}</strong>
                    <span class="detalhes__sub">leitura de eventos</span>
                  </template>
                  <span v-else class="text-muted">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="nivelDoDia" class="detalhes__nota">
          Nível do {{ ativoNome.toLowerCase() }} na leitura de eventos de {{ formatarData(nivelDoDia.data) }}:
          <NivelBadge :codigo="nivelDoDia.nivel" />
          <span class="text-muted">(vale para o ativo, não para um fator).</span>
        </p>

        <details class="detalhes__tecnico">
          <summary>Detalhes técnicos: cálculo e parâmetros de cada fator</summary>
          <ul>
            <li v-for="fator in evidencias.fatores" :key="fator.codigo">
              <strong>{{ fator.nome }}</strong> <code>{{ fator.codigo }}</code
              >:
              <template v-if="fator.factorId">
                <code>{{ fator.factorId }} v{{ fator.factorVersion }}</code> ·
                {{ descreverParametros(fator.parametros) }}
              </template>
              <template v-else-if="fator.tipo === 'EVENTO'">fator de evento, janela de {{ fator.janelaDias }} dias</template>
              <template v-else>-</template>
            </li>
          </ul>
        </details>

        <template v-if="evidencias.lacunas.length">
          <h4>Lacunas</h4>
          <ul class="small mb-0">
            <li v-for="(lacuna, i) in evidencias.lacunas" :key="i">
              {{ lacuna.descricao }}
            </li>
          </ul>
        </template>
      </div>

      <div v-else-if="vista === 'prompt'" class="prompt modal-vista">
        <div class="detalhes__topo">
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="vista = 'detalhes'">
            <i class="bi bi-arrow-left"></i> Voltar aos detalhes
          </button>
        </div>
        <div v-if="carregandoPrompt" class="text-muted">Carregando...</div>
        <div v-else-if="erroPrompt && !enviada" class="alert alert-danger mb-0">
          {{ erroPrompt }}
        </div>
        <template v-else-if="enviada">
          <div v-if="erroPrompt" class="alert alert-danger py-2">
            {{ erroPrompt }}
          </div>
          <p class="prompt__info">
            {{ enviada.modelo }} (chave {{ enviada.chave
            }}<template v-if="enviada.tokens">, {{ enviada.tokens.toLocaleString('pt-BR') }} tokens</template>) · prompt
            {{ enviada.versaoPrompt }} · metodologia {{ enviada.versaoMetodologia }} · configuração v{{ enviada.versaoConfiguracao }} · hash
            {{ enviada.hashEntrada.slice(0, 12) }}
          </p>
          <div class="prompt__barra">
            <div class="btn-group btn-group-sm" role="tablist">
              <button
                v-for="a in ABAS"
                :key="a.codigo"
                type="button"
                role="tab"
                class="btn"
                :class="aba === a.codigo ? 'btn-primary' : 'btn-outline-primary'"
                :aria-selected="aba === a.codigo"
                @click="aba = a.codigo"
              >
                {{ a.rotulo }}
              </button>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm" @click="copiar">
              <i class="bi" :class="copiado ? 'bi-check2' : 'bi-clipboard'"></i>
              {{ copiado ? 'Copiado' : 'Copiar' }}
            </button>
          </div>
          <pre class="prompt__texto">{{ textoDaAba }}</pre>
        </template>
      </div>
    </Dialog>
  </article>
</template>

<style scoped>
.evidencias {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-300);
  border-radius: 16px;
  background: var(--p-content-background);
  overflow: hidden;
}

.evidencias__topo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 1.15rem;
  padding: 1rem 0 0.8rem;
  border-bottom: 1px solid var(--p-content-border-color);
}
.evidencias__icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 2.4rem;
  height: 2.4rem;
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.1);
  color: #1d4ed8;
  font-size: 1.1rem;
}
.evidencias__titulos {
  min-width: 0;
}
.evidencias__titulos h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}
.evidencias__titulos p {
  margin: 0.1rem 0 0;
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
}

.evidencias__vazia {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem 1.5rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}
.evidencias__vazia > i {
  font-size: 1.6rem;
}
.evidencias__vazia p {
  margin: 0;
}

.evidencias__preco {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
  margin: 0.75rem 1.15rem 0;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  background: var(--p-content-hover-background);
  font-size: 0.82rem;
}
.evidencias__variacoes {
  display: flex;
  gap: 0.75rem;
}
.evidencias__variacao {
  display: inline-flex;
  gap: 0.25rem;
  font-variant-numeric: tabular-nums;
}
.var--alta {
  color: #15803d;
}
.var--queda {
  color: #b91c1c;
}

.evidencias__fatores {
  list-style: none;
  margin: 0;
  padding: 0.5rem 1.15rem 0;
}
.fator {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.6rem;
  padding: 0.32rem 0;
  border-bottom: 1px dashed var(--p-content-border-color);
  font-size: 0.8rem;
}
.fator:last-child {
  border-bottom: 0;
}
.fator__nome {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fator__peso {
  padding: 0 0.4rem;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  background: var(--p-content-hover-background);
}
.fator__peso--alto {
  color: #1d4ed8;
  background: rgba(59, 130, 246, 0.1);
}
.fator__leitura {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
  min-width: 11rem;
  text-align: right;
}
.fator__pressao {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-weight: 600;
}
.fator__pressao--alta {
  color: #15803d;
}
.fator__pressao--baixa {
  color: #b91c1c;
}
.fator__pressao--lateral {
  color: #475569;
}
.fator__falta {
  padding: 0 0.45rem;
  border: 1px dashed var(--p-surface-300);
  border-radius: 999px;
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
}

.evidencias__lacunas {
  margin: 0.6rem 1.15rem 0;
  font-size: 0.75rem;
  color: #92400e;
}

.evidencias__acoes {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-top: auto;
  padding: 0.6rem 1.15rem 0.9rem;
  font-size: 0.75rem;
}
/* Como o "Ver detalhe" dos cards dos horizontes: um link com seta, no canto de baixo. */
.evidencias__abrir {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-primary-color);
  cursor: pointer;
}
.evidencias__abrir:hover,
.evidencias__abrir:focus-visible {
  text-decoration: underline;
}
/* As duas vistas com a mesma altura mínima: trocar de uma para a outra não faz o modal pular. */
.modal-vista {
  min-height: 65vh;
}
.detalhes__topo {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}

.detalhes h4 {
  margin: 1rem 0 0.4rem;
  font-size: 0.9rem;
  font-weight: 700;
}
.detalhes__tabela {
  font-size: 0.8rem;
}
.detalhes__tabela th {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}
.detalhes__tabela td {
  padding-top: 0.55rem;
  padding-bottom: 0.55rem;
}
.detalhes__fator {
  display: block;
  font-weight: 600;
}
.detalhes__sub {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.72rem;
  color: var(--p-text-muted-color);
}
.detalhes__numero {
  font-variant-numeric: tabular-nums;
}
.detalhes__nota {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
}
.detalhes__tecnico {
  margin-top: 1rem;
  font-size: 0.78rem;
}
.detalhes__tecnico summary {
  cursor: pointer;
  color: var(--p-text-muted-color);
}
.detalhes__tecnico ul {
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
}
.detalhes__tecnico code {
  font-size: 0.7rem;
}

/* A leitura do motor como etiqueta colorida, como no card. */
.pilula {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.55rem;
  border: 1px solid;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.pilula--alta {
  color: #15803d;
  border-color: rgba(34, 197, 94, 0.35);
  background: rgba(34, 197, 94, 0.1);
}
.pilula--baixa {
  color: #b91c1c;
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.1);
}
.pilula--lateral {
  color: #475569;
  border-color: rgba(100, 116, 139, 0.35);
  background: rgba(100, 116, 139, 0.1);
}
.pilula--evento {
  color: #6d28d9;
  border-color: rgba(139, 92, 246, 0.35);
  background: rgba(139, 92, 246, 0.1);
}
.fator__evento {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-weight: 600;
  color: #6d28d9;
}

.prompt {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.prompt__info {
  margin: 0;
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
}
.prompt__barra {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.prompt__texto {
  margin: 0;
  padding: 0.85rem;
  max-height: 65vh;
  overflow: auto;
  white-space: pre-wrap;
  border-radius: 8px;
  background: rgba(19, 33, 59, 0.05);
  font-size: 0.78rem;
  line-height: 1.5;
}
</style>
