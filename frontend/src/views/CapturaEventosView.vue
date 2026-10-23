<script setup>
import { computed, onMounted, ref } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import AppShell from '../components/layout/AppShell.vue'
import capturaEventosService from '../services/captura-eventos.service.js'
import geopoliticaService from '../services/geopolitica.service.js'
import { useAuthStore } from '../stores/auth.js'
import { formatarData, rotuloTipo } from '../utils/geopolitica.js'
import { ATIVOS_CAPTURA, periodoPadrao, formatarPct, rotuloCaptura, rotuloRelevante, situacaoDaMeta } from '../utils/captura-eventos.js'

// Captura de eventos (ADR 0144; análise do café de 2026-10-19, item E2): o gabarito do teste de captura da leitura
// diária de eventos dos agrícolas. O FinMind gera os candidatos por gatilhos objetivos (relatórios publicados e
// movimentos grandes do preço; à parte, os alertas de fonte secundária), e uma pessoa julga: relevante ou não e, nos
// relevantes, se um evento aceito de uma leitura da janela (do dia até 2 dias úteis depois) o capturou. Gravar é só de
// admin; os outros veem o resultado.

const auth = useAuthStore()
const ehAdmin = computed(() => auth.state.user?.role === 'admin')

function hojeLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ativo = ref('CAFE')
const periodo = ref(periodoPadrao(hojeLocal()))
const loading = ref(true)
const errorMessage = ref('')
const itens = ref([])
const resumo = ref(null)
const criterio = ref(null)
const expandidos = ref({})
const mensagem = ref('')
const gerando = ref(false)

// Os eventos aceitos da janela de cada evento de referência, carregados ao expandir a linha.
const eventosDaJanela = ref({})

async function carregar() {
  loading.value = true
  errorMessage.value = ''
  try {
    const resposta = await capturaEventosService.listar({ ativo: ativo.value, ...periodo.value })
    itens.value = resposta.eventosReferencia
    resumo.value = resposta.resumo
    criterio.value = resposta.criterio
  } catch (err) {
    errorMessage.value = err?.response?.data?.error?.message || 'Não foi possível carregar os eventos de referência.'
  } finally {
    loading.value = false
  }
}

async function gerar() {
  gerando.value = true
  mensagem.value = ''
  try {
    const r = await capturaEventosService.gerarCandidatos({ ativo: ativo.value, ...periodo.value })
    const o = r.porOrigem
    mensagem.value = `${r.gerados} candidato(s) no período (${o.CALENDARIO} de relatório, ${o.PRECO} de preço, ${o.SECUNDARIA} de alerta); ${r.criados} novo(s). Os que já existiam ficaram como estavam.`
    await carregar()
  } catch (err) {
    mensagem.value = err?.response?.data?.error?.message || 'Não foi possível gerar os candidatos.'
  } finally {
    gerando.value = false
  }
}

// Troca a linha pela resposta da API e recarrega o resumo.
async function salvar(item, campos) {
  try {
    const { eventoReferencia } = await capturaEventosService.avaliar(item.id, campos)
    itens.value = itens.value.map((i) => (i.id === item.id ? eventoReferencia : i))
    const resposta = await capturaEventosService.listar({ ativo: ativo.value, ...periodo.value })
    resumo.value = resposta.resumo
  } catch (err) {
    mensagem.value = err?.response?.data?.error?.message || 'Não foi possível salvar a avaliação.'
  }
}

async function carregarJanela(item) {
  if (eventosDaJanela.value[item.id]) return
  eventosDaJanela.value = { ...eventosDaJanela.value, [item.id]: { loading: true, eventos: [] } }
  try {
    const { eventos } = await geopoliticaService.listarEventos({
      ativo: item.ativo,
      situacao: 'aceitos',
      dataInicio: item.janela.inicio,
      dataFim: item.janela.fim,
      tamanhoPagina: 200,
      ordem: 'ASC'
    })
    eventosDaJanela.value = { ...eventosDaJanela.value, [item.id]: { loading: false, eventos } }
  } catch (_err) {
    eventosDaJanela.value = { ...eventosDaJanela.value, [item.id]: { loading: false, eventos: [], erro: true } }
  }
}

const capturadoPor = (item, evento) => salvar(item, { captura: 'CAPTURADO', capturaEvento: { id: evento.id, data: evento.data, titulo: evento.titulo } })

// Observação: rascunho por linha, salvo no botão.
const rascunhos = ref({})
const rascunhoDe = (item) => rascunhos.value[item.id] ?? item.observacao ?? ''

// Adicionar à mão.
const novoAberto = ref(false)
const novo = ref({ data: '', titulo: '', observacao: '' })
const erroNovo = ref('')
function abrirNovo() {
  novo.value = { data: periodo.value.dataFim, titulo: '', observacao: '' }
  erroNovo.value = ''
  novoAberto.value = true
}
async function criarNovo() {
  try {
    await capturaEventosService.criarManual({ ativo: ativo.value, ...novo.value })
    novoAberto.value = false
    await carregar()
  } catch (err) {
    erroNovo.value = err?.response?.data?.error?.message || 'Não foi possível adicionar o evento.'
  }
}
async function removerManual(item) {
  if (!window.confirm(`Remover "${item.titulo}"?`)) return
  try {
    await capturaEventosService.remover(item.id)
    await carregar()
  } catch (err) {
    mensagem.value = err?.response?.data?.error?.message || 'Não foi possível remover.'
  }
}

const meta = computed(() => (resumo.value && criterio.value ? situacaoDaMeta(resumo.value, criterio.value) : null))
const relatoriosDoAtivo = computed(() => criterio.value?.ativos[ativo.value]?.relatorios || [])

function detalheDoItem(item) {
  const d = item.detalhe || {}
  if (item.origem === 'CALENDARIO') return d.dataEstimada ? 'data de publicação estimada pela regra da fonte' : null
  if (item.origem === 'SECUNDARIA') return d.fontes?.length ? `fonte: ${d.fontes.join(', ')}` : null
  return null
}

onMounted(carregar)
</script>

<template>
  <AppShell>
    <div class="captura">
      <header class="captura__cabecalho">
        <h1 class="captura__titulo"><i class="bi bi-bullseye"></i> Captura de eventos</h1>
        <p class="captura__subtitulo">
          O teste da leitura diária de eventos do milho, do café e da soja: dos eventos relevantes de um período de
          30 dias, quantos a leitura capturou. O FinMind sugere os candidatos; a relevância e a captura são julgadas por
          uma pessoa.
        </p>
      </header>

      <details v-if="criterio" class="captura__metodologia">
        <summary>Como funciona o teste</summary>
        <ol>
          <li>
            <strong>Candidatos, sem a IA de eventos.</strong> O dia de publicação de um relatório do ativo
            ({{ relatoriosDoAtivo.map((r) => r.nome).join('; ') }}) e o dia de movimento grande do preço no futuro
            {{ criterio.ativos[ativo]?.futuro.replace('B3.', '') }} da B3: o retorno no vencimento mais negociado,
            dentro do contrato, com |z| de {{ criterio.zMinimo }} ou mais contra os {{ criterio.janelaRetornos }}
            retornos anteriores. À parte, os alertas de fonte secundária da própria leitura: como vêm da IA, a captura
            deles é por construção, e o resumo mostra o percentual também sem eles. O que os gatilhos não pegam entra à
            mão.
          </li>
          <li>
            <strong>Relevante.</strong> Quem avalia diz se o fato importava para o preço. O não relevante sai da conta.
          </li>
          <li>
            <strong>Capturado.</strong> O fato aparece num evento aceito de uma leitura do ativo do dia dele até
            {{ criterio.diasUteisCaptura }} dias úteis depois (a leitura roda de madrugada). Ao abrir a linha, a tela
            mostra os eventos dessa janela.
          </li>
          <li>
            <strong>O critério.</strong> Num período de {{ criterio.periodoDias }} dias, pelo menos
            {{ criterio.metaPct }}% dos relevantes conferidos capturados. As leituras gravadas são as da época: um
            período passado mede a leitura como ela foi (antes de 21/10/2026, com o prompt anterior às mudanças do E2).
          </li>
        </ol>
        <p class="captura__nota">Decisão do Comitê (2026-10-22) e do usuário (2026-10-23), ADR 0144.</p>
      </details>

      <div class="tabela-card">
        <div class="tabela-card__filtros">
          <div>
            <label class="form-label small mb-1 d-block">Ativo</label>
            <select v-model="ativo" class="form-select form-select-sm" @change="carregar">
              <option v-for="a in ATIVOS_CAPTURA" :key="a.codigo" :value="a.codigo">{{ a.rotulo }}</option>
            </select>
          </div>
          <div>
            <label class="form-label small mb-1 d-block">De</label>
            <input v-model="periodo.dataInicio" type="date" class="form-control form-control-sm" @change="carregar" />
          </div>
          <div>
            <label class="form-label small mb-1 d-block">Até</label>
            <input v-model="periodo.dataFim" type="date" class="form-control form-control-sm" @change="carregar" />
          </div>
          <div v-if="ehAdmin" class="captura__acoes">
            <button type="button" class="btn btn-sm btn-primary" :disabled="gerando" @click="gerar">
              <i class="bi bi-magic"></i> {{ gerando ? 'Gerando...' : 'Gerar candidatos' }}
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" @click="abrirNovo"><i class="bi bi-plus-lg"></i> Adicionar evento</button>
          </div>
        </div>

        <p v-if="mensagem" class="captura__mensagem">{{ mensagem }}</p>

        <div v-if="loading" class="text-muted p-3">Carregando...</div>
        <div v-else-if="errorMessage" class="alert alert-danger m-3">{{ errorMessage }}</div>
        <template v-else>
          <div v-if="resumo" class="captura__resumo">
            <div class="captura__quadro">
              <span>Candidatos</span>
              <strong>{{ resumo.total }}</strong>
              <small>{{ resumo.pendentes }} a avaliar</small>
            </div>
            <div class="captura__quadro">
              <span>Relevantes</span>
              <strong>{{ resumo.relevantes }}</strong>
              <small>{{ resumo.semConferencia }} a conferir</small>
            </div>
            <div class="captura__quadro" :class="`captura__quadro--${meta?.classe}`">
              <span>Captura</span>
              <strong>{{ formatarPct(resumo.pctCaptura) }}</strong>
              <small>{{ resumo.capturados }} de {{ resumo.capturados + resumo.naoCapturados }} conferidos · meta {{ criterio.metaPct }}%</small>
            </div>
            <div class="captura__quadro">
              <span>Sem os alertas</span>
              <strong>{{ formatarPct(resumo.semSecundaria.pctCaptura) }}</strong>
              <small>{{ resumo.semSecundaria.capturados }} de {{ resumo.semSecundaria.capturados + resumo.semSecundaria.naoCapturados }}: só os gatilhos sem a IA e os manuais</small>
            </div>
          </div>
          <p v-if="meta" class="captura__meta" :class="`captura__meta--${meta.classe}`">{{ meta.texto }}</p>

          <DataTable v-model:expanded-rows="expandidos" :value="itens" data-key="id" class="tabela-paginada" @row-expand="(e) => carregarJanela(e.data)">
            <template #empty>Nenhum evento de referência no período. {{ ehAdmin ? 'Gere os candidatos.' : '' }}</template>
            <Column expander style="width: 3rem" />
            <Column field="data" header="Data">
              <template #body="{ data }">{{ formatarData(data.data) }}</template>
            </Column>
            <Column header="Origem">
              <template #body="{ data }"><span class="captura__origem" :class="`captura__origem--${data.origem.toLowerCase()}`">{{ data.origemRotulo }}</span></template>
            </Column>
            <Column header="Evento">
              <template #body="{ data }">
                <div>{{ data.titulo }}</div>
                <small v-if="detalheDoItem(data)" class="text-muted">{{ detalheDoItem(data) }}</small>
              </template>
            </Column>
            <Column header="Relevante">
              <template #body="{ data }">
                <div v-if="ehAdmin" class="btn-group btn-group-sm" role="group" aria-label="Relevante">
                  <button type="button" class="btn" :class="data.relevante === true ? 'btn-success' : 'btn-outline-secondary'" @click="salvar(data, { relevante: true })">Sim</button>
                  <button type="button" class="btn" :class="data.relevante === false ? 'btn-secondary' : 'btn-outline-secondary'" @click="salvar(data, { relevante: false })">Não</button>
                </div>
                <span v-else>{{ rotuloRelevante(data.relevante) }}</span>
              </template>
            </Column>
            <Column header="Captura">
              <template #body="{ data }">
                <span :class="`captura__situacao captura__situacao--${(data.captura || 'nenhuma').toLowerCase()}`">{{ rotuloCaptura(data) }}</span>
                <small v-if="data.capturaEvento" class="d-block text-muted" :title="data.capturaEvento.titulo">
                  em {{ formatarData(data.capturaEvento.data) }}: {{ data.capturaEvento.titulo }}
                </small>
              </template>
            </Column>

            <template #expansion="{ data }">
              <div class="captura__expansao">
                <p class="captura__janela">
                  Eventos aceitos do {{ ATIVOS_CAPTURA.find((a) => a.codigo === data.ativo)?.rotulo.toLowerCase() }} nas leituras de
                  {{ formatarData(data.janela.inicio) }} a {{ formatarData(data.janela.fim) }}:
                </p>
                <div v-if="eventosDaJanela[data.id]?.loading" class="text-muted small">Carregando...</div>
                <div v-else-if="eventosDaJanela[data.id]?.erro" class="text-danger small">Não foi possível carregar os eventos da janela.</div>
                <ul v-else-if="eventosDaJanela[data.id]?.eventos.length" class="captura__eventos">
                  <li v-for="e in eventosDaJanela[data.id].eventos" :key="e.id" :class="{ 'captura__evento--escolhido': data.capturaEvento?.id === e.id }">
                    <span class="text-muted">{{ formatarData(e.data) }} · {{ rotuloTipo(e.tipo) }}</span>
                    <span>{{ e.titulo }}</span>
                    <button
                      v-if="ehAdmin && data.relevante === true"
                      type="button"
                      class="btn btn-sm btn-outline-success"
                      :disabled="data.capturaEvento?.id === e.id"
                      @click="capturadoPor(data, e)"
                    >
                      Capturou
                    </button>
                  </li>
                </ul>
                <p v-else class="text-muted small">Nenhum evento aceito do ativo nessa janela.</p>

                <div v-if="ehAdmin" class="captura__edicao">
                  <button
                    v-if="data.relevante === true"
                    type="button"
                    class="btn btn-sm"
                    :class="data.captura === 'NAO_CAPTURADO' ? 'btn-danger' : 'btn-outline-danger'"
                    @click="salvar(data, { captura: 'NAO_CAPTURADO' })"
                  >
                    Não capturado
                  </button>
                  <span v-else class="text-muted small">Marque como relevante para conferir a captura.</span>
                  <textarea
                    :value="rascunhoDe(data)"
                    class="form-control form-control-sm"
                    rows="2"
                    placeholder="Observação (opcional)"
                    @input="(e) => (rascunhos[data.id] = e.target.value)"
                  ></textarea>
                  <button type="button" class="btn btn-sm btn-outline-secondary" @click="salvar(data, { observacao: rascunhoDe(data) })">Salvar observação</button>
                  <button v-if="data.origem === 'MANUAL'" type="button" class="btn btn-sm btn-link text-danger" @click="removerManual(data)">Remover</button>
                </div>
                <p v-else-if="data.observacao" class="small mb-0">Observação: {{ data.observacao }}</p>
              </div>
            </template>
          </DataTable>
        </template>
      </div>

      <Dialog v-model:visible="novoAberto" modal header="Adicionar evento de referência" :style="{ width: '32rem' }" :breakpoints="{ '640px': '95vw' }">
        <div class="captura__novo">
          <p class="small text-muted mb-0">Um fato relevante que os gatilhos não pegaram. Entra como relevante.</p>
          <label class="form-label small mb-0">Data em que o fato foi público</label>
          <input v-model="novo.data" type="date" class="form-control form-control-sm" />
          <label class="form-label small mb-0">O fato</label>
          <input v-model="novo.titulo" type="text" maxlength="300" class="form-control form-control-sm" placeholder="Ex.: Federação de Cafeteiros revisa a safra colombiana" />
          <label class="form-label small mb-0">Observação</label>
          <textarea v-model="novo.observacao" rows="2" class="form-control form-control-sm"></textarea>
          <div v-if="erroNovo" class="text-danger small">{{ erroNovo }}</div>
        </div>
        <template #footer>
          <Button label="Cancelar" text @click="novoAberto = false" />
          <Button label="Adicionar" @click="criarNovo" />
        </template>
      </Dialog>
    </div>
  </AppShell>
</template>

<style scoped>
.captura__cabecalho {
  margin-bottom: 1rem;
}

.captura__titulo {
  font-size: 1.4rem;
  font-weight: 600;
}

.captura__subtitulo,
.captura__nota {
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
  max-width: 60rem;
}

.captura__metodologia {
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 12px;
  background: var(--p-content-background);
  font-size: 0.88rem;
  line-height: 1.5;
}

.captura__metodologia summary {
  font-weight: 600;
  cursor: pointer;
}

.captura__metodologia ol {
  margin: 0.6rem 0 0.4rem;
  padding-left: 1.2rem;
}

.captura__acoes {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
  margin-left: auto;
}

.captura__mensagem {
  margin: 0;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
}

.captura__resumo {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  padding: 0.75rem 1rem 0;
}

@media (max-width: 900px) {
  .captura__resumo {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.captura__quadro {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid rgba(19, 33, 59, 0.08);
  border-radius: 10px;
  background: rgba(19, 33, 59, 0.025);
  font-size: 0.8rem;
}

.captura__quadro strong {
  font-size: 1.1rem;
  font-variant-numeric: tabular-nums;
}

.captura__quadro small {
  color: var(--p-text-muted-color);
}

.captura__quadro--atinge {
  border-color: rgba(20, 108, 67, 0.35);
  background: rgba(20, 108, 67, 0.06);
}

.captura__quadro--abaixo {
  border-color: rgba(214, 60, 60, 0.35);
  background: rgba(214, 60, 60, 0.06);
}

.captura__quadro--parcial {
  border-color: rgba(211, 154, 23, 0.4);
  background: rgba(211, 154, 23, 0.07);
}

.captura__meta {
  margin: 0.5rem 1rem;
  font-size: 0.85rem;
}

.captura__meta--atinge {
  color: #146c43;
}

.captura__meta--abaixo {
  color: #b02a37;
}

.captura__meta--parcial {
  color: #8a5f00;
}

.captura__origem {
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(17, 102, 255, 0.08);
  color: #0d4fc4;
  font-size: 0.72rem;
  white-space: nowrap;
}

.captura__origem--preco {
  background: rgba(111, 66, 193, 0.1);
  color: #5a32a3;
}

.captura__origem--secundaria {
  background: rgba(211, 154, 23, 0.15);
  color: #8a5f00;
}

.captura__origem--manual {
  background: rgba(19, 33, 59, 0.08);
  color: inherit;
}

.captura__situacao--capturado {
  color: #146c43;
  font-weight: 600;
}

.captura__situacao--nao_capturado {
  color: #b02a37;
  font-weight: 600;
}

.captura__expansao {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
}

.captura__janela {
  margin: 0;
  font-weight: 600;
}

.captura__eventos {
  margin: 0;
  padding: 0;
  list-style: none;
}

.captura__eventos li {
  display: grid;
  grid-template-columns: 11rem minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.3rem 0;
  border-bottom: 1px solid rgba(19, 33, 59, 0.06);
}

@media (max-width: 700px) {
  .captura__eventos li {
    grid-template-columns: minmax(0, 1fr);
  }
}

.captura__evento--escolhido {
  background: rgba(20, 108, 67, 0.06);
}

.captura__edicao {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: flex-start;
}

.captura__edicao textarea {
  flex: 1 1 18rem;
}

.captura__novo {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
</style>
