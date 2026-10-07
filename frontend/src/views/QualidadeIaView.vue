<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import AppShell from '../components/layout/AppShell.vue'
import SeletorOpcao from '../components/centro-decisao/SeletorOpcao.vue'
import LequeLeiturasChart from '../components/charts/LequeLeiturasChart.vue'
import DocumentoModal from '../components/DocumentoModal.vue'
import { useDocumentoNaUrl } from '../composables/useDocumentoNaUrl.js'
import { CORES_HORIZONTE, montarLeque } from '../utils/leque-leituras.js'
import qualidadeIaService from '../services/qualidade-ia.service.js'
import { iconeAtivo } from '../utils/centro-decisao.js'
import { lerAtivoPreferido, salvarAtivoPreferido } from '../utils/ativo-preferido.js'
import { formatarData } from '../utils/geopolitica.js'
import { rotuloConfianca, rotuloFaixa } from '../utils/analise-diaria.js'
import {
  PREVISORES,
  PREVISOR_MOTOR,
  compararComBenchmark,
  desdeDoPeriodo,
  filtrarLinhas,
  formatarDistancia,
  formatarPct,
  formatarPreco,
  formatarVariacao,
  motivosPresentes,
  rotuloMotivo
} from '../utils/qualidade-ia.js'

// Qualidade da IA (ADR 0064): por ativo e horizonte, o que a IA leu contra o que o preço fez, em duas medidas (direção
// e faixa) e contra dois benchmarks calculados nas mesmas linhas. Sem índice único e sem cor de acerto ou erro: cada
// número mostra o n e leva às linhas que o formam (a tabela abaixo). O ativo fica na URL (?ativo=).

// Os seletores seguem o do ativo (SeletorOpcao), com códigos em texto. O período abre em 90 dias: com o histórico
// crescendo, "Tudo" deixaria a tela pesada para abrir.
const OPCOES_PERIODO = [
  { codigo: '30', nome: 'Últimos 30 dias' },
  { codigo: '90', nome: 'Últimos 90 dias' },
  { codigo: '180', nome: 'Últimos 180 dias' },
  { codigo: '365', nome: 'Último ano' },
  { codigo: 'TUDO', nome: 'Tudo' }
]
const OPCOES_LINHAS_POR_PAGINA = [20, 50, 100]
// A unidade do eixo de preço do gráfico, por ativo (o preço de referência de cada um).
const UNIDADE = { PETROLEO: 'US$/bbl', OURO: 'US$/oz', MILHO: 'R$/sc', CAFE: 'US$/sc' }

const route = useRoute()
const router = useRouter()

// "Como ler esta tela": o ADR 0064 (a metodologia, com o porquê da altura das barras) no modal da tela de status, com o
// id na URL (`?doc=adr-0064`), ao lado do `?ativo=`.
const DOCUMENTO_COMO_LER = 'adr-0064'
const { documentoAberto, anterior, abrirDocumento, navegarDocumento, voltarDocumento, fecharDocumento } =
  useDocumentoNaUrl()

const loading = ref(true)
const atualizando = ref(false)
const errorMessage = ref('')
const qualidade = ref(null)
const periodo = ref('90')
const versao = ref('TODAS')

// A tabela de auditoria: o horizonte e "só as da métrica" vêm do botão de cada card ou dos filtros dela.
const horizonteTabela = ref('TODOS')
const somenteAvaliadas = ref(false)
const tamanhoPagina = ref(20)
const primeiroRegistro = ref(0)
const tabela = ref(null)

// O gráfico de faixas (ADR 0064): a legenda marca e desmarca cada horizonte, todos por padrão (como na legenda de um
// gráfico de rosca). Com um só marcado, o gráfico mostra o detalhe dele: o resultado de cada data-alvo e a Persistência.
// Desmarcar o último volta aos quatro (nunca fica vazio). `horizontesMarcados` vazio = todos.
const horizontesMarcados = ref([])
const todosHorizontes = computed(() => (qualidade.value?.horizontes || []).map((h) => h.horizonte))
const horizontesVisiveis = computed(() => {
  const marcados = todosHorizontes.value.filter((h) => horizontesMarcados.value.includes(h))
  return marcados.length ? marcados : todosHorizontes.value
})
const modoGrafico = computed(() => (horizontesVisiveis.value.length === 1 ? 'um' : 'quatro'))
const horizonteGrafico = computed(() => (modoGrafico.value === 'um' ? horizontesVisiveis.value[0] : null))
function alternarHorizonte(horizonte) {
  const atuais = horizontesVisiveis.value
  horizontesMarcados.value = atuais.includes(horizonte) ? atuais.filter((h) => h !== horizonte) : [...atuais, horizonte]
}
const persistenciaGrafico = ref(false)
// A linha de contexto (no petróleo, o Brent à vista da EIA): ligada por padrão; desligada, a escala volta ao preço avaliado.
const contextoGrafico = ref(true)
// A largura dos dias no gráfico (1x, 2x ou 3x), lembrada no navegador; sem armazenamento, abre na padrão.
const ZOOMS = [1, 2, 3]
const CHAVE_ZOOM = 'finmind:qualidade-ia:zoom'
function lerZoom() {
  try {
    const zoom = Number(globalThis.localStorage?.getItem(CHAVE_ZOOM))
    return ZOOMS.includes(zoom) ? zoom : 1
  } catch {
    return 1
  }
}
const zoomGrafico = ref(lerZoom())
function escolherZoom(zoom) {
  zoomGrafico.value = zoom
  try {
    globalThis.localStorage?.setItem(CHAVE_ZOOM, String(zoom))
  } catch {
    // sem armazenamento: só não lembra
  }
}
const leque = computed(() =>
  montarLeque({
    linhas: qualidade.value?.linhas || [],
    precos: qualidade.value?.precos || [],
    horizontes: qualidade.value?.horizontes || [],
    modo: modoGrafico.value,
    horizonte: horizonteGrafico.value,
    visiveis: horizontesVisiveis.value,
    persistencia: persistenciaGrafico.value,
    hoje: qualidade.value?.hoje || new Date().toISOString().slice(0, 10),
    contexto: contextoGrafico.value ? qualidade.value?.contexto || null : null
  })
)

// A fonte da linha do preço, pela sigla: o prefixo do seriesCode das leituras (B3.ICF.ICFZ26.SETTLE -> B3).
const SIGLA_DA_FONTE = { B3: 'B3', EIA: 'EIA', YAHOO: 'Yahoo' }
const fontesDoPreco = computed(() =>
  [...new Set((qualidade.value?.linhas || []).filter((l) => l.seriesCode).map((l) => l.seriesCode.split('.')[0]))]
    .map((prefixo) => SIGLA_DA_FONTE[prefixo] || prefixo)
    .join(', ')
)

const opcoesAtivo = computed(() => (qualidade.value?.ativos || []).map((a) => ({ ...a, icone: iconeAtivo(a.codigo) })))
const opcoesVersao = computed(() => [
  { codigo: 'TODAS', nome: 'Todas as versões' },
  ...(qualidade.value?.versoesConfiguracao || []).map((v) => ({ codigo: String(v), nome: `Versão ${v}` }))
])
const opcoesHorizonte = computed(() =>
  (qualidade.value?.horizontes || []).map((h) => ({ codigo: h.horizonte, nome: `${h.rotulo} (${h.dias} dia${h.dias > 1 ? 's' : ''})` }))
)
const opcoesHorizonteTabela = computed(() => [{ codigo: 'TODOS', nome: 'Todos os horizontes' }, ...opcoesHorizonte.value])
const linhasDaTabela = computed(() =>
  filtrarLinhas(qualidade.value?.linhas || [], { horizonte: horizonteTabela.value === 'TODOS' ? null : horizonteTabela.value, somenteAvaliadas: somenteAvaliadas.value })
    .slice()
    .reverse()
)

async function carregar() {
  if (qualidade.value) atualizando.value = true
  else loading.value = true
  errorMessage.value = ''
  try {
    const { qualidadeIa } = await qualidadeIaService.getQualidadeIa({
      // Sem ativo na URL, o último analisado nas telas do ativo (utils/ativo-preferido.js).
      ativo: route.query.ativo || lerAtivoPreferido() || undefined,
      desde: periodo.value === 'TUDO' ? undefined : desdeDoPeriodo(Number(periodo.value)),
      versaoConfiguracao: versao.value === 'TODAS' ? undefined : versao.value
    })
    qualidade.value = qualidadeIa
    salvarAtivoPreferido(qualidadeIa.ativo.codigo)
    primeiroRegistro.value = 0
  } catch (err) {
    errorMessage.value = err.response?.data?.error?.message || 'Não foi possível carregar a Qualidade da IA.'
  } finally {
    loading.value = false
    atualizando.value = false
  }
}

function selecionarAtivo(ativo) {
  versao.value = 'TODAS'
  horizonteTabela.value = 'TODOS'
  horizontesMarcados.value = []
  router.replace({ query: { ativo } })
}

// "Ver as linhas": a tabela abaixo, filtrada nas linhas que formaram os números do card (ou, sem nenhuma na métrica, em
// todas as do horizonte, com o motivo de cada uma estar fora).
async function verLinhas(horizonte, soAvaliadas) {
  horizonteTabela.value = horizonte
  somenteAvaliadas.value = soAvaliadas
  primeiroRegistro.value = 0
  await nextTick()
  tabela.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// "Ver no gráfico": o card deixa marcado só o próprio horizonte (de novo no mesmo, volta aos quatro). O gráfico só rola
// para a tela se não estiver à vista.
const grafico = ref(null)
async function verNoGrafico(horizonte) {
  horizontesMarcados.value = horizonteGrafico.value === horizonte ? [] : [horizonte]
  await nextTick()
  grafico.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function sintese(celula) {
  if (!celula.sintese) return []
  return [
    { rotulo: 'Direção', ...compararComBenchmark(celula.sintese.direcaoPp) },
    { rotulo: 'Faixa exata', ...compararComBenchmark(celula.sintese.faixaExataPp) },
    { rotulo: 'Distância', ...compararComBenchmark(celula.sintese.distancia, { menorEhMelhor: true }) }
  ]
}

// A leitura agregada do motor (o café, ADR 0066): uma coluna a mais na célula e na tabela, só quando o ativo a tem.
const temMotor = computed(() => (qualidade.value?.linhas || []).some((l) => l.motor))
const previsoresDaCelula = (celula) => (celula.medidas.MOTOR ? [...PREVISORES, PREVISOR_MOTOR] : PREVISORES)
// O n de cada previsor: o da célula, ou o próprio (o motor só conta as linhas em que leu o horizonte).
const nDo = (celula, codigo) => celula.medidas[codigo].n ?? celula.n

const contrato = (linha) => (linha.contrato ? `${linha.serie} ${linha.contrato}` : linha.serie || '—')

watch(() => route.query.ativo, carregar, { immediate: true })
watch([periodo, versao], carregar)
</script>

<template>
  <AppShell>
    <div class="qualidade">
      <header class="qualidade__cabecalho">
        <div class="qualidade__linha-titulo">
          <h1 class="qualidade__titulo">Qualidade da IA</h1>
          <button type="button" class="btn btn-link btn-sm p-0 qualidade__como-ler" @click="abrirDocumento(DOCUMENTO_COMO_LER)">
            <i class="bi bi-book"></i> Como ler esta tela
          </button>
        </div>
        <p class="qualidade__subtitulo">
          O que a IA leu, o que o preço fez e como isso se compara a dois benchmarks simples, por horizonte.
        </p>
      </header>

      <div v-if="loading" class="text-muted">Carregando...</div>

      <div v-else-if="errorMessage && !qualidade" class="alert alert-danger">{{ errorMessage }}</div>

      <template v-else>
        <div v-if="errorMessage" class="alert alert-danger small">{{ errorMessage }}</div>

        <section class="qualidade__contexto">
          <SeletorOpcao :model-value="qualidade.ativo.codigo" :opcoes="opcoesAtivo" rotulo="Ativo" @update:model-value="selecionarAtivo" />
          <div class="qualidade__filtros">
            <div class="qualidade__filtro">
              <span>Período</span>
              <SeletorOpcao v-model="periodo" :opcoes="OPCOES_PERIODO" rotulo="Período" compacto />
            </div>
            <div class="qualidade__filtro">
              <span>Configuração</span>
              <SeletorOpcao v-model="versao" :opcoes="opcoesVersao" rotulo="Versão da configuração" compacto />
            </div>
          </div>
        </section>

        <p class="qualidade__nota">
          <i class="bi bi-info-circle"></i>
          A variação conta da <strong>base da avaliação</strong> (o preço da própria data da análise) até a data-alvo, e a
          faixa usa o T1/T2 gravados com cada leitura. Entram só os horizontes apurados de leituras com pregão na data da
          análise; os benchmarks (<strong>Sempre Lateral</strong> e <strong>Persistência</strong>, a variação passada que a
          IA recebeu) são medidos nas mesmas linhas. Por construção das faixas, cerca de 40% dos casos históricos são
          laterais. Com poucas leituras (veja o <em>n</em>), diferenças pequenas não querem dizer nada.
          {{ qualidade.totalLeituras }} leitura(s) no filtro; calculado em {{ new Date(qualidade.calculadoEm).toLocaleString('pt-BR') }}.
        </p>

        <div class="qualidade__conteudo" :class="{ 'qualidade__conteudo--atualizando': atualizando }">
          <section class="qualidade__grade">
            <article
              v-for="celula in qualidade.horizontes"
              :key="celula.horizonte"
              class="celula"
              :class="{ 'celula--no-grafico': horizonteGrafico === celula.horizonte }"
              :style="{ '--cor-horizonte': CORES_HORIZONTE[celula.horizonte] || 'var(--p-primary-color)' }"
              @click="verNoGrafico(celula.horizonte)"
            >
              <header class="celula__topo">
                <h2 class="celula__titulo">
                  <span class="celula__marca" aria-hidden="true"></span>{{ celula.rotulo }}
                  <span class="celula__dias">{{ celula.dias }} dia{{ celula.dias > 1 ? 's' : '' }}</span>
                </h2>
                <span class="celula__n">
                  <strong>{{ celula.n }}</strong> na métrica
                </span>
              </header>
              <p class="celula__cobertura">
                <template v-if="celula.cobertura.total">
                  {{ celula.cobertura.respondidas }} de {{ celula.cobertura.total }} respondidas pela IA
                </template>
                <template v-else>Nenhum horizonte fechado com pregão na data ainda</template>
              </p>

              <table class="celula__medidas">
                <thead>
                  <tr>
                    <th></th>
                    <th v-for="p in previsoresDaCelula(celula)" :key="p.codigo" :class="{ 'celula__ia': p.codigo === 'IA' }" :title="p.titulo">{{ p.rotulo }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>Direção</th>
                    <td v-for="p in previsoresDaCelula(celula)" :key="p.codigo" :class="{ 'celula__ia': p.codigo === 'IA' }">
                      <template v-if="nDo(celula, p.codigo)">
                        {{ celula.medidas[p.codigo].direcao.k }} de {{ nDo(celula, p.codigo) }}
                        <span class="celula__pct">{{ formatarPct(celula.medidas[p.codigo].direcao.pct) }}</span>
                      </template>
                      <template v-else>—</template>
                    </td>
                  </tr>
                  <tr>
                    <th>Faixa exata</th>
                    <td v-for="p in previsoresDaCelula(celula)" :key="p.codigo" :class="{ 'celula__ia': p.codigo === 'IA' }">
                      <template v-if="nDo(celula, p.codigo)">
                        {{ celula.medidas[p.codigo].faixaExata.k }} de {{ nDo(celula, p.codigo) }}
                        <span class="celula__pct">{{ formatarPct(celula.medidas[p.codigo].faixaExata.pct) }}</span>
                      </template>
                      <template v-else>—</template>
                    </td>
                  </tr>
                  <tr>
                    <th>Distância média</th>
                    <td v-for="p in previsoresDaCelula(celula)" :key="p.codigo" :class="{ 'celula__ia': p.codigo === 'IA' }">
                      {{ formatarDistancia(celula.medidas[p.codigo].distanciaMedia) }}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div v-if="celula.sintese" class="celula__sintese">
                <span class="celula__sintese-rotulo">IA contra o melhor benchmark</span>
                <span v-for="s in sintese(celula)" :key="s.rotulo" class="celula__sintese-item" :class="`celula__sintese-item--${s.sentido}`">
                  {{ s.rotulo }} <strong>{{ s.texto }}</strong>
                </span>
              </div>

              <ul v-if="motivosPresentes(celula.fora).length" class="celula__fora">
                <li v-for="m in motivosPresentes(celula.fora)" :key="m.codigo">
                  <span class="celula__fora-qtd">{{ m.quantidade }}</span> {{ m.rotulo }}
                </li>
              </ul>

              <div class="celula__acoes">
                <button type="button" class="celula__ver" :aria-pressed="horizonteGrafico === celula.horizonte" @click.stop="verNoGrafico(celula.horizonte)">
                  <i class="bi bi-bar-chart-line"></i>
                  {{ horizonteGrafico === celula.horizonte ? 'Voltar aos quatro no gráfico' : 'Ver no gráfico' }}
                </button>
                <button v-if="celula.n" type="button" class="celula__ver" @click.stop="verLinhas(celula.horizonte, true)">
                  Ver {{ celula.n === 1 ? 'a linha' : `as ${celula.n} linhas` }} na métrica
                  <i class="bi bi-arrow-down-short"></i>
                </button>
                <button v-else-if="celula.totalLinhas" type="button" class="celula__ver" @click.stop="verLinhas(celula.horizonte, false)">
                  Ver as {{ celula.totalLinhas }} linha{{ celula.totalLinhas === 1 ? '' : 's' }} do horizonte
                  <i class="bi bi-arrow-down-short"></i>
                </button>
              </div>
            </article>
          </section>

          <section ref="grafico" class="tabela-card qualidade__grafico" aria-labelledby="titulo-grafico">
            <header class="qualidade__tabela-topo">
              <div>
                <h2 id="titulo-grafico" class="qualidade__tabela-titulo">Faixas lidas × preço</h2>
                <p class="qualidade__grafico-sub">
                  Cada faixa é uma leitura, na data-alvo, em preço a partir da base dela. Passe o mouse ou toque numa data.
                </p>
              </div>
            </header>

            <div class="qualidade__legenda qualidade__legenda--topo">
              <div class="qualidade__legenda-linha">
                <span><svg width="16" height="12" aria-hidden="true"><line x1="0" y1="6" x2="16" y2="6" stroke="currentColor" stroke-width="2" /></svg> Preço realizado<template v-if="fontesDoPreco"> ({{ fontesDoPreco }})</template></span>
                <!-- O próprio item da legenda liga e desliga a linha (como na legenda de um gráfico de rosca). -->
                <button
                  v-if="qualidade.contexto?.pontos?.length"
                  type="button"
                  class="qualidade__legenda-item"
                  :class="{ 'qualidade__legenda-item--desligado': !contextoGrafico }"
                  :aria-pressed="contextoGrafico"
                  :title="contextoGrafico ? 'Clique para esconder a linha' : 'Clique para mostrar a linha'"
                  @click="contextoGrafico = !contextoGrafico"
                >
                  <svg width="16" height="12" aria-hidden="true"><line x1="0" y1="6" x2="16" y2="6" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 3" /></svg>
                  {{ qualidade.contexto.nome }}: só contexto, fora da avaliação
                </button>
                <div class="btn-group btn-group-sm qualidade__zoom" role="group" aria-label="Largura dos dias no gráfico">
                  <button
                    v-for="z in ZOOMS"
                    :key="z"
                    type="button"
                    class="btn btn-outline-secondary"
                    :class="{ active: zoomGrafico === z }"
                    :aria-pressed="zoomGrafico === z"
                    :title="z === 1 ? 'Largura padrão dos dias' : `Dias ${z} vezes mais largos`"
                    @click="escolherZoom(z)"
                  >
                    {{ z }}×
                  </button>
                </div>
              </div>
            </div>
            <LequeLeiturasChart
              v-if="leque.barras.length || leque.segmentos.length"
              :leque="leque"
              :horizontes="qualidade.horizontes"
              :modo="modoGrafico"
              :hoje="qualidade.hoje"
              :unidade="UNIDADE[qualidade.ativo.codigo] || ''"
              :moeda="qualidade.ativo.codigo === 'MILHO' ? 'R$' : 'US$'"
              :zoom="zoomGrafico"
            />
            <p v-else class="text-muted small mb-0">Nenhuma leitura com faixa neste filtro ainda.</p>

            <div class="qualidade__legenda">
              <!-- Os horizontes (cada um marca e desmarca as barras dele) e, embaixo, o resultado (num horizonte só) e os
                   informativos; as linhas de preço ficam acima do gráfico. -->
              <div class="qualidade__legenda-linha">
                <button
                  v-for="h in qualidade.horizontes"
                  :key="h.horizonte"
                  type="button"
                  class="qualidade__legenda-item"
                  :class="{ 'qualidade__legenda-item--desligado': !horizontesVisiveis.includes(h.horizonte) }"
                  :aria-pressed="horizontesVisiveis.includes(h.horizonte)"
                  :title="horizontesVisiveis.includes(h.horizonte) ? 'Clique para tirar do gráfico' : 'Clique para pôr no gráfico'"
                  @click="alternarHorizonte(h.horizonte)"
                >
                  <span class="qualidade__cor qualidade__cor--alta" :style="{ background: CORES_HORIZONTE[h.horizonte] }"></span>{{ h.rotulo }} ({{ h.dias }} dia{{ h.dias > 1 ? 's' : '' }})
                </button>
              </div>
              <div class="qualidade__legenda-linha">
                <template v-if="modoGrafico === 'um'">
                  <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="#0ca30c" /></svg> Na faixa lida</span>
                  <span><svg width="14" height="14" aria-hidden="true"><path d="M7,1 L13,7 L7,13 L1,7 Z" fill="#e09a00" /></svg> Uma faixa ao lado</span>
                  <span><svg width="14" height="14" aria-hidden="true"><path d="M2.5,2.5 L11.5,11.5 M11.5,2.5 L2.5,11.5" stroke="#d03b3b" stroke-width="2.6" stroke-linecap="round" /></svg> Duas faixas ou mais</span>
                  <label class="form-check qualidade__legenda-check">
                    <input v-model="persistenciaGrafico" type="checkbox" class="form-check-input" />
                    <span class="form-check-label"><svg width="12" height="14" aria-hidden="true"><rect x="1" y="1" width="10" height="12" fill="none" stroke="currentColor" stroke-dasharray="3 2" /></svg> Faixa da Persistência</span>
                  </label>
                </template>
                <template v-else>
                  <span><span class="qualidade__amostra qualidade__amostra--cheia"></span>Cheia: preço dentro da faixa</span>
                  <span><span class="qualidade__amostra qualidade__amostra--contorno"></span>Só contorno: fora da faixa</span>
                  <span><span class="qualidade__amostra qualidade__amostra--tracejada"></span>Tracejada: a apurar</span>
                </template>
                <span><svg width="12" height="12" aria-hidden="true"><path d="M1,9 L11,9 L6,3 Z" fill="currentColor" /></svg> Faixa forte: "ou mais"</span>
                <span><span class="qualidade__amostra qualidade__amostra--cheia qualidade__amostra--esmaecida"></span>Esmaecida: fora da métrica (fim de semana, referência antiga)</span>
              </div>
            </div>
          </section>

          <section ref="tabela" class="tabela-card qualidade__tabela">
            <header class="qualidade__tabela-topo">
              <h2 class="qualidade__tabela-titulo">Leituras × realizado</h2>
              <div class="qualidade__filtros">
                <div class="qualidade__filtro">
                  <span>Horizonte</span>
                  <SeletorOpcao
                    :model-value="horizonteTabela"
                    :opcoes="opcoesHorizonteTabela"
                    rotulo="Horizonte da tabela"
                    compacto
                    @update:model-value="(h) => { horizonteTabela = h; primeiroRegistro = 0 }"
                  />
                </div>
                <label class="form-check qualidade__check">
                  <input v-model="somenteAvaliadas" type="checkbox" class="form-check-input" @change="primeiroRegistro = 0" />
                  <span class="form-check-label">Só as da métrica</span>
                </label>
              </div>
            </header>

            <DataTable
              :value="linhasDaTabela"
              paginator
              paginator-position="bottom"
              :always-show="false"
              :rows="tamanhoPagina"
              v-model:first="primeiroRegistro"
              paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport"
              current-page-report-template="Página {currentPage} de {totalPages} ({totalRecords} no total)"
              scrollable
              class="tabela-paginada qualidade__datatable"
            >
              <template #paginatorend>
                <label class="tabela-linhas-por-pagina">
                  <span>Por página</span>
                  <select v-model.number="tamanhoPagina">
                    <option v-for="opcao in OPCOES_LINHAS_POR_PAGINA" :key="opcao" :value="opcao">{{ opcao }}</option>
                  </select>
                </label>
              </template>
              <template #empty>Nenhuma leitura neste filtro.</template>

              <Column header="Análise">
                <template #body="{ data }">
                  <router-link :to="{ path: '/', query: { ativo: qualidade.ativo.codigo, data: data.dataAnalise } }" title="Ver leitura no Centro de Decisão">
                    {{ formatarData(data.dataAnalise) }}
                  </router-link>
                </template>
              </Column>
              <Column header="Horizonte">
                <template #body="{ data }">{{ data.rotulo }}</template>
              </Column>
              <Column header="Alvo">
                <template #body="{ data }">{{ data.dataAlvo ? formatarData(data.dataAlvo) : '—' }}</template>
              </Column>
              <Column header="Lida">
                <template #body="{ data }">
                  <template v-if="data.lida?.faixa">
                    {{ rotuloFaixa(data.lida.faixa) }}
                    <span class="qualidade__sub">{{ rotuloConfianca(data.lida.confianca) }}</span>
                  </template>
                  <span v-else class="text-muted">Insuficiente</span>
                </template>
              </Column>
              <Column v-if="temMotor" header="Motor">
                <template #body="{ data }">
                  <template v-if="data.motor?.faixa">
                    {{ rotuloFaixa(data.motor.faixa) }}
                    <span class="qualidade__sub">{{ rotuloConfianca(data.motor.confianca) }}</span>
                  </template>
                  <span v-else-if="data.motor" class="text-muted">Insuficiente</span>
                  <span v-else class="text-muted">—</span>
                </template>
              </Column>
              <Column header="Série">
                <template #body="{ data }">{{ contrato(data) }}</template>
              </Column>
              <Column header="A IA recebeu">
                <template #body="{ data }">
                  <template v-if="data.precoRecebido">
                    {{ formatarPreco(data.precoRecebido.valor) }}
                    <span class="qualidade__sub">{{ formatarData(data.precoRecebido.data) }}</span>
                  </template>
                  <span v-else class="text-muted">—</span>
                </template>
              </Column>
              <Column header="Base da avaliação">
                <template #body="{ data }">
                  <template v-if="data.base?.data">
                    {{ formatarPreco(data.base.valor) }}
                    <span class="qualidade__sub">
                      {{ formatarData(data.base.data) }}<template v-if="!data.base.confirmada"> · provisória</template>
                    </span>
                  </template>
                  <span v-else class="text-muted">—</span>
                </template>
              </Column>
              <Column header="Realizado">
                <template #body="{ data }">
                  <template v-if="data.realizado.preco != null">
                    {{ formatarPreco(data.realizado.preco) }}
                    <span class="qualidade__sub">{{ formatarData(data.realizado.data) }}</span>
                  </template>
                  <span v-else class="text-muted">—</span>
                </template>
              </Column>
              <Column header="Variação">
                <template #body="{ data }">{{ formatarVariacao(data.realizado.variacaoPct) }}</template>
              </Column>
              <Column header="Faixa realizada">
                <template #body="{ data }">{{ data.realizado.faixa ? rotuloFaixa(data.realizado.faixa) : '—' }}</template>
              </Column>
              <Column header="Persistência">
                <template #body="{ data }">
                  <template v-if="data.persistencia">
                    {{ rotuloFaixa(data.persistencia.faixa) }}
                    <span class="qualidade__sub">{{ formatarVariacao(data.persistencia.variacaoPct) }}</span>
                  </template>
                  <span v-else class="text-muted">—</span>
                </template>
              </Column>
              <Column header="Situação">
                <template #body="{ data }">
                  <span :class="{ 'qualidade__avaliada': data.motivoFora === null }">{{ rotuloMotivo(data.motivoFora) }}</span>
                </template>
              </Column>
              <Column header="Versões">
                <template #body="{ data }">
                  <span :title="`Prompt ${data.versoes.prompt} · Metodologia ${data.versoes.metodologia}`">
                    v{{ data.versoes.configuracao }}
                  </span>
                  <span class="qualidade__sub">T1 {{ data.t1 }} · T2 {{ data.t2 }}</span>
                </template>
              </Column>
            </DataTable>
          </section>
        </div>
      </template>
    </div>

    <DocumentoModal
      :documento-id="documentoAberto"
      :anterior-id="anterior"
      @navegar="navegarDocumento"
      @voltar="voltarDocumento"
      @fechar="fecharDocumento"
    />
  </AppShell>
</template>

<style scoped>
.qualidade__cabecalho {
  margin-bottom: 1rem;
}
.qualidade__titulo {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.25rem;
  letter-spacing: -0.01em;
}
.qualidade__subtitulo {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
}
.qualidade__linha-titulo {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}
.qualidade__como-ler {
  font-size: 0.85rem;
  text-decoration: none;
  white-space: nowrap;
}

.qualidade__contexto {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 16px;
  background: var(--p-content-background);
}
.qualidade__filtros {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.qualidade__filtro {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.72rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.qualidade__check {
  font-size: 0.8rem;
  margin-bottom: 0.3rem;
}

.qualidade__nota {
  margin: 0 0 1.25rem;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  line-height: 1.45;
}

.qualidade__conteudo--atualizando {
  opacity: 0.6;
  transition: opacity 0.2s;
}

/* O tabela-card não tem respiro interno (é feito para tabelas de ponta a ponta) e corta o que passa da borda: aqui, o
   bloco do gráfico ganha respiro, e os dois blocos deixam aparecer o menu dos seletores. */
.qualidade__grafico {
  margin-bottom: 1.5rem;
  padding: 1rem 1.25rem;
  overflow: visible;
}
.qualidade__tabela {
  overflow: visible;
}
.qualidade__tabela > .qualidade__tabela-topo {
  padding: 1rem 1.25rem 0;
}
.qualidade__tabela :deep(.p-datatable) {
  overflow: hidden;
  border-radius: 0 0 14px 14px;
}
.qualidade__grafico-sub {
  margin: 0.15rem 0 0;
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
}
.qualidade__cor {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 0.35rem;
  border-radius: 2px;
}
.qualidade__cor--alta {
  width: 7px;
  height: 12px;
}
.qualidade__legenda {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.75rem;
  font-size: 0.76rem;
  color: var(--p-text-muted-color);
}
.qualidade__legenda--topo {
  margin: 0 0 0.5rem;
}
.qualidade__legenda-linha {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.1rem;
}
.qualidade__legenda-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.qualidade__legenda-item:hover {
  color: var(--p-text-color);
}
.qualidade__legenda-item--desligado {
  opacity: 0.45;
  text-decoration: line-through;
}
.qualidade__legenda-check {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  padding-left: 0;
}
.qualidade__legenda-check .form-check-input {
  float: none;
  margin: 0;
}
.qualidade__legenda-check .form-check-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
}
.qualidade__zoom {
  margin-left: auto;
}
.qualidade__legenda-linha > span {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.qualidade__amostra {
  display: inline-block;
  width: 7px;
  height: 12px;
  border: 1.2px solid var(--p-text-muted-color);
  border-radius: 1.5px;
}
.qualidade__amostra--cheia {
  background: var(--p-text-muted-color);
}
.qualidade__amostra--contorno {
  background: #ffffff;
}
.qualidade__amostra--esmaecida {
  opacity: 0.4;
}
.qualidade__amostra--tracejada {
  border-style: dashed;
  background: rgb(107 114 128 / 0.25);
}

.qualidade__grade {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr));
  gap: 0.85rem;
  margin-bottom: 1.25rem;
}

/* Compacto (os cards vêm antes do gráfico, e o começo dele deve aparecer sem rolar). O card leva o gráfico ao horizonte
   dele; o que está no gráfico fica com a borda na cor do horizonte. */
.celula {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.8rem 1.2rem 0.75rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 16px;
  background: var(--p-content-background);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.celula:hover {
  border-color: var(--p-surface-400);
}
.celula--no-grafico,
.celula--no-grafico:hover {
  border-color: var(--cor-horizonte);
  box-shadow: 0 0 0 1px var(--cor-horizonte);
}
.celula__topo {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}
.celula__titulo {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}
.celula__marca {
  align-self: center;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--cor-horizonte);
}
.celula__dias {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
}
.celula__n {
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}
.celula__n strong {
  font-size: 1.15rem;
  color: var(--p-text-color);
}
.celula__cobertura {
  margin: -0.3rem 0 0;
  font-size: 0.76rem;
  color: var(--p-text-muted-color);
}

/* Largura fixa por coluna e o percentual numa 2ª linha: nada encosta nem estoura a borda direita do card. */
.celula__medidas {
  width: 100%;
  table-layout: fixed;
  font-size: 0.78rem;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.celula__medidas th,
.celula__medidas td {
  padding: 0.25rem 0.4rem;
  border-bottom: 1px solid var(--p-content-border-color);
  text-align: right;
  vertical-align: top;
}
.celula__medidas th:first-child {
  width: 34%;
  padding-left: 0;
  text-align: left;
  font-weight: 600;
}
.celula__medidas th:last-child,
.celula__medidas td:last-child {
  padding-right: 0;
}
.celula__medidas thead th {
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--p-text-muted-color);
  vertical-align: bottom;
}
.celula__pct {
  display: block;
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
}
.celula__ia {
  font-weight: 700;
}

.celula__sintese {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  font-size: 0.76rem;
}
.celula__sintese-rotulo {
  width: 100%;
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.celula__fora {
  display: flex;
  flex-wrap: wrap;
  gap: 0.1rem 0.9rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.74rem;
  color: var(--p-text-muted-color);
}
.celula__fora-qtd {
  display: inline-block;
  min-width: 1.4rem;
  font-weight: 700;
  color: var(--p-text-color);
}

.celula__acoes {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.25rem 1rem;
  margin-top: auto;
}
.celula__ver {
  padding: 0;
  border: 0;
  background: none;
  font-size: 0.78rem;
  color: var(--p-primary-color);
}

.qualidade__tabela-topo {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}
.qualidade__tabela-titulo {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}
.qualidade__datatable :deep(.p-datatable-tbody > tr > td) {
  font-size: 0.75rem;
  line-height: 1.25;
  white-space: nowrap;
}
.qualidade__datatable :deep(.p-datatable-thead > tr > th) {
  font-size: 0.72rem;
  white-space: nowrap;
}
.qualidade__sub {
  display: block;
  font-size: 0.68rem;
  color: var(--p-text-muted-color);
}
.qualidade__avaliada {
  font-weight: 600;
}
</style>
