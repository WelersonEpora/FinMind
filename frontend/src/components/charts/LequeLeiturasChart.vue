<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CORES_HORIZONTE, diasEntre, marcasDoEixo, somarDias } from '../../utils/leque-leituras.js'
import { rotuloFaixa } from '../../utils/analise-diaria.js'
import { formatarPreco, formatarVariacao, rotuloMotivo } from '../../utils/qualidade-ia.js'

// Faixas lidas × preço realizado (ADR 0064): desenha o que utils/leque-leituras.js::montarLeque calcula. Uma coluna por
// dia, com rolagem horizontal que abre em hoje; o eixo de preço fica fixo à esquerda. Sem ECharts: são barras por
// data-alvo, mais simples em SVG direto.
const props = defineProps({
  // O resultado de montarLeque.
  leque: { type: Object, required: true },
  // Os horizontes do ativo, na ordem: [{ horizonte, rotulo, dias }].
  horizontes: { type: Array, required: true },
  modo: { type: String, required: true },
  hoje: { type: String, required: true },
  unidade: { type: String, default: '' },
  // A moeda do preço no tooltip: R$ no milho (o CCM), US$ nos outros.
  moeda: { type: String, default: 'R$' },
  // A largura dos dias: 1 (a padrão), 2 ou 3 vezes, para separar as barras dos quatro horizontes.
  zoom: { type: Number, default: 1 }
})

const ALTURA = 374
// O topo reserva uma faixa para a unidade do eixo, acima do maior valor.
const TOPO = 30
const RODAPE = 28
const ALT_PLOT = ALTURA - TOPO - RODAPE

const scroller = ref(null)
const tooltip = ref(null)
const wrap = ref(null)

// A coluna de cada dia tem a mesma largura nas duas visões, para o tempo ter a mesma escala ao trocar de visão: a
// janela de 180 dias rola, abrindo em hoje. Só numa tela mais larga que a janela inteira a coluna cresce para ocupá-la.
// O zoom multiplica a largura padrão.
const LARGURA_DO_DIA = 18
const larguraVisivel = ref(0)
const dias = computed(() => {
  const n = diasEntre(props.leque.ini, props.leque.fim) + 1
  return Array.from({ length: n }, (_, i) => somarDias(props.leque.ini, i))
})
const larguraDoZoom = (zoom) => Math.max(LARGURA_DO_DIA * zoom, larguraVisivel.value / dias.value.length)
const largura = computed(() => larguraDoZoom(props.zoom))
const larguraTotal = computed(() => dias.value.length * largura.value)
const x = (data) => diasEntre(props.leque.ini, data) * largura.value + largura.value / 2
const y = (valor) => {
  const { min, max } = props.leque.escala
  return TOPO + (1 - (valor - min) / (max - min || 1)) * ALT_PLOT
}
const marcas = computed(() => marcasDoEixo(props.leque.escala))
const diaDaSemana = (d) => new Date(`${d}T00:00:00Z`).getUTCDay()
const segundas = computed(() => dias.value.filter((d) => diaDaSemana(d) === 1))
// Os dias com a data no eixo: só as segundas na largura padrão; com zoom, cabem todos.
const diasComData = computed(() => (props.zoom > 1 ? dias.value : segundas.value))
// Sábado e domingo ganham fundo cinza: não há pregão, e a falta das bolinhas da linha fica explicada.
const fimDeSemana = computed(() => dias.value.filter((d) => diaDaSemana(d) === 0 || diaDaSemana(d) === 6))
// Segunda, quarta e sexta ganham fundo branco; terça e quinta ficam com o do card (um cinza mais claro que o do fim de
// semana): dois dias vizinhos nunca têm o mesmo fundo, e cada grupo de barras (as quatro de uma data-alvo) fica separado
// do vizinho. Branco e cinza, e não uma cor, para não competir com as dos horizontes (o âmbar do longo sumiria num fundo
// amarelo).
// A inicial de cada dia da semana, na base do gráfico (domingo = 0, como no getUTCDay).
const INICIAL_DO_DIA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const diasBrancos = computed(() => dias.value.filter((d) => [1, 3, 5].includes(diaDaSemana(d))))
// A virada de cada mês: o dia 1, menos o primeiro dia da janela. O nome sai acima da área do gráfico, em negrito, com o
// ano em janeiro (fora da área, não encosta no "hoje").
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const viradas = computed(() =>
  dias.value
    .filter((d, i) => i > 0 && d.endsWith('-01'))
    .map((d) => {
      const mes = MESES[Number(d.slice(5, 7)) - 1]
      return { data: d, nome: mes === 'jan' ? `${mes}/${d.slice(2, 4)}` : mes }
    })
)
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const cor = (horizonte) => CORES_HORIZONTE[horizonte] || '#6b7280'
const rotulo = (horizonte) => props.horizontes.find((h) => h.horizonte === horizonte)?.rotulo || horizonte

// Uma barra em pixels. Quatro horizontes: lado a lado na coluna da data-alvo; um horizonte: a coluna inteira.
function retangulo(barra) {
  const larg = props.modo === 'quatro' ? (largura.value - 4) / 4 : largura.value - 2
  const bx = props.modo === 'quatro' ? x(barra.dataAlvo) - (largura.value - 4) / 2 + barra.indice * larg + 0.5 : x(barra.dataAlvo) - larg / 2
  const yTopo = y(barra.precoAte)
  return { x: bx, y: yTopo, width: Math.max(1, larg - (props.modo === 'quatro' ? 1 : 0)), height: Math.max(2, y(barra.precoDe) - yTopo) }
}

// A seta da ponta aberta de uma faixa FORTE ("ou mais").
function seta(barra) {
  if (!barra.seta) return null
  const r = retangulo(barra)
  const cx = r.x + r.width / 2
  const w = Math.max(6, r.width)
  const base = barra.seta === 'cima' ? r.y - 1.5 : r.y + r.height + 1.5
  const ponta = barra.seta === 'cima' ? base - 5 : base + 5
  return `M${cx - w / 2},${base} L${cx + w / 2},${base} L${cx},${ponta} Z`
}

function estiloBarra(barra) {
  const c = cor(barra.horizonte)
  if (props.modo === 'um') {
    const pendente = barra.estado === 'pendente' || barra.estado === 'sem-resultado'
    return { fill: c, 'fill-opacity': pendente ? 0.14 : 0.26, stroke: pendente ? c : 'none', 'stroke-dasharray': '2 2', 'stroke-width': 1 }
  }
  if (barra.estado === 'dentro') return { fill: c, stroke: c, 'stroke-width': 1.2 }
  if (barra.estado === 'fora') return { fill: '#ffffff', stroke: c, 'stroke-width': 1.2 }
  return { fill: c, 'fill-opacity': 0.25, stroke: c, 'stroke-width': 1.1, 'stroke-dasharray': '2 2' }
}

const pontosDaLinha = (segmento) => segmento.map((p) => `${x(p.data)},${y(p.valor)}`).join(' ')

// O preço na data (para o tooltip): o último ponto até ela, na linha desenhada (a do preço ou a de contexto).
function precoNaData(data, segmentos = props.leque.segmentos) {
  let achado = null
  for (const seg of segmentos) for (const p of seg) if (p.data <= data && (!achado || p.data > achado.data)) achado = p
  return achado
}

// ---- Tooltip -------------------------------------------------------------------------------------------------------
const aberto = ref(null)

// A base de uma leitura, em texto: "06/10 US$ 4.207,75" (provisória só nas leituras da regra antiga, ADR 0106).
function textoDaBase(linha) {
  const data = linha.base?.data ?? linha.precoRecebido?.data
  const valor = linha.base?.valor ?? linha.precoRecebido?.valor
  const provisoria = linha.base && !linha.base.confirmada ? ' (provisória)' : ''
  return `${data ? `${ddmm(data)} ` : ''}${props.moeda} ${formatarPreco(valor)}${provisoria}`
}

// A base vai no título quando é a mesma em todas as leituras do alvo; senão, em cada uma.
const baseComum = computed(() => {
  const textos = new Set((aberto.value?.barras ?? []).map((b) => textoDaBase(b.linha)))
  return textos.size === 1 ? [...textos][0] : null
})

function faixaEmReais(linha) {
  const base = linha.base?.valor ?? linha.precoRecebido?.valor
  const r = (v) => `${props.moeda} ${formatarPreco(base * (1 + v / 100))}`
  const { t1, t2 } = linha
  switch (linha.lida.faixa) {
    case 'LATERAL':
      return `${r(-t1)} a ${r(t1)}`
    case 'ALTA_LEVE':
      return `${r(t1)} a ${r(t2)}`
    case 'ALTA_FORTE':
      return `a partir de ${r(t2)}`
    case 'BAIXA_LEVE':
      return `${r(-t2)} a ${r(-t1)}`
    default:
      return `até ${r(-t2)}`
  }
}

function resultado(barra) {
  const l = barra.linha
  if (barra.estado === 'dentro') return `na faixa (${formatarVariacao(l.realizado.variacaoPct)})`
  if (barra.estado === 'fora') {
    const n = barra.distancia
    return `caiu em ${rotuloFaixa(l.realizado.faixa).toLowerCase()} (${formatarVariacao(l.realizado.variacaoPct)}), ${n} faixa${n > 1 ? 's' : ''} de distância`
  }
  if (barra.estado === 'pendente') return 'a apurar'
  return { SEM_PRECO: 'sem preço perto do alvo', SEM_PREGAO: 'sem pregão novo até o alvo' }[l.realizado.situacao] || 'sem resultado'
}

function mover(evento) {
  const caixa = evento.currentTarget.getBoundingClientRect()
  const indice = Math.floor((evento.clientX - caixa.left) / largura.value)
  const data = dias.value[indice]
  if (!data) {
    aberto.value = null
    return
  }
  const barras = props.leque.barras.filter((b) => b.dataAlvo === data).sort((a, b) => a.indice - b.indice)
  const contexto = props.leque.contexto && data <= props.hoje ? precoNaData(data, props.leque.contexto.segmentos) : null
  aberto.value = { data, barras, preco: data <= props.hoje ? precoNaData(data) : null, contexto, clientX: evento.clientX, clientY: evento.clientY }
  nextTick(posicionar)
}

function posicionar() {
  if (!aberto.value || !tooltip.value || !wrap.value) return
  const caixa = wrap.value.getBoundingClientRect()
  const larg = tooltip.value.offsetWidth
  const alt = tooltip.value.offsetHeight
  let left = aberto.value.clientX - caixa.left + 14
  if (left + larg > caixa.width) left = aberto.value.clientX - caixa.left - larg - 14
  const top = Math.max(0, Math.min(aberto.value.clientY - caixa.top - alt / 2, caixa.height - alt))
  tooltip.value.style.left = `${Math.max(0, left)}px`
  tooltip.value.style.top = `${top}px`
}

// Abre com hoje no meio da largura visível, a cada troca de visão ou de dados.
function centrarEmHoje() {
  if (scroller.value) scroller.value.scrollLeft = Math.max(0, x(props.hoje) - scroller.value.clientWidth / 2)
}

watch(
  () => [props.leque, props.modo],
  async () => {
    aberto.value = null
    await nextTick()
    centrarEmHoje()
  },
  { immediate: true, flush: 'post' }
)

// No zoom, a data que estava no meio da tela continua no meio.
watch(
  () => props.zoom,
  async (novo, antigo) => {
    if (!scroller.value) return
    const meio = scroller.value.scrollLeft + scroller.value.clientWidth / 2
    const indice = meio / larguraDoZoom(antigo)
    aberto.value = null
    await nextTick()
    scroller.value.scrollLeft = Math.max(0, indice * larguraDoZoom(novo) - scroller.value.clientWidth / 2)
  }
)

let observador = null
onMounted(() => {
  larguraVisivel.value = scroller.value?.clientWidth || 0
  observador = new ResizeObserver(() => {
    larguraVisivel.value = scroller.value?.clientWidth || 0
    nextTick(centrarEmHoje)
  })
  if (scroller.value) observador.observe(scroller.value)
})
onBeforeUnmount(() => observador?.disconnect())
</script>

<template>
  <div ref="wrap" class="leque">
    <svg class="leque__eixo" :width="58" :height="ALTURA" :viewBox="`0 0 58 ${ALTURA}`" aria-hidden="true">
      <text x="4" y="13" class="leque__texto leque__texto--unidade">{{ unidade }}</text>
      <text v-for="m in marcas" :key="m" x="52" :y="y(m) + 3.5" text-anchor="end" class="leque__texto">{{ formatarPreco(m) }}</text>
    </svg>

    <div ref="scroller" class="leque__rolagem" @scroll.passive="aberto = null">
      <svg
        :width="larguraTotal"
        :height="ALTURA"
        :viewBox="`0 0 ${larguraTotal} ${ALTURA}`"
        role="img"
        aria-label="Faixas lidas pela IA por data-alvo e o preço realizado"
        @pointermove="mover"
        @pointerdown="mover"
        @pointerleave="aberto = null"
      >
        <defs>
          <clipPath id="leque-area"><rect x="0" :y="TOPO" :width="larguraTotal" :height="ALT_PLOT" /></clipPath>
        </defs>
        <rect
          v-for="d in fimDeSemana"
          :key="`fs${d}`"
          :x="x(d) - largura / 2"
          :y="TOPO"
          :width="largura"
          :height="ALT_PLOT"
          class="leque__fim-de-semana"
        />
        <rect
          v-for="d in diasBrancos"
          :key="`db${d}`"
          :x="x(d) - largura / 2"
          :y="TOPO"
          :width="largura"
          :height="ALT_PLOT"
          class="leque__dia-alternado"
        />
        <line v-for="m in marcas" :key="`g${m}`" x1="0" :x2="larguraTotal" :y1="y(m)" :y2="y(m)" class="leque__grade" />
        <line
          v-for="d in segundas"
          :key="`s${d}`"
          :x1="x(d) - largura / 2"
          :x2="x(d) - largura / 2"
          :y1="TOPO"
          :y2="TOPO + ALT_PLOT"
          class="leque__grade"
        />
        <!-- A data, centrada na coluna do dia, com um tique no eixo (sem o tique, o rótulo da segunda parecia da terça). -->
        <g v-for="d in diasComData" :key="`dt${d}`">
          <line :x1="x(d)" :x2="x(d)" :y1="TOPO + ALT_PLOT" :y2="TOPO + ALT_PLOT + 4" class="leque__tique" />
          <text :x="x(d)" :y="ALTURA - 9" text-anchor="middle" class="leque__texto">{{ ddmm(d) }}</text>
        </g>
        <text
          v-for="d in dias"
          :key="`ini${d}`"
          :x="x(d)"
          :y="TOPO + ALT_PLOT - 4"
          text-anchor="middle"
          class="leque__texto leque__inicial"
        >{{ INICIAL_DO_DIA[diaDaSemana(d)] }}</text>
        <line x1="0" :x2="larguraTotal" :y1="TOPO + ALT_PLOT" :y2="TOPO + ALT_PLOT" class="leque__base" />

        <rect
          v-if="aberto"
          :x="x(aberto.data) - largura / 2"
          :y="TOPO"
          :width="largura"
          :height="ALT_PLOT"
          class="leque__realce"
        />

        <g clip-path="url(#leque-area)">
          <rect
            v-for="(p, i) in leque.persistencias"
            :key="`p${i}`"
            :x="x(p.dataAlvo) - largura / 2 + 1.5"
            :y="y(p.precoAte)"
            :width="largura - 3"
            :height="Math.max(2, y(p.precoDe) - y(p.precoAte))"
            class="leque__persistencia"
          />
          <g v-for="(b, i) in leque.barras" :key="`b${i}`" :opacity="b.foraDaMetrica ? 0.4 : 1">
            <rect v-bind="{ ...retangulo(b), ...estiloBarra(b) }" rx="1.5" />
            <path v-if="b.seta" :d="seta(b)" :fill="cor(b.horizonte)" />
          </g>
          <!-- A linha de contexto (o Brent à vista no petróleo): tracejada e clara, fora de qualquer medida. -->
          <template v-for="(seg, i) in leque.contexto?.segmentos || []" :key="`c${i}`">
            <polyline :points="pontosDaLinha(seg)" class="leque__contexto" />
            <circle v-for="p in seg" :key="p.data" :cx="x(p.data)" :cy="y(p.valor)" r="3.5" class="leque__ponto-contexto" />
          </template>
          <template v-for="(seg, i) in leque.segmentos" :key="`l${i}`">
            <polyline :points="pontosDaLinha(seg)" class="leque__linha-fundo" />
            <polyline :points="pontosDaLinha(seg)" class="leque__linha" />
            <circle v-for="p in seg" :key="p.data" :cx="x(p.data)" :cy="y(p.valor)" r="3" class="leque__ponto" />
          </template>
          <g v-for="(m, i) in leque.marcadores" :key="`m${i}`" :opacity="m.foraDaMetrica ? 0.4 : 1">
            <circle :cx="x(m.data)" :cy="y(m.valor)" r="7.5" fill="#ffffff" />
            <circle v-if="m.distancia === 0" :cx="x(m.data)" :cy="y(m.valor)" r="5" class="leque__na-faixa" />
            <path
              v-else-if="m.distancia === 1"
              :d="`M${x(m.data)},${y(m.valor) - 6} L${x(m.data) + 6},${y(m.valor)} L${x(m.data)},${y(m.valor) + 6} L${x(m.data) - 6},${y(m.valor)} Z`"
              class="leque__ao-lado"
            />
            <path
              v-else
              :d="`M${x(m.data) - 4.5},${y(m.valor) - 4.5} L${x(m.data) + 4.5},${y(m.valor) + 4.5} M${x(m.data) + 4.5},${y(m.valor) - 4.5} L${x(m.data) - 4.5},${y(m.valor) + 4.5}`"
              class="leque__longe"
            />
          </g>
        </g>

        <g v-for="v in viradas" :key="`v${v.data}`">
          <line :x1="x(v.data) - largura / 2" :x2="x(v.data) - largura / 2" :y1="TOPO - 6" :y2="TOPO + ALT_PLOT" class="leque__mes" />
          <text :x="x(v.data) - largura / 2 + 4" :y="TOPO - 10" class="leque__texto leque__texto--mes">{{ v.nome }}</text>
        </g>
        <line :x1="x(hoje)" :x2="x(hoje)" :y1="TOPO - 6" :y2="TOPO + ALT_PLOT" class="leque__hoje" />
        <text :x="x(hoje) + 4" :y="TOPO + 8" class="leque__texto leque__texto--hoje">hoje</text>
      </svg>
    </div>

    <div v-if="aberto" ref="tooltip" class="leque__tooltip">
      <strong>Alvo {{ ddmm(aberto.data) }}</strong>
      <span v-if="baseComum" class="leque__sub"> · Base em {{ baseComum }}</span>
      <span v-else-if="!aberto.barras.length && aberto.preco" class="leque__sub">
        · Realizado {{ moeda }} {{ formatarPreco(aberto.preco.valor) }}<template v-if="aberto.preco.data !== aberto.data"> ({{ ddmm(aberto.preco.data) }})</template>
      </span>
      <div v-if="aberto.contexto" class="leque__sub">
        {{ leque.contexto.nome }}: {{ moeda }} {{ formatarPreco(aberto.contexto.valor) }}<template v-if="aberto.contexto.data !== aberto.data"> ({{ ddmm(aberto.contexto.data) }})</template>, só contexto
      </div>
      <div v-if="!aberto.barras.length" class="leque__sub">Nenhuma leitura com esta data-alvo.</div>
      <div v-for="b in aberto.barras" :key="`${b.horizonte}-${b.linha.dataAnalise}`" class="leque__tt-linha">
        <span class="leque__tt-cor" :style="{ background: cor(b.horizonte) }"></span>
        <div>
          <div>
            <strong>{{ rotulo(b.horizonte) }}:</strong> {{ rotuloFaixa(b.linha.lida.faixa) }}: {{ faixaEmReais(b.linha) }}
          </div>
          <div v-if="!baseComum" class="leque__sub">Base em {{ textoDaBase(b.linha) }}</div>
          <div v-if="b.linha.realizado.preco != null">
            <span class="leque__sub">Realizado:</span> {{ moeda }} {{ formatarPreco(b.linha.realizado.preco) }}<span
              v-if="b.linha.realizado.data !== aberto.data"
              class="leque__sub"
            > ({{ ddmm(b.linha.realizado.data) }})</span>
          </div>
          <div><span class="leque__sub">Resultado:</span> {{ resultado(b) }}</div>
          <div v-if="b.foraDaMetrica" class="leque__sub">Fora da métrica: {{ rotuloMotivo(b.foraDaMetrica).toLowerCase() }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.leque {
  position: relative;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
}
.leque__rolagem {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.leque__rolagem svg,
.leque__eixo {
  display: block;
}
.leque__texto {
  font-size: 10.5px;
  fill: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
}
.leque__eixo {
  overflow: visible;
}
.leque__texto--unidade {
  font-size: 12px;
  font-weight: 700;
  fill: var(--p-text-color);
}
.leque__texto--mes {
  fill: var(--p-text-color);
  font-weight: 700;
}
.leque__texto--hoje {
  fill: var(--p-text-color);
  font-weight: 600;
}
.leque__grade {
  stroke: var(--p-surface-200);
  stroke-width: 1;
}
.leque__base {
  stroke: var(--p-surface-300);
  stroke-width: 1;
}
.leque__inicial {
  font-size: 9px;
}
.leque__tique {
  stroke: var(--p-text-muted-color);
  stroke-width: 1;
}
.leque__realce {
  fill: var(--p-text-color);
  opacity: 0.06;
  pointer-events: none;
}
.leque__persistencia {
  fill: none;
  stroke: var(--p-text-muted-color);
  stroke-width: 1;
  stroke-dasharray: 3 2;
}
.leque__linha-fundo {
  fill: none;
  stroke: #ffffff;
  stroke-width: 2.4;
  stroke-linejoin: round;
}
/* Fina, com o contorno branco estreito: a barra por baixo (ex.: a do imediato) continua legível. */
.leque__linha {
  fill: none;
  stroke: var(--p-text-color);
  stroke-width: 1.2;
  stroke-linejoin: round;
}
.leque__contexto {
  fill: none;
  stroke: var(--p-text-muted-color);
  stroke-width: 1.6;
  stroke-dasharray: 5 3;
  stroke-linejoin: round;
  opacity: 0.85;
}
.leque__ponto-contexto {
  fill: var(--p-text-muted-color);
  stroke: #ffffff;
  stroke-width: 1;
}
.leque__fim-de-semana {
  fill: #e9ebee;
}
.leque__dia-alternado {
  fill: #ffffff;
}
.leque__ponto {
  fill: var(--p-text-color);
  stroke: #ffffff;
  stroke-width: 1;
}
.leque__na-faixa {
  fill: #0ca30c;
}
.leque__ao-lado {
  fill: #e09a00;
}
.leque__longe {
  stroke: #d03b3b;
  stroke-width: 2.6;
  stroke-linecap: round;
  fill: none;
}
.leque__mes {
  stroke: var(--p-text-muted-color);
  stroke-width: 1;
  stroke-dasharray: 1.5 3;
  opacity: 0.7;
}
.leque__hoje {
  stroke: var(--p-text-color);
  stroke-width: 1;
  stroke-dasharray: 4 3;
}
.leque__tooltip {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  width: max-content;
  max-width: min(340px, 86vw);
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  background: #14171c;
  color: #ffffff;
  font-size: 0.76rem;
  line-height: 1.4;
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.22);
}
.leque__sub {
  opacity: 0.75;
}
.leque__tt-linha {
  display: grid;
  grid-template-columns: 10px 1fr;
  gap: 0.4rem;
  margin-top: 0.4rem;
}
.leque__tt-cor {
  width: 9px;
  height: 9px;
  margin-top: 0.3rem;
  border-radius: 2px;
}
</style>
