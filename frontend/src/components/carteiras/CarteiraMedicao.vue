<script setup>
import { computed, ref, watch } from 'vue'
import LineChart from '../charts/LineChart.vue'
import CarteiraMedicaoSecundarias from './CarteiraMedicaoSecundarias.vue'
import carteirasService from '../../services/carteiras.service.js'
import { formatarData, formatarMoeda, formatarRetorno, formatarUsd, rotulo } from '../../utils/carteiras.js'

// A medição pré-registrada (ADR 0127, §10; etapa 7): a recomendação da IA agrega valor sobre a regra fixa? A diferença
// diária de retorno IA − Determinística, em % do capital inicial, no segmento em vigor; o intervalo de 80%; as datas
// (3 meses, só descritivo; 6, a avaliação; 12, a final). Antes da avaliação, os números são parciais e sem veredito.
// E o custo da IA, com o ponto de equilíbrio, e as métricas secundárias (etapa 7b), só descritivas.
const props = defineProps({
  workspaceId: { type: String, required: true },
  carteira: { type: Object, required: true }
})

const medicao = ref(null)
const loading = ref(true)
const errorMessage = ref('')

async function carregar() {
  loading.value = true
  errorMessage.value = ''
  try {
    medicao.value = await carteirasService.obterMedicao(props.workspaceId, props.carteira.id)
  } catch (_err) {
    errorMessage.value = 'Não foi possível carregar a medição.'
  } finally {
    loading.value = false
  }
}

watch(() => props.carteira.id, carregar, { immediate: true })

const pontos = computed(() => (medicao.value?.serie || []).map((p) => ({ data: p.data, valor: Math.round(p.acumulada * 1e4) / 1e4 })))
const diasAte = (data) => Math.round((new Date(`${data}T00:00:00Z`) - new Date(`${medicao.value.hoje}T00:00:00Z`)) / 86400000)
const DATAS = [
  { chave: 'descritiva', nome: '3 meses', texto: 'Só descritivo: nada se decide' },
  { chave: 'avaliacao', nome: '6 meses', texto: 'A avaliação: o veredito' },
  { chave: 'final', nome: '12 meses', texto: 'A avaliação final' }
]
const classeVeredito = (v) => (v === 'AGREGA' ? 'text-bg-success' : v === 'NAO_AGREGA' ? 'text-bg-danger' : 'text-bg-secondary')
const faltamDias = computed(() => Math.max(0, (medicao.value?.metodo.minimoDias ?? 0) - (medicao.value?.parcial.dias ?? 0)))
</script>

<template>
  <div>
    <div v-if="loading && !medicao" class="text-muted">Carregando...</div>
    <div v-else-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
    <template v-else-if="medicao">
      <!-- A pergunta e o segmento -->
      <div class="card mb-3">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <h3 class="h6 mb-1">A recomendação da IA agrega valor sobre a regra fixa?</h3>
              <p class="small text-muted mb-2">
                A medida é a diferença diária de retorno entre a trilha IA e a trilha Determinística, em % do capital
                inicial, com um intervalo de {{ Math.round(medicao.metodo.nivel * 100) }}%. Agrega se o intervalo fica todo acima de zero; não agrega
                se fica todo abaixo; senão, é inconclusivo.
              </p>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="loading" title="Atualizar" @click="carregar">
              <i class="bi bi-arrow-clockwise"></i>
            </button>
          </div>
          <div class="small">
            Segmento desde <strong>{{ formatarData(medicao.segmento.inicio) }}</strong> · parâmetros v{{ medicao.segmento.parametrosVersao ?? '—' }} · modelo
            {{ medicao.segmento.modelo || '—' }} · prompt {{ medicao.segmento.versaoPrompt || '—' }}
            <template v-if="medicao.mudouEm.length"> · começou quando mudou {{ medicao.mudouEm.map(rotulo).join(' e ') }}</template>
          </div>
          <div v-if="medicao.segmentosAnteriores.length" class="small text-muted mt-1">
            Segmentos anteriores (não contam):
            <span v-for="(s, i) in medicao.segmentosAnteriores" :key="s.inicio">{{ i ? '; ' : '' }}{{ formatarData(s.inicio) }} a {{ formatarData(s.fim) }}</span>.
          </div>
        </div>
      </div>

      <!-- As datas -->
      <div class="row g-3 mb-3">
        <div v-for="d in DATAS" :key="d.chave" class="col-md-4">
          <div class="card h-100">
            <div class="card-body py-2">
              <div class="small text-muted">{{ d.nome }} · {{ d.texto }}</div>
              <div class="fw-semibold">{{ formatarData(medicao.datas[d.chave]) }}</div>
              <div class="small" :class="diasAte(medicao.datas[d.chave]) <= 0 ? 'text-success' : 'text-muted'">
                {{ diasAte(medicao.datas[d.chave]) <= 0 ? 'Chegou' : `Faltam ${diasAte(medicao.datas[d.chave])} dias` }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- A avaliação e a final, quando chegam -->
      <div v-for="chave in ['avaliacao', 'final']" :key="chave">
        <div v-if="medicao[chave]" class="card mb-3 border-primary">
          <div class="card-body">
            <h3 class="h6">
              {{ chave === 'avaliacao' ? 'Avaliação (6 meses)' : 'Avaliação final (12 meses)' }}
              <span class="badge ms-1" :class="classeVeredito(medicao[chave].veredito)">{{ rotulo(medicao[chave].veredito) || 'Sem intervalo' }}</span>
            </h3>
            <div class="small">
              {{ medicao[chave].dias }} dias até {{ formatarData(medicao.datas[chave]) }} · diferença acumulada
              <strong>{{ formatarRetorno(medicao[chave].acumulada) }}</strong>
              <template v-if="medicao[chave].intervaloAcumulada">
                · intervalo de {{ formatarRetorno(medicao[chave].intervaloAcumulada.inferior) }} a {{ formatarRetorno(medicao[chave].intervaloAcumulada.superior) }}
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- O parcial -->
      <div class="card mb-3">
        <div class="card-body">
          <h3 class="h6">
            Resultado até agora
            <span v-if="!medicao.avaliacao" class="badge text-bg-light border ms-1">parcial · sem veredito até {{ formatarData(medicao.datas.avaliacao) }}</span>
          </h3>
          <p v-if="!medicao.parcial.dias" class="small text-muted mb-0">Nenhum dia medido ainda: o primeiro entra com a liquidação do dia de início do segmento.</p>
          <template v-else>
            <div class="row g-2 small">
              <div class="col-6 col-md-3"><span class="text-muted d-block">Dias medidos</span>{{ medicao.parcial.dias }}</div>
              <div class="col-6 col-md-3">
                <span class="text-muted d-block">Diferença acumulada</span>
                <strong>{{ formatarRetorno(medicao.parcial.acumulada) }}</strong>
              </div>
              <div class="col-6 col-md-3"><span class="text-muted d-block">Média por dia</span>{{ formatarRetorno(medicao.parcial.media) }}</div>
              <div class="col-6 col-md-3">
                <span class="text-muted d-block">Intervalo de {{ Math.round(medicao.metodo.nivel * 100) }}% (acumulada)</span>
                <template v-if="medicao.parcial.intervaloAcumulada">
                  {{ formatarRetorno(medicao.parcial.intervaloAcumulada.inferior) }} a {{ formatarRetorno(medicao.parcial.intervaloAcumulada.superior) }}
                </template>
                <template v-else>Com {{ medicao.metodo.minimoDias }} dias medidos (faltam {{ faltamDias }})</template>
              </div>
            </div>
            <p class="small text-muted mt-2 mb-2">
              Positivo: a trilha IA rendeu mais que a Determinística. Em pontos percentuais do capital inicial de
              {{ formatarMoeda(medicao.capitalInicial, medicao.moeda) }}.
            </p>
            <LineChart v-if="pontos.length > 1" :pontos="pontos" :series-labels="{}" unidade="%" :casas-decimais="2" altura="260px" />
          </template>
        </div>
      </div>

      <!-- O custo da IA -->
      <div class="card mb-3">
        <div class="card-body">
          <h3 class="h6">O custo da IA no segmento</h3>
          <div class="row g-2 small">
            <div class="col-6 col-md-3"><span class="text-muted d-block">Chamadas</span>{{ medicao.custo.chamadas }} ({{ medicao.custo.tokens.toLocaleString('pt-BR') }} tokens)</div>
            <div class="col-6 col-md-3">
              <span class="text-muted d-block">Custo</span>
              <template v-if="medicao.custo.completo">
                {{ formatarUsd(medicao.custo.custoUsd) }}
                <template v-if="medicao.custo.cambio"> · {{ formatarMoeda(medicao.custo.custoMoeda, medicao.moeda) }}</template>
              </template>
              <template v-else>incompleto ({{ medicao.custo.semPreco }} sem preço)</template>
            </div>
            <div class="col-6 col-md-3"><span class="text-muted d-block">Dias em fallback</span>{{ medicao.custo.fallback }} de {{ medicao.custo.dias }}</div>
            <div class="col-6 col-md-3">
              <span class="text-muted d-block">Ponto de equilíbrio</span>
              <template v-if="medicao.custo.pontoDeEquilibrio != null">capital de {{ formatarMoeda(medicao.custo.pontoDeEquilibrio, medicao.moeda) }}</template>
              <template v-else-if="!medicao.custo.completo">precisa do custo completo</template>
              <template v-else>sem vantagem da IA até agora</template>
            </div>
          </div>
          <p class="small text-muted mt-2 mb-0">
            O custo é fixo por carteira e não cresce com o capital; a vantagem da IA, em %, sim. O ponto de equilíbrio é o
            capital a partir do qual a vantagem acumulada ({{ formatarMoeda(medicao.custo.vantagemMoeda, medicao.moeda) }} com o capital desta carteira)
            paga o custo.
            <template v-if="medicao.custo.cambio">Em reais pela PTAX de {{ formatarData(medicao.custo.cambio.data) }}.</template>
            {{ " " }}<strong>Neste cálculo de custo, estamos levando em conta apenas as chamadas da Recomendação</strong>: as leituras de tendência (os horizontes) e a de eventos de mercado ficam de
            fora, porque as duas trilhas as usam e elas seriam pagas de qualquer jeito. Não é o custo total da IA.
            <template v-if="!medicao.custo.completo">
              {{ medicao.custo.semPreco }} chamada(s) sem preço: o custo sai dos tokens quando os preços do modelo estiverem no .env do servidor
              (GEMINI_RECOMENDACAO_PRECO_ENTRADA e _SAIDA, em US$ por milhão de tokens).
            </template>
          </p>
        </div>
      </div>

      <CarteiraMedicaoSecundarias
        v-if="medicao.secundarias"
        :secundarias="medicao.secundarias"
        :moeda="medicao.moeda"
        :minimo-dias="medicao.metodo.minimoDias"
      />

      <p class="small text-muted mb-0">
        Método (pré-registrado no ADR 0127): block bootstrap circular da média diária, blocos de {{ medicao.metodo.bloco }} pregões,
        {{ medicao.metodo.reamostragens.toLocaleString('pt-BR') }} reamostragens, semente {{ medicao.metodo.semente }}. Mudar os parâmetros, o modelo ou o prompt
        reinicia a contagem.
      </p>
    </template>
  </div>
</template>
