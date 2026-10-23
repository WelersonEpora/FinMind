<script setup>
import { computed, ref, watch } from 'vue'
import LineChart from '../charts/LineChart.vue'
import metodologiaAtivoService from '../../services/metodologia-ativo.service.js'
import { PERIODOS_CALCULO, desdeDoPeriodo, linhasSerieContinua, resumoBasis } from '../../utils/metodologia.js'

// O preço de referência visto de fora da leitura (análise do café de 2026-10-19, item E1): a série contínua do ICF (o
// ICF-CA, EM USO desde 2026-10-23 nos horizontes da leitura, no realizado e no Centro de Decisão, itens E1 e E11, ADR
// 0140, adendo) e o basis B3 × Nova York (INFORMAÇÃO; como fator, item E10). Calculados na hora, sem gravar nada.
const props = defineProps({
  ativo: { type: String, required: true }
})

const periodo = ref('3A')
const loading = ref(true)
const errorMessage = ref('')
const serie = ref(null)
const basis = ref(null)

async function carregar() {
  loading.value = true
  errorMessage.value = ''
  try {
    const resposta = await metodologiaAtivoService.getPrecoReferencia(props.ativo)
    serie.value = resposta.serieContinua
    basis.value = resposta.basis
  } catch (err) {
    errorMessage.value = err?.response?.data?.error?.message || 'Não foi possível calcular o preço de referência.'
  } finally {
    loading.value = false
  }
}

watch(() => props.ativo, carregar, { immediate: true })

function hojeLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const desde = computed(() => desdeDoPeriodo(periodo.value, hojeLocal()))
const linhas = computed(() => linhasSerieContinua(serie.value?.pontos, desde.value))
// As trocas do período, da mais recente para a mais antiga.
const trocas = computed(() => (serie.value?.trocas || []).filter((t) => !desde.value || t.data >= desde.value).slice().reverse())
const ultimo = computed(() => serie.value?.pontos.at(-1) || null)
const resumo = computed(() => resumoBasis(basis.value?.pontos, desde.value))
const ultimoBasis = computed(() => basis.value?.ultimo || null)
const ROTULO_MOTIVO = { LIQUIDEZ: 'Liquidez', TRAVA: 'Trava' }
const TITULO_MOTIVO = {
  LIQUIDEZ: 'Os negócios do vencimento seguinte passaram os do atual, dentro da janela antes do vencimento',
  TRAVA: 'A liquidez não migrou até o limite antes do vencimento (ou faltou dado do vencimento atual)'
}

const formatarData = (iso) => (iso ? iso.split('-').reverse().join('/') : '')
const numero = (v, casas = 2) =>
  v === null || v === undefined ? '-' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const sinal = (v, casas = 2) => (v === null || v === undefined ? '-' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${numero(Math.abs(v), casas)}`)
const pct = (razao) => `${sinal((razao - 1) * 100)}%`
// Fora da faixa de 90% do histórico (abaixo do percentil 5 ou acima do 95): o "fora do normal" do documento.
// Acima de 2 desvios padrão do histórico (o critério de aceite do E1 do documento; ADR 0148).
const desvioAlto = computed(() => ultimoBasis.value?.z != null && Math.abs(ultimoBasis.value.z) > 2)
const foraDoNormal = computed(() => ultimoBasis.value?.percentil != null && (ultimoBasis.value.percentil < 5 || ultimoBasis.value.percentil > 95))
</script>

<template>
  <section class="preco-ref">
    <div class="preco-ref__estado">
      <div>
        <p class="preco-ref__estado-titulo"><i class="bi bi-check2-circle"></i> Implementado (2026-10-20 e 2026-10-23)</p>
        <ul>
          <li>
            O <strong>ICF-CA</strong>, a série contínua do ICF, em uso desde 23/10/2026 (aprovada pelo Comitê, ADR 0140): o
            preço dos quatro horizontes da leitura, do realizado e do Centro de Decisão, com o contrato do dia ao lado.
          </li>
          <li>O basis B3 × Nova York, como <strong>informação</strong>, com o KC da ICE coletado pelo Yahoo (ADR 0129).</li>
          <li>No Centro de Decisão, cada horizonte mostra a série, o contrato do dia, o preço de partida e a data-alvo.</li>
        </ul>
      </div>
      <div>
        <p class="preco-ref__estado-titulo preco-ref__estado-titulo--falta"><i class="bi bi-hourglass-split"></i> Aguardando o teste</p>
        <ul>
          <li>
            O basis segue como informação até um teste (Comitê, 2026-10-22, item E10), fora do prompt e do Centro de Decisão. O
            teste da convergência está pré-registrado (ADR 0148) e só roda com 3 desvios ou mais de cada lado.
          </li>
        </ul>
      </div>
    </div>

    <div class="preco-ref__periodo btn-group btn-group-sm" role="group" aria-label="Período">
      <button
        v-for="p in PERIODOS_CALCULO"
        :key="p.codigo"
        type="button"
        class="btn"
        :class="periodo === p.codigo ? 'btn-secondary' : 'btn-outline-secondary'"
        @click="periodo = p.codigo"
      >
        {{ p.rotulo }}
      </button>
    </div>

    <div v-if="loading" class="text-muted">Calculando...</div>
    <div v-else-if="errorMessage" class="alert alert-danger mb-0">{{ errorMessage }}</div>
    <template v-else-if="serie">
      <article class="preco-ref__card">
        <h3>{{ serie.nome }} <span class="preco-ref__selo preco-ref__selo--em-uso">Em uso</span></h3>
        <p class="preco-ref__texto">
          Os vencimentos emendados num preço só, para comparar horizontes e medir tendência sem os saltos da troca de
          contrato (itens E1 e E11 da análise do café de 19/10/2026). É o preço de referência do café: em cada data, a
          série vai com o contrato do dia ao lado (ex.: "ICF-CA · ICFZ26").
        </p>
        <ul class="preco-ref__regra">
          <li>
            <strong>Quando rola:</strong> a partir de {{ serie.parametros.pregoesJanela }} pregões antes do vencimento, para o
            seguinte com mais contratos negociados nos últimos {{ serie.parametros.pregoesLiquidez }} pregões, quando passa
            os do atual (entre os {{ serie.parametros.candidatos }} vencimentos seguintes: pula os que não negociam). Se não
            migrar, a trava rola {{ serie.parametros.pregoesTrava }} pregões antes do vencimento.
          </li>
          <li>
            <strong>Ajuste proporcional:</strong> na troca, o passado é multiplicado pela razão novo ÷ antigo. Os retornos
            em % ficam iguais aos de cada contrato e o trecho atual é o preço real ({{ ultimo?.ticker }} a
            {{ numero(ultimo?.valor) }} {{ serie.unidade }} em {{ formatarData(ultimo?.data) }}). O nível do passado
            ajustado não é um preço que existiu.
          </li>
        </ul>

        <LineChart
          :pontos="linhas"
          :unidade="serie.unidade"
          :casas-decimais="2"
          :series-labels="{ ajustado: 'ICF-CA (contínua ajustada)', real: 'Ajuste do contrato do dia (salta na troca)' }"
        />

        <p class="preco-ref__titulo-tabela">Trocas de vencimento no período</p>
        <div class="preco-ref__rolagem">
          <table class="preco-ref__tabela">
            <thead>
              <tr>
                <th>Troca</th>
                <th>De → para</th>
                <th>Motivo</th>
                <th class="text-end">Negócios (5 pregões)</th>
                <th class="text-end">Ajustes ({{ serie.unidade }})</th>
                <th class="text-end">Razão</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in trocas" :key="t.data">
                <td>{{ formatarData(t.data) }}</td>
                <td>{{ t.de }} → {{ t.para }}</td>
                <td :title="TITULO_MOTIVO[t.motivo]">{{ ROTULO_MOTIVO[t.motivo] }}</td>
                <td class="text-end">{{ t.negociadosDe }} × {{ t.negociadosPara }}</td>
                <td class="text-end">{{ numero(t.precoDe) }} → {{ numero(t.precoPara) }}</td>
                <td class="text-end">{{ pct(t.razao) }}</td>
              </tr>
              <tr v-if="!trocas.length">
                <td colspan="6" class="text-muted">Nenhuma troca no período.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="preco-ref__nota">
          A razão negativa é a curva invertida no dia da troca: sem o ajuste, a série teria uma queda desse tamanho que não
          aconteceu. Em 2023 o Boletim Diário da B3 saiu sem a tabela de derivativos por meses: as trocas desse período são
          pela trava.
        </p>
      </article>

      <article v-if="basis" class="preco-ref__card">
        <h3>{{ basis.nome }} <span class="preco-ref__selo">Informação</span></h3>
        <p class="preco-ref__texto">
          O ICF da B3 contra o café de Nova York convertido para US$/saca (centavos por libra-peso × 1,32277), no mesmo mês
          de vencimento: o 1º vencimento de Nova York e o ICF do mesmo mês. Um basis fora do normal é informação, não ruído
          (item E1).
        </p>
        <div v-if="ultimoBasis" class="preco-ref__quadros">
          <div class="preco-ref__quadro">
            <span>Basis em {{ formatarData(ultimoBasis.data) }}</span>
            <strong>{{ sinal(ultimoBasis.basis) }} {{ basis.unidade }}</strong>
            <small>{{ ultimoBasis.contratoIcf }} a {{ numero(ultimoBasis.icf) }} × {{ ultimoBasis.contratoKc }} a {{ numero(ultimoBasis.kcSaca) }}</small>
          </div>
          <div class="preco-ref__quadro">
            <span>Em %</span>
            <strong>{{ sinal(ultimoBasis.basisPct) }}%</strong>
            <small>{{ ultimoBasis.contratoKc }} a {{ numero(ultimoBasis.kcCentavos) }} US¢/lb</small>
          </div>
          <div class="preco-ref__quadro" :class="{ 'preco-ref__quadro--alerta': desvioAlto }">
            <span>Desvio (z) contra o histórico</span>
            <strong>{{ ultimoBasis.z == null ? '-' : sinal(ultimoBasis.z) }}</strong>
            <small>{{ desvioAlto ? 'acima de 2 desvios padrão: a justificar' : 'dentro de 2 desvios padrão' }}</small>
          </div>
          <div class="preco-ref__quadro" :class="{ 'preco-ref__quadro--alerta': foraDoNormal }">
            <span>Posição no histórico</span>
            <strong>{{ ultimoBasis.percentil == null ? '-' : `percentil ${numero(ultimoBasis.percentil, 0)}` }}</strong>
            <small>{{ foraDoNormal ? 'fora da faixa de 90% do histórico' : 'dentro da faixa de 90% do histórico' }}</small>
          </div>
          <div class="preco-ref__quadro">
            <span>Faixa do histórico (desde {{ formatarData(basis.pontos[0]?.data) }})</span>
            <strong>{{ sinal(resumo.faixa.p5, 1) }}% a {{ sinal(resumo.faixa.p95, 1) }}%</strong>
            <small>mediana {{ sinal(resumo.faixa.mediana, 1) }}% (percentis 5 e 95)</small>
          </div>
        </div>
        <LineChart :pontos="resumo.linhas" unidade="%" :casas-decimais="2" :series-labels="{ basis: 'Basis B3 × NY (%)' }" />
        <div v-if="basis.desvios?.length" class="preco-ref__desvios">
          <p class="preco-ref__texto mb-1">
            <strong>Desvios acima de 2 desvios padrão</strong> (um por episódio; o documento pede uma justificativa para cada um):
          </p>
          <table class="table table-sm mb-0">
            <thead><tr><th>Data</th><th>Contrato</th><th>Basis</th><th>z</th><th>Lado</th></tr></thead>
            <tbody>
              <tr v-for="d in basis.desvios" :key="d.data">
                <td>{{ formatarData(d.data) }}</td>
                <td>{{ d.contratoIcf }}</td>
                <td>{{ sinal(d.basisPct) }}%</td>
                <td>{{ sinal(d.z) }}</td>
                <td>{{ d.lado === 'ACIMA' ? 'ICF caro contra Nova York' : 'ICF barato contra Nova York' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="preco-ref__nota">
          Os dois ajustes saem com cerca de 1h30 de diferença (Nova York às 13:30 locais; a B3 no fim do pregão). O
          histórico começa com o ICF (03/2022) e tem o buraco de 2023 do Boletim Diário da B3. O café de Nova York vem do
          Yahoo, fonte não oficial e provisória (ADR 0129).
        </p>
      </article>
    </template>
  </section>
</template>

<style scoped>
.preco-ref__desvios {
  margin-top: 0.75rem;
  overflow-x: auto;
}

.preco-ref {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.preco-ref__estado {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 0.85rem 1.15rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 16px;
  background: var(--p-content-background);
  font-size: 0.85rem;
  line-height: 1.5;
}

@media (max-width: 900px) {
  .preco-ref__estado {
    grid-template-columns: minmax(0, 1fr);
  }
}

.preco-ref__estado ul {
  margin: 0;
  padding-left: 1.1rem;
}

.preco-ref__estado-titulo {
  margin: 0 0 0.35rem;
  font-weight: 600;
  color: #146c43;
}

.preco-ref__estado-titulo--falta {
  color: #8a5f00;
}

.preco-ref__periodo {
  align-self: flex-end;
}

.preco-ref__card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.15rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 16px;
  background: var(--p-content-background);
}

.preco-ref__card h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.preco-ref__selo {
  margin-left: 0.4rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: rgba(17, 102, 255, 0.1);
  color: #0d4fc4;
  font-size: 0.68rem;
  font-weight: 600;
  vertical-align: middle;
}

.preco-ref__selo--em-uso {
  background: rgba(20, 108, 67, 0.12);
  color: #146c43;
}

.preco-ref__texto,
.preco-ref__nota {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
  line-height: 1.5;
}

.preco-ref__nota {
  font-size: 0.78rem;
}

.preco-ref__regra {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.85rem;
  line-height: 1.55;
}

.preco-ref__quadros {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

@media (max-width: 900px) {
  .preco-ref__quadros {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.preco-ref__quadro {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid rgba(19, 33, 59, 0.08);
  border-radius: 10px;
  background: rgba(19, 33, 59, 0.025);
  font-size: 0.8rem;
}

.preco-ref__quadro strong {
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.preco-ref__quadro small {
  color: var(--p-text-muted-color);
}

.preco-ref__quadro--alerta {
  border-color: rgba(214, 60, 60, 0.35);
  background: rgba(214, 60, 60, 0.06);
}

.preco-ref__titulo-tabela {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  font-weight: 600;
}

/* A tabela larga rola dentro do card, nunca a página. */
.preco-ref__rolagem {
  overflow-x: auto;
}

.preco-ref__tabela {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.8rem;
}

.preco-ref__tabela th,
.preco-ref__tabela td {
  padding: 0.35rem 0.45rem;
  border-bottom: 1px solid rgba(19, 33, 59, 0.08);
  white-space: nowrap;
}

.preco-ref__tabela thead th {
  font-weight: 600;
  color: var(--p-text-muted-color);
}
</style>
