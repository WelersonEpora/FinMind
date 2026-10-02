<script setup>
import { onMounted, ref, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import AppShell from '../components/layout/AppShell.vue'
import EventoDetalhe from '../components/eventos/EventoDetalhe.vue'
import PressaoIndicador from '../components/eventos/PressaoIndicador.vue'
import geopoliticaService from '../services/geopolitica.service.js'
import { rotuloAtivo, rotuloGrau, formatarData, rotuloTipo, TIPOS, ATIVOS } from '../utils/geopolitica.js'

// Tela Eventos (ADRs 0047 e 0049): os eventos de mercado que a leitura diária encontrou e entregou como contexto ao
// prompt de cada ativo (ouro, petróleo, milho e café). Só leitura: os eventos aceitos (os que vão ao Motor), um por
// linha, expandíveis, com filtro por ativo, tipo e período. O nível e o resumo do dia de cada ativo ficam no Centro de
// Decisão (ADR 0048); aqui a última leitura só alimenta a metodologia (modelo e versão do prompt). Os rejeitados (sem
// página de fonte autorizada ligada ao evento) não aparecem aqui: ficam no detalhe da execução, na tela Execuções.

const OPCOES_LINHAS_POR_PAGINA = [25, 50, 100, 200]
const OPCOES_ATIVO = [{ valor: '', rotulo: 'Todos' }, ...Object.entries(ATIVOS).map(([valor, rotulo]) => ({ valor, rotulo }))]

const leitura = ref(null)
const fontesConfiaveis = ref(null)

const eventos = ref([])
const totalEventos = ref(0)
const eventosExpandidos = ref({})
const paginaAtual = ref(1)
const tamanhoPagina = ref(OPCOES_LINHAS_POR_PAGINA[0])
const ordem = ref('DESC')
const carregando = ref(true)
const errorMessage = ref('')

const ativoFiltro = ref('')
const tipoFiltro = ref('')
const dataInicioFiltro = ref('')
const dataFimFiltro = ref('')

async function carregarLeitura() {
  try {
    const resposta = await geopoliticaService.getUltimaLeitura()
    leitura.value = resposta.leitura
    fontesConfiaveis.value = resposta.fontesConfiaveis
  } catch (_err) {
    leitura.value = null
  }
}

async function carregar() {
  carregando.value = true
  errorMessage.value = ''
  try {
    const resultado = await geopoliticaService.listarEventos({
      ativo: ativoFiltro.value || undefined,
      tipo: tipoFiltro.value || undefined,
      // Só os aceitos (o que vai ao Motor); os rejeitados aparecem no detalhe da execução, na tela Execuções.
      situacao: 'aceitos',
      dataInicio: dataInicioFiltro.value || undefined,
      dataFim: dataFimFiltro.value || undefined,
      pagina: paginaAtual.value,
      tamanhoPagina: tamanhoPagina.value,
      ordem: ordem.value
    })
    eventos.value = resultado.eventos
    totalEventos.value = resultado.paginacao.total
  } catch (_err) {
    errorMessage.value = 'Não foi possível carregar os eventos.'
  } finally {
    carregando.value = false
  }
}

// Modal "Prompt e resposta da IA": o mesmo para todos os eventos da leitura do dia (uma chamada à IA gera vários
// eventos). Carregado na primeira abertura e guardado por leitura.
const detalheIaAberto = ref(false)
const detalheIa = ref(null)
const carregandoDetalheIa = ref(false)
const erroDetalheIa = ref('')
const cacheDetalheIa = {}

const formatadorDataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

async function abrirDetalheIa(evento) {
  detalheIaAberto.value = true
  erroDetalheIa.value = ''
  if (cacheDetalheIa[evento.leituraId]) {
    detalheIa.value = cacheDetalheIa[evento.leituraId]
    return
  }
  detalheIa.value = null
  carregandoDetalheIa.value = true
  try {
    const { detalheIa: detalhe } = await geopoliticaService.getDetalheIa(evento.leituraId)
    cacheDetalheIa[evento.leituraId] = detalhe
    detalheIa.value = detalhe
  } catch (_err) {
    erroDetalheIa.value = 'Não foi possível carregar o prompt e a resposta da IA.'
  } finally {
    carregandoDetalheIa.value = false
  }
}

function atualizarTudo() {
  carregarLeitura()
  carregar()
}

watch([ativoFiltro, tipoFiltro, dataInicioFiltro, dataFimFiltro, tamanhoPagina], () => {
  paginaAtual.value = 1
  carregar()
})

function onPage(evento) {
  paginaAtual.value = evento.page + 1
  carregar()
}

function onSort(evento) {
  ordem.value = evento.sortOrder === 1 ? 'ASC' : 'DESC'
  paginaAtual.value = 1
  carregar()
}

onMounted(atualizarTudo)
</script>

<template>
  <AppShell>
    <div class="eventos">
      <header class="eventos__cabecalho">
        <h1 class="eventos__titulo"><i class="bi bi-globe2"></i> Eventos</h1>
        <p class="eventos__subtitulo">
          Eventos de mercado do ouro, do petróleo, do milho e do café: fatos externos relevantes para o preço que os
          dados coletados ainda não mostram, encontrados por IA com busca só em fontes autorizadas. São contexto para a
          análise de cada ativo, ao lado dos observáveis.
        </p>
      </header>


      <!-- Mesmo formato da seção "Fonte e metodologia" do detalhe de um observável (ObservavelDetalheView.vue). -->
      <section class="eventos__secao">
        <details class="eventos__metodologia">
          <summary>Fonte e metodologia</summary>
          <p>
            Leitura diária de eventos de mercado do ouro, do petróleo, do milho e do café, feita por IA (Gemini) com a
            pesquisa do Google, usando somente as fontes autorizadas abaixo. Procura <strong>fatos externos, recentes e
            relevantes para o preço que o FinMind não obtém dos observáveis</strong>: a tarifa anunciada hoje, a geada de
            hoje, o ataque de hoje. Não é um resumo do noticiário nem um sistema de acompanhamento de eventos: cada dia é
            uma leitura nova, e um fato que continua relevante simplesmente aparece de novo.
          </p>
          <ol class="eventos__metodologia-passos">
            <li>
              <strong>Uma leitura por dia, em duas chamadas.</strong> Na coleta diária, o FinMind faz duas chamadas ao
              Gemini, em paralelo: uma para o ouro e o petróleo, outra para o milho e o café, cada uma com as fontes que
              cobrem os seus ativos. Juntas, formam a leitura do dia: o nível (Normal, Atenção, Relevante ou Excepcional) e
              um resumo de cada ativo e a lista de eventos. A coleta roda 3 vezes por madrugada (01h, 03h e 05h, horário de Brasília): vale a primeira
              leitura que der certo, e as execuções seguintes pulam a chamada (aparecem como "ignorado" em Execuções).
            </li>
            <li>
              <strong>Observável não é evento.</strong> Preço, produção, exportação, estoque, previsão do tempo comum e
              relatórios periódicos (WASDE, Conab, COT, EIA) o FinMind já coleta: não viram evento. A IA é instruída a ser
              conservadora: na dúvida, não é evento, e um dia sem nenhum evento é normal.
            </li>
            <li>
              <strong>Tipo e ativos.</strong> Cada evento tem um tipo (geopolítica, política comercial, clima extremo,
              regulação, choque logístico, sanidade ou política de oferta) e os ativos que ele afeta, decididos pelo canal
              de transmissão, não pela fonte: um ataque no Mar Vermelho pode afetar petróleo, ouro e café. Para cada ativo,
              o evento indica o fator do FEL 1 afetado (um dos 34 da planilha de fatores) ou "não se aplica", o canal de
              transmissão e a intensidade. Um ativo afetado só de forma indireta (o ouro pela aversão a risco) só entra
              quando o fato muda o risco do sistema, como uma escalada entre países.
            </li>
            <li>
              <strong>Só fontes autorizadas.</strong> A pesquisa é orientada às fontes da lista abaixo, cada uma com o seu
              papel. A lista não é um checklist: a IA pesquisa onde um evento relevante pode ter sido publicado, mas há um
              mínimo por ativo antes de declarar Normal (no milho e no café, uma fonte de comércio ou regulação; no milho,
              também a AP sobre o Mar Negro). O FinMind confere esse mínimo pelas páginas lidas e avisa na execução quando
              falta. Um fato encontrado só em outro site não é relatado. A rotina (sanções e avisos de chuva de todo dia)
              não conta.
            </li>
            <li>
              <strong>Conferência da fonte.</strong> O Google não permite travar a pesquisa nessas fontes: o pedido
              orienta, mas não garante. Por isso o FinMind só aceita o evento se uma <strong>página de fonte
              autorizada</strong> que a pesquisa de fato leu estiver <strong>ligada ao texto do evento</strong>. A página é
              conferida pelo endereço completo: no gov.br, vale só o caminho da instituição (gov.br/agricultura para o
              MAPA). A citação feita pela IA não basta. Sem isso, o evento é <strong>rejeitado</strong> e não vai ao Motor:
              ele não aparece nesta tela, só como aviso no detalhe da execução (tela Execuções), com o motivo. A regra
              existe porque, num teste, a IA citou a Reuters sem ter lido nenhuma página dela.
            </li>
            <li>
              <strong>Sem pesquisa, sem leitura.</strong> Às vezes a IA responde sem pesquisar, sem dar erro, escrevendo
              de memória. Quando a resposta não traz nenhuma página lida, o FinMind tenta mais uma vez; se de novo vier
              sem pesquisa, nada é gravado e a execução fica como falha. Sem leitura no dia, o prompt do ativo recebe
              "leitura indisponível", nunca "normal".
            </li>
            <li>
              <strong>Link direto.</strong> No evento, o link é o da página que a pesquisa leu e que sustenta o evento: o
              aviso, o comunicado, a ordem ou a matéria.
            </li>
            <li>
              <strong>Uso no Motor.</strong> O nível, o resumo e os eventos aceitos de cada ativo entram no prompt da
              análise daquele ativo como contexto (título, tipo, fator, canal, pressão, intensidade, confiança, resumo e
              fontes). Os eventos complementam os observáveis: não mudam nenhuma série.
            </li>
            <li>
              <strong>Pressão sobre o preço.</strong> É para que lado o fato, sozinho e com o resto constante, empurra o
              preço de cada ativo. Não é previsão: o preço pode ir para o outro lado por juros, dólar ou outros fatores.
            </li>
          </ol>
          <p class="eventos__metodologia-nota">
            A pesquisa lê a internet do dia: a leitura só vale da primeira coleta em diante e não serve para backtest. O
            milho e o café entraram em 02/10/2026. A escala de nível e o que conta como "fora do normal" são provisórios: a
            régua é do especialista. Intensidade e confiança são declaradas pela própria IA. Ficaram de fora, depois de
            testados: a Reuters (a pesquisa do Gemini não lê o site), o World Gold Council (análise, não fato), APHIS,
            alfândega da China, SENASA e Federal Register (sem informação nova), e, por ora, MME, EPA, Conab e MDIC.
            Decisões registradas nos ADRs 0047 e 0049.
          </p>
          <dl class="eventos__metodologia-lista">
            <dt>Fonte</dt>
            <dd>Gemini (Google) com a pesquisa do Google, sobre as fontes autorizadas</dd>
            <dt>Frequência</dt>
            <dd>
              Uma leitura por dia (a data é o dia em São Paulo), na coleta das 01h, 03h e 05h: vale a primeira que der
              certo
            </dd>
            <dt>Refazer a leitura do dia</dt>
            <dd>
              Para trocar a leitura de hoje por uma nova (por exemplo, depois de uma falha da pesquisa), no console do
              backend:
              <code class="eventos__metodologia-comando">GEOPOLITICA_REFAZER=1 npm run collect -- --coletor=geopolitica</code>
              A nova leitura substitui a anterior do mesmo dia. Sem <code>GEOPOLITICA_REFAZER=1</code>, o comando pula a
              chamada se já houver leitura de hoje.
            </dd>
            <template v-for="fonte in fontesConfiaveis || []" :key="fonte.nome">
              <dt>{{ fonte.nome }}</dt>
              <dd>
                <template v-for="(endereco, i) in fonte.enderecos" :key="endereco">
                  <template v-if="i > 0">, </template>
                  <a class="eventos__metodologia-dominio" :href="`https://${endereco}`" target="_blank" rel="noopener noreferrer">{{ endereco }}</a>
                </template>
                · {{ fonte.papel }} · {{ fonte.tipos.map(rotuloTipo).join(', ') }} · {{ fonte.ativos.map(rotuloAtivo).join(', ') }}
              </dd>
            </template>
            <template v-if="leitura">
              <dt>Modelo</dt>
              <dd>{{ leitura.modelo }} (chave {{ leitura.chave }})</dd>
              <dt>Versão do prompt</dt>
              <dd>{{ leitura.versaoPrompt }}</dd>
            </template>
          </dl>
        </details>
      </section>

      <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

      <div v-else class="tabela-card">
        <div class="tabela-card__filtros">
          <div>
            <label class="form-label small mb-1 d-block">Ativo</label>
            <select v-model="ativoFiltro" class="form-select form-select-sm">
              <option v-for="opcao in OPCOES_ATIVO" :key="opcao.valor" :value="opcao.valor">{{ opcao.rotulo }}</option>
            </select>
          </div>
          <div>
            <label class="form-label small mb-1 d-block">Tipo</label>
            <select v-model="tipoFiltro" class="form-select form-select-sm">
              <option value="">Todos</option>
              <option v-for="(rotulo, codigo) in TIPOS" :key="codigo" :value="codigo">{{ rotulo }}</option>
            </select>
          </div>
          <div>
            <label class="form-label small mb-1 d-block">De</label>
            <input v-model="dataInicioFiltro" type="date" class="form-control form-control-sm" />
          </div>
          <div>
            <label class="form-label small mb-1 d-block">Até</label>
            <input v-model="dataFimFiltro" type="date" class="form-control form-control-sm" />
          </div>
        </div>

        <DataTable
          v-model:expanded-rows="eventosExpandidos"
          :value="eventos"
          lazy
          :loading="carregando"
          paginator
          paginator-position="both"
          :always-show="false"
          :rows="tamanhoPagina"
          :first="(paginaAtual - 1) * tamanhoPagina"
          :total-records="totalEventos"
          paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport"
          current-page-report-template="Página {currentPage} de {totalPages} ({totalRecords} no total)"
          sort-mode="single"
          sort-field="data"
          :sort-order="ordem === 'ASC' ? 1 : -1"
          data-key="id"
          class="tabela-paginada"
          @page="onPage"
          @sort="onSort"
        >
          <template #paginatorstart>
            <Button class="tabela-refresh-botao" icon="pi pi-refresh" text title="Atualizar" :loading="carregando" @click="atualizarTudo" />
          </template>
          <template #paginatorend>
            <label class="tabela-linhas-por-pagina">
              <span>Por página</span>
              <select v-model.number="tamanhoPagina">
                <option v-for="opcao in OPCOES_LINHAS_POR_PAGINA" :key="opcao" :value="opcao">{{ opcao }}</option>
              </select>
            </label>
          </template>
          <template #empty>Nenhum evento com esses filtros.</template>

          <Column expander style="width: 3rem" />
          <Column field="data" header="Data" sortable>
            <template #body="{ data }">{{ formatarData(data.data) }}</template>
          </Column>
          <Column header="Tipo">
            <template #body="{ data }"><span class="tipo-tag">{{ rotuloTipo(data.tipo) }}</span></template>
          </Column>
          <Column header="Ativo">
            <template #body="{ data }">{{ rotuloAtivo(data.ativo) }}</template>
          </Column>
          <Column header="Título">
            <template #body="{ data }"><span class="eventos__titulo-coluna" :title="data.titulo">{{ data.titulo }}</span></template>
          </Column>
          <Column header="Pressão">
            <template #body="{ data }"><PressaoIndicador :codigo="data.pressao" /></template>
          </Column>
          <Column header="Intensidade">
            <template #body="{ data }">{{ rotuloGrau(data.intensidade) }}</template>
          </Column>
          <Column header="Confiança">
            <template #body="{ data }">{{ rotuloGrau(data.confianca) }}</template>
          </Column>

          <template #expansion="{ data }">
            <div class="eventos__expansao">
              <EventoDetalhe :evento="data" com-ia @ver-ia="abrirDetalheIa" />
            </div>
          </template>
        </DataTable>
      </div>

      <Dialog v-model:visible="detalheIaAberto" modal header="Prompt e resposta da IA" :style="{ width: '64rem' }" :breakpoints="{ '960px': '95vw' }">
        <div v-if="carregandoDetalheIa" class="text-muted">Carregando...</div>
        <div v-else-if="erroDetalheIa" class="alert alert-danger small mb-0">{{ erroDetalheIa }}</div>
        <div v-else-if="detalheIa" class="detalhe-ia">
          <p class="detalhe-ia__nota">
            Uma única chamada por dia gera todos os eventos da leitura: este prompt e esta resposta são os mesmos para
            todos os eventos de {{ formatarData(detalheIa.data) }}.
          </p>
          <dl class="detalhe-ia__meta">
            <div><dt>Leitura</dt><dd>{{ formatarData(detalheIa.data) }}</dd></div>
            <div><dt>Gerada em</dt><dd>{{ detalheIa.geradaEm ? formatadorDataHora.format(new Date(detalheIa.geradaEm)) : '—' }}</dd></div>
            <div><dt>Modelo</dt><dd>{{ detalheIa.modelo }}</dd></div>
            <div><dt>Chave</dt><dd>{{ detalheIa.chave }}</dd></div>
            <div><dt>Tokens</dt><dd>{{ detalheIa.tokens ?? '—' }}</dd></div>
            <div><dt>Versão do prompt</dt><dd>{{ detalheIa.versaoPrompt }}</dd></div>
          </dl>

          <details class="detalhe-ia__bloco">
            <summary>Instrução do sistema <span>(regras, escala de nível e formato da resposta)</span></summary>
            <pre>{{ detalheIa.instrucaoSistema || 'Não gravada nesta leitura.' }}</pre>
          </details>
          <details class="detalhe-ia__bloco" open>
            <summary>Prompt <span>(data e sites confiáveis)</span></summary>
            <pre>{{ detalheIa.prompt }}</pre>
          </details>
          <details class="detalhe-ia__bloco" open>
            <summary>Resposta da IA <span>(como veio, antes da conferência das fontes)</span></summary>
            <pre>{{ detalheIa.resposta }}</pre>
          </details>
          <details class="detalhe-ia__bloco">
            <summary>Pesquisa <span>({{ detalheIa.buscas.length }} buscas, {{ detalheIa.paginasLidas.length }} páginas lidas)</span></summary>
            <h5>Buscas feitas</h5>
            <ul>
              <li v-for="(busca, i) in detalheIa.buscas" :key="`busca-${i}`"><code>{{ busca }}</code></li>
            </ul>
            <h5>Páginas lidas</h5>
            <ul>
              <li v-for="(pagina, i) in detalheIa.paginasLidas" :key="`pagina-${i}`">
                <strong>{{ pagina.site || '?' }}</strong>
                <a v-if="pagina.url" :href="pagina.url" target="_blank" rel="noopener noreferrer">{{ pagina.url }}</a>
                <span v-else class="text-muted">(link não resolvido)</span>
              </li>
            </ul>
          </details>
        </div>
      </Dialog>
    </div>
  </AppShell>
</template>

<style scoped>
.eventos__cabecalho {
  margin-bottom: 1.25rem;
}

.eventos__titulo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.35rem;
  letter-spacing: -0.01em;
}

.eventos__subtitulo {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
  max-width: 80ch;
}

/* "Fonte e metodologia": mesmo visual de ObservavelDetalheView.vue (.observavel-detalhe__metodologia). */
.eventos__secao {
  margin-bottom: 1.75rem;
}

.eventos__metodologia {
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  padding: 0.85rem 1.1rem;
  font-size: 0.85rem;
}
.eventos__metodologia summary {
  cursor: pointer;
  font-weight: 600;
}
.eventos__metodologia p {
  color: var(--p-text-muted-color);
  line-height: 1.5;
  margin: 0.75rem 0 0;
}

.eventos__metodologia-passos {
  margin: 0.75rem 0 0;
  padding-left: 1.25rem;
  line-height: 1.5;
  color: var(--p-text-muted-color);
}
.eventos__metodologia-passos strong {
  color: var(--p-text-color);
}
.eventos__metodologia-passos > li:not(:last-child) {
  margin-bottom: 0.4rem;
}

.eventos__metodologia-nota {
  font-size: 0.82rem;
}

.eventos__metodologia-lista {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3rem 0.75rem;
  margin: 0.75rem 0 0;
  font-size: 0.82rem;
}
.eventos__metodologia-lista dt {
  color: var(--p-text-muted-color);
  font-weight: 600;
}
.eventos__metodologia-lista dd {
  margin: 0;
}
.eventos__metodologia-comando {
  display: block;
  margin: 0.35rem 0;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  background: var(--p-content-hover-background);
  font-size: 0.78rem;
  overflow-wrap: anywhere;
}

.eventos__titulo-coluna {
  display: inline-block;
  max-width: 460px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.eventos__expansao {
  padding: 0.9rem 1.1rem;
  background: var(--p-content-background);
}

.eventos__metodologia-dominio {
  font-weight: 600;
  color: var(--p-primary-color);
  text-decoration: none;
}
.eventos__metodologia-dominio:hover {
  text-decoration: underline;
}

/* Painel expandido levemente destacado da linha-resumo, como no AgroMind. O tema do PrimeVue injeta o fundo da
   linha depois deste CSS, por isso o !important. */
:deep(.p-datatable-row-expansion > td) {
  background: color-mix(in srgb, var(--p-text-color) 6%, var(--p-content-background)) !important;
}

/* Modal "Prompt e resposta da IA". */
.detalhe-ia {
  font-size: 0.85rem;
}
.detalhe-ia__nota {
  margin: 0 0 0.75rem;
  color: var(--p-text-muted-color);
}
.detalhe-ia__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  margin: 0 0 1rem;
}
.detalhe-ia__meta dt {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--p-text-muted-color);
}
.detalhe-ia__meta dd {
  margin: 0;
  font-weight: 600;
}
.detalhe-ia__bloco {
  border: 1px solid var(--p-content-border-color);
  border-radius: 10px;
  padding: 0.6rem 0.9rem;
  margin-bottom: 0.6rem;
}
.detalhe-ia__bloco summary {
  cursor: pointer;
  font-weight: 600;
}
.detalhe-ia__bloco summary span {
  font-weight: 400;
  color: var(--p-text-muted-color);
}
.detalhe-ia__bloco pre {
  margin: 0.6rem 0 0;
  max-height: 420px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.76rem;
  padding: 0.75rem;
  border-radius: 8px;
  background: var(--p-content-hover-background);
}
.detalhe-ia__bloco h5 {
  margin: 0.7rem 0 0.3rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
}
.detalhe-ia__bloco ul {
  margin: 0;
  padding-left: 1.1rem;
}
.detalhe-ia__bloco li a {
  margin-left: 0.4rem;
  color: var(--p-primary-color);
  overflow-wrap: anywhere;
}

.tipo-tag {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  background: var(--p-content-hover-background);
  color: var(--p-text-color);
}
</style>
