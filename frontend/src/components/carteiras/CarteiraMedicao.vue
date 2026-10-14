<script setup>
import { computed, ref, watch } from 'vue'
import LineChart from '../charts/LineChart.vue'
import CarteiraMedicaoSecundarias from './CarteiraMedicaoSecundarias.vue'
import carteirasService from '../../services/carteiras.service.js'
import { formatarData, formatarMoeda, formatarRetorno, nomeAtivo, rotulo } from '../../utils/carteiras.js'

// A medição pré-registrada (ADR 0127, §10; etapa 7): a IA agrega valor ao processo, sobre uma regra sem nenhuma IA? A
// diferença diária de retorno IA − Persistência, em % do capital inicial (a pergunta revista pelo usuário em
// 2026-10-14), no segmento em vigor; o intervalo de 80%; as datas (3 meses, só descritivo; 6, a avaliação; 12, a final).
// Antes da avaliação, os números são parciais e sem veredito. Abaixo, as duas partes que somam a principal, com
// intervalo e sem veredito: a recomendação (IA − Determinística) e as leituras (Determinística − Persistência). E as
// métricas secundárias (etapa 7b), só descritivas.
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

const arred = (v) => Math.round(v * 1e4) / 1e4
const pontos = computed(() => {
  const m = medicao.value
  if (!m) return []
  const linha = (serie, chave) => serie.map((p) => ({ data: p.data, valor: arred(p.acumulada), serie: chave }))
  return [...linha(m.serie, 'principal'), ...linha(m.partes.recomendacao.serie, 'recomendacao'), ...linha(m.partes.leituras.serie, 'leituras')]
})
const ROTULOS_GRAFICO = { principal: 'IA − Persistência (a pergunta)', recomendacao: 'Recomendação (IA − Determinística)', leituras: 'Leituras (Determinística − Persistência)' }
const PARTES = [
  { chave: 'recomendacao', nome: 'A recomendação', medida: 'IA − Determinística', texto: 'As duas usam as mesmas leituras; muda só quem decide: a recomendação da IA ou a regra fixa.' },
  { chave: 'leituras', nome: 'As leituras de tendência', medida: 'Determinística − Persistência', texto: 'A mesma regra fixa, sobre as leituras da IA ou sobre a direção dos últimos 30 dias do preço.' }
]
const intervalo = (r) => (r?.intervaloAcumulada ? `${formatarRetorno(r.intervaloAcumulada.inferior)} a ${formatarRetorno(r.intervaloAcumulada.superior)}` : '—')
const ROTULO_CAMPO = { versaoPrompt: 'prompt', modelo: 'modelo' }
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
              <h3 class="h6 mb-1">A IA agrega valor ao processo, sobre uma regra sem nenhuma IA?</h3>
              <p class="small text-muted mb-2">
                A medida é a diferença diária de retorno entre a trilha IA (as leituras e a recomendação da IA) e a referência
                Persistência (a direção dos últimos 30 dias do preço, sem nenhuma IA), com o mesmo motor, stop e travas, em % do
                capital inicial, com um intervalo de {{ Math.round(medicao.metodo.nivel * 100) }}%. Agrega se o intervalo fica todo acima de zero; não
                agrega se fica todo abaixo; senão, é inconclusivo.
              </p>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="loading" title="Atualizar" @click="carregar">
              <i class="bi bi-arrow-clockwise"></i>
            </button>
          </div>
          <div class="small">
            Segmento desde <strong>{{ formatarData(medicao.segmento.inicio) }}</strong> · parâmetros v{{ medicao.segmento.parametrosVersao ?? '—' }} · recomendação:
            modelo {{ medicao.segmento.modelo || '—' }}, prompt {{ medicao.segmento.versaoPrompt || '—' }}
            <template v-if="medicao.mudouEm.length"> · começou quando mudou {{ medicao.mudouEm.map(rotulo).join(' e ') }}</template>
          </div>
          <div v-if="medicao.segmentosAnteriores.length" class="small text-muted mt-1">
            Segmentos anteriores (não contam):
            <span v-for="(s, i) in medicao.segmentosAnteriores" :key="s.inicio">{{ i ? '; ' : '' }}{{ formatarData(s.inicio) }} a {{ formatarData(s.fim) }}</span>.
          </div>
          <div v-if="medicao.mudancasDasLeituras.length" class="small text-muted mt-1">
            Mudanças nas leituras de tendência neste segmento (registradas; não reiniciam a contagem):
            <span v-for="(m, i) in medicao.mudancasDasLeituras" :key="m.data + m.ativo + m.campo">{{ i ? '; ' : '' }}{{ formatarData(m.data) }}, {{ nomeAtivo(m.ativo) }}, {{ ROTULO_CAMPO[m.campo] }} {{ m.de }} → {{ m.para }}</span>.
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
              Positivo: a trilha IA rendeu mais que a Persistência. Em pontos percentuais do capital inicial de
              {{ formatarMoeda(medicao.capitalInicial, medicao.moeda) }}.
            </p>
          </template>
        </div>
      </div>

      <!-- As duas partes -->
      <div v-if="medicao.parcial.dias" class="card mb-3">
        <div class="card-body">
          <h3 class="h6 mb-1">De onde vem: as duas partes</h3>
          <p class="small text-muted mb-2">
            A diferença IA − Persistência é a soma de duas partes. Elas mostram qual camada da IA traz o resultado; têm intervalo, mas
            não têm veredito (o veredito é um só, o da pergunta acima).
          </p>
          <div class="table-responsive">
            <table class="table table-sm small mb-2">
              <thead>
                <tr>
                  <th>Parte</th>
                  <th class="text-end">Diferença acumulada</th>
                  <th class="text-end">Intervalo de {{ Math.round(medicao.metodo.nivel * 100) }}%</th>
                  <th v-if="medicao.avaliacao" class="text-end">Na avaliação (6 meses)</th>
                  <th v-if="medicao.final" class="text-end">Na final (12 meses)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in PARTES" :key="p.chave">
                  <td>
                    <strong>{{ p.nome }}</strong> <span class="text-muted">({{ p.medida }})</span>
                    <div class="text-muted">{{ p.texto }}</div>
                  </td>
                  <td class="text-end fw-semibold">{{ formatarRetorno(medicao.partes[p.chave].parcial.acumulada) }}</td>
                  <td class="text-end">{{ intervalo(medicao.partes[p.chave].parcial) }}</td>
                  <td v-if="medicao.avaliacao" class="text-end">
                    {{ formatarRetorno(medicao.partes[p.chave].avaliacao?.acumulada) }} ({{ intervalo(medicao.partes[p.chave].avaliacao) }})
                  </td>
                  <td v-if="medicao.final" class="text-end">
                    {{ formatarRetorno(medicao.partes[p.chave].final?.acumulada) }} ({{ intervalo(medicao.partes[p.chave].final) }})
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <LineChart v-if="pontos.length > 3" :pontos="pontos" :series-labels="ROTULOS_GRAFICO" unidade="%" :casas-decimais="2" altura="280px" />
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
        {{ medicao.metodo.reamostragens.toLocaleString('pt-BR') }} reamostragens, semente {{ medicao.metodo.semente }}. Mudar os parâmetros, ou o modelo ou o prompt
        da recomendação, reinicia a contagem; uma mudança nas leituras de tendência fica registrada.
      </p>
    </template>
  </div>
</template>
