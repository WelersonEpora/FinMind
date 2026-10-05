<script setup>
import { computed, ref } from 'vue'
import Dialog from 'primevue/dialog'
import { formatarData } from '../../utils/geopolitica.js'
import { formatarValor } from '../../utils/centro-decisao.js'
import {
  etiquetaLeitura,
  intervaloDaFaixa,
  leituraDoMotor,
  nivelConfianca,
  realizadoDoHorizonte,
  rotuloDias,
  rotuloLacuna,
  rotuloPapelCot
} from '../../utils/analise-diaria.js'

// Leitura diária de tendência da IA no Centro de Decisão (ADR 0052): os quatro horizontes, cada um com a sua leitura
// (sem síntese entre eles), e o detalhe de um horizonte num modal. Só mostra o que a leitura gravada traz: a tela não
// calcula nem resume nada. Leitura de tendência, não recomendação.
const props = defineProps({
  analise: { type: Object, required: true },
  ativoNome: { type: String, required: true },
  ativoCodigo: { type: String, default: null }
})

const aberto = ref(null)
const detalheVisivel = computed({
  get: () => Boolean(aberto.value),
  set: (visivel) => {
    if (!visivel) aberto.value = null
  }
})

// Cada horizonte com a leitura dele, a do motor (o café, ADR 0066) e o realizado (ADR 0063), pelo código, não pela posição.
const horizontes = computed(() =>
  props.analise.horizontes.map((h) => {
    const leitura = (props.analise.leituras || []).find((l) => l.horizonte === h.codigo) || null
    return {
      ...h,
      leitura,
      motor: leituraDoMotor(props.analise.agregacaoMotor, h.codigo, leitura),
      realizado: realizadoDoHorizonte(
        (props.analise.realizado?.horizontes || []).find((r) => r.horizonte === h.codigo),
        formatarData,
        props.analise.realizado?.seriesCode
      )
    }
  })
)

// A faixa em % do horizonte ("+2% a +6%"): a direção e a intensidade já estão na etiqueta. Sem faixa (INSUFICIENTE), null.
function intervalo(horizonte) {
  const { faixa } = horizonte.leitura || {}
  return faixa ? intervaloDaFaixa(faixa, horizonte) : null
}

const etiqueta = (leitura) => etiquetaLeitura(leitura.tendencia, leitura.faixa)

const proveniencia = computed(() => props.analise.proveniencia || {})
const contaDaAnalise = computed(() => props.analise.referenciaHorizontes?.tipo === 'DATA_DA_ANALISE')
// A base da avaliação (ADR 0063, adendo): o preço da data da leitura, de onde o realizado conta. Até o preço da data chegar,
// provisória; sem pregão na data, a leitura fica fora da Qualidade da IA (ADR 0064).
const baseAvaliacao = computed(() => props.analise.realizado?.base || null)
</script>

<template>
  <article class="analise">
    <header class="analise__topo">
      <span class="analise__icone"><i class="bi bi-lightbulb"></i></span>
      <div class="analise__titulos">
        <h2>Análise do FinMind</h2>
        <!-- De onde os horizontes contam, como foi gravado com a leitura (a v1 contava do último preço; ADR 0052). -->
        <p v-if="analise.disponivel && analise.precoReferencia && contaDaAnalise" class="analise__referencia">
          Os horizontes contam de <strong>{{ formatarData(analise.referenciaHorizontes.data) }}</strong>, data da leitura. Último
          preço do {{ analise.precoReferencia.serie }} na base: <strong>US$ {{ formatarValor(analise.precoReferencia.valor) }}</strong>
          em {{ formatarData(analise.precoReferencia.dataReferencia) }}.
        </p>
        <p v-else-if="analise.disponivel && analise.precoReferencia" class="analise__referencia">
          Os horizontes contam de <strong>{{ formatarData(analise.precoReferencia.dataReferencia) }}</strong>, último preço do
          {{ analise.precoReferencia.serie }} na base (<strong>US$ {{ formatarValor(analise.precoReferencia.valor) }}</strong>).
        </p>
      </div>
      <span class="analise__selo"><span class="analise__selo-ponto"></span>Leitura de tendência da IA</span>
      <router-link v-if="ativoCodigo" :to="{ path: '/qualidade-ia', query: { ativo: ativoCodigo } }" class="analise__qualidade">
        <i class="bi bi-check2-circle"></i> Qualidade da IA
      </router-link>
    </header>

    <div v-if="!analise.disponivel" class="analise__vazia">
      <i class="bi bi-hourglass-split"></i>
      <p class="analise__vazia-texto">Sem leitura de tendência do {{ ativoNome.toLowerCase() }} em {{ formatarData(analise.data) }}.</p>
      <p class="analise__nota">A leitura é feita uma vez por dia, de madrugada, com o que se sabia até aquele momento.</p>
    </div>

    <template v-else>
      <div class="analise__horizontes">
        <button
          v-for="horizonte in horizontes"
          :key="horizonte.codigo"
          type="button"
          class="horizonte"
          :disabled="!horizonte.leitura"
          :aria-label="horizonte.leitura ? `${horizonte.rotulo}, ${rotuloDias(horizonte.dias)}: ver o detalhe da leitura` : undefined"
          @click="aberto = horizonte"
        >
          <!-- Marco na linha do tempo (só com os 4 lado a lado). -->
          <span
            class="horizonte__marco"
            :class="horizonte.leitura ? `horizonte__marco--${etiqueta(horizonte.leitura).classe}` : ''"
            aria-hidden="true"
          >
            <span class="horizonte__marco-ponto"></span>
            <span class="horizonte__marco-rotulo">+{{ rotuloDias(horizonte.dias) }}</span>
          </span>
          <span class="horizonte__topo">
            <span class="horizonte__nome">{{ horizonte.rotulo }} · {{ rotuloDias(horizonte.dias) }}</span>
            <span
              v-if="horizonte.leitura"
              class="confianca"
              :class="`confianca--${nivelConfianca(horizonte.leitura.confianca).classe}`"
            >
              {{ nivelConfianca(horizonte.leitura.confianca).rotulo }}
            </span>
          </span>

          <template v-if="horizonte.leitura">
            <span class="horizonte__meio">
              <span
                class="tendencia"
                :class="[`tendencia--${etiqueta(horizonte.leitura).classe}`, { 'tendencia--forte': etiqueta(horizonte.leitura).forte }]"
              >
                <i class="bi" :class="etiqueta(horizonte.leitura).icone"></i>
                {{ etiqueta(horizonte.leitura).rotulo }}
              </span>
              <span class="horizonte__faixa">
                <span class="horizonte__faixa-rotulo">Faixa esperada</span>
                <span class="faixa" :class="{ 'faixa--vazia': !intervalo(horizonte) }">{{ intervalo(horizonte) || 'sem faixa' }}</span>
              </span>
            </span>
            <!-- O que o preço de fato fez no horizonte (ADR 0063), ao lado da faixa lida: só descreve, sem marcar acerto. -->
            <span v-if="horizonte.realizado" class="realizado">
              <span class="horizonte__faixa-rotulo">Realizado</span>
              <template v-if="horizonte.realizado.apurado">
                <span class="realizado__valor" :class="`realizado__valor--${horizonte.realizado.classe}`">
                  {{ horizonte.realizado.variacao }}<template v-if="horizonte.realizado.faixa"> · {{ horizonte.realizado.faixa }}</template>
                </span>
              </template>
              <span class="realizado__nota">{{ horizonte.realizado.nota }}</span>
            </span>
            <!-- A leitura agregada do motor (o café, ADR 0066): em código, sem IA; a IA a recebeu como evidência. -->
            <span v-if="horizonte.motor" class="motor">
              <span class="horizonte__faixa-rotulo">Motor</span>
              <span class="motor__valor" :class="`motor__valor--${horizonte.motor.etiqueta.classe}`">
                {{ horizonte.motor.etiqueta.rotulo }}<template v-if="horizonte.motor.confianca"> · {{ horizonte.motor.confianca.rotulo }}</template>
              </span>
              <span v-if="horizonte.motor.diverge" class="motor__diverge">diverge da IA</span>
            </span>
            <span class="horizonte__tese">{{ horizonte.leitura.tese }}</span>
            <span class="horizonte__abrir">Ver detalhe <i class="bi bi-arrow-right-short"></i></span>
          </template>
          <span v-else class="horizonte__tese text-muted">Sem leitura deste horizonte.</span>
        </button>
      </div>

      <p class="analise__rodape">
        Leitura de tendência, não recomendação. Feita pela IA com os fatores da metodologia do {{ ativoNome.toLowerCase() }}
        e o preço na base; cada horizonte é lido separadamente.
        <template v-if="analise.agregacaoMotor">
          "Motor" é a agregação dos fatores em código, sem IA (proposta do FinMind, a validar pelo Comitê).
        </template>
        <span class="analise__proveniencia">
          {{ proveniencia.modelo }} · prompt {{ proveniencia.versaoPrompt }} · metodologia {{ proveniencia.versaoMetodologia }} ·
          configuração v{{ proveniencia.versaoConfiguracao }} · hash {{ (proveniencia.hashEntrada || '').slice(0, 12) }}
        </span>
      </p>
    </template>

    <Dialog
      v-model:visible="detalheVisivel"
      modal
      :header="aberto ? `${aberto.rotulo} · ${rotuloDias(aberto.dias)}` : ''"
      :style="{ width: '52rem' }"
      :breakpoints="{ '960px': '95vw' }"
    >
      <div v-if="aberto?.leitura" class="detalhe">
        <p class="detalhe__linha">
          <span
            class="tendencia"
            :class="[`tendencia--${etiqueta(aberto.leitura).classe}`, { 'tendencia--forte': etiqueta(aberto.leitura).forte }]"
          >
            <i class="bi" :class="etiqueta(aberto.leitura).icone"></i> {{ etiqueta(aberto.leitura).rotulo }}
          </span>
          <span v-if="intervalo(aberto)" class="faixa">{{ intervalo(aberto) }}</span>
          <span class="confianca" :class="`confianca--${nivelConfianca(aberto.leitura.confianca).classe}`">
            {{ nivelConfianca(aberto.leitura.confianca).rotulo }}
          </span>
        </p>
        <p v-if="aberto.realizado" class="detalhe__realizado">
          <strong>Realizado:</strong>
          <template v-if="aberto.realizado.apurado">
            {{ aberto.realizado.variacao }}<template v-if="aberto.realizado.faixa"> ({{ aberto.realizado.faixa }})</template>, {{ aberto.realizado.nota }},
            contra a base da avaliação.
          </template>
          <template v-else>{{ aberto.realizado.nota }}.</template>
        </p>
        <p v-if="baseAvaliacao?.data" class="detalhe__realizado">
          <strong>Base da avaliação:</strong> {{ formatarValor(baseAvaliacao.valor) }} em {{ formatarData(baseAvaliacao.data) }}
          <template v-if="!baseAvaliacao.confirmada"> (provisória: o preço da data da leitura ainda não chegou)</template>.
          <template v-if="analise.precoReferencia">
            A IA recebeu {{ formatarValor(analise.precoReferencia.valor) }} em {{ formatarData(analise.precoReferencia.dataReferencia) }}.
          </template>
          <template v-if="contaDaAnalise && baseAvaliacao.confirmada && !baseAvaliacao.naDataDaAnalise">
            Sem pregão na data da leitura: ela fica fora da Qualidade da IA.
          </template>
        </p>
        <p class="detalhe__tese">{{ aberto.leitura.tese }}</p>

        <section v-if="aberto.motor" class="detalhe__motor">
          <h4>
            Leitura do motor <span class="detalhe__motor-selo">em código, proposta do FinMind a validar pelo Comitê</span>
          </h4>
          <p class="detalhe__linha">
            <span class="tendencia" :class="[`tendencia--${aberto.motor.etiqueta.classe}`, { 'tendencia--forte': aberto.motor.etiqueta.forte }]">
              <i class="bi" :class="aberto.motor.etiqueta.icone"></i> {{ aberto.motor.etiqueta.rotulo }}
            </span>
            <span v-if="aberto.motor.confianca" class="confianca" :class="`confianca--${aberto.motor.confianca.classe}`">
              {{ aberto.motor.confianca.rotulo }}
            </span>
            <span class="text-muted">S = {{ aberto.motor.score }} · cobertura {{ aberto.motor.cobertura }}</span>
            <span v-if="aberto.motor.diverge" class="motor__diverge">diverge da IA</span>
          </p>
          <ul>
            <li v-for="familia in aberto.motor.familias" :key="familia.rotulo"><strong>{{ familia.rotulo }}:</strong> {{ familia.texto }}</li>
            <li><strong>Fundos (F7, sem peso):</strong> {{ aberto.motor.fundos }}</li>
            <li v-if="aberto.motor.conflito"><strong>Conflito:</strong> {{ aberto.motor.conflito }}</li>
            <li v-for="motivo in aberto.motor.motivos" :key="motivo" class="text-muted">{{ motivo }}</li>
          </ul>
          <p class="detalhe__motor-nota">{{ aberto.motor.versao }}. A IA recebeu esta leitura como evidência, não como resposta.</p>
        </section>

        <template v-if="aberto.leitura.forcasDominantes">
          <h4>Forças dominantes</h4>
          <p>{{ aberto.leitura.forcasDominantes }}</p>
        </template>

        <div class="detalhe__colunas">
          <section>
            <h4>A favor</h4>
            <ul v-if="aberto.leitura.fatoresAFavor?.length">
              <li v-for="(item, i) in aberto.leitura.fatoresAFavor" :key="`f-${i}`">
                <code>{{ item.fator }}</code> {{ item.argumento }}
                <span v-if="item.evidencias?.length" class="text-muted">({{ item.evidencias.join(', ') }})</span>
              </li>
            </ul>
            <p v-else class="text-muted">Nenhum.</p>
          </section>
          <section>
            <h4>Contra</h4>
            <ul v-if="aberto.leitura.fatoresContra?.length">
              <li v-for="(item, i) in aberto.leitura.fatoresContra" :key="`c-${i}`">
                <code>{{ item.fator }}</code> {{ item.argumento }}
                <span v-if="item.evidencias?.length" class="text-muted">({{ item.evidencias.join(', ') }})</span>
              </li>
            </ul>
            <p v-else class="text-muted">Nenhum.</p>
          </section>
        </div>

        <template v-if="aberto.leitura.fatoresPoucoRelevantes?.length">
          <h4>Pouco relevantes neste horizonte</h4>
          <ul>
            <li v-for="(item, i) in aberto.leitura.fatoresPoucoRelevantes" :key="`p-${i}`"><code>{{ item.fator }}</code> {{ item.motivo }}</li>
          </ul>
        </template>

        <template v-if="aberto.leitura.posicionamentoCot">
          <h4>Posicionamento (COT)</h4>
          <p>
            <strong>{{ rotuloPapelCot(aberto.leitura.posicionamentoCot.papel) }}.</strong>
            {{ aberto.leitura.posicionamentoCot.comentario }}
          </p>
        </template>

        <template v-if="aberto.leitura.evidencias?.length">
          <h4>Evidências</h4>
          <ul>
            <li v-for="evidencia in aberto.leitura.evidencias" :key="evidencia.id">
              <strong>{{ evidencia.id }}</strong> <code v-if="evidencia.fator">{{ evidencia.fator }}</code>
              {{ evidencia.descricao }}<template v-if="evidencia.valorCitado">: {{ evidencia.valorCitado }}</template>
              <span v-if="evidencia.dataReferencia" class="text-muted"> ({{ formatarData(evidencia.dataReferencia) }})</span>
            </li>
          </ul>
        </template>

        <template v-if="aberto.leitura.lacunas?.length">
          <h4>Lacunas</h4>
          <ul>
            <li v-for="(lacuna, i) in aberto.leitura.lacunas" :key="`l-${i}`">
              <strong>{{ rotuloLacuna(lacuna.situacao) }}</strong> <code v-if="lacuna.fator">{{ lacuna.fator }}</code> {{ lacuna.efeito }}
            </li>
          </ul>
        </template>

        <template v-if="aberto.leitura.argumentoMaisForteContra">
          <h4>O argumento mais forte contra</h4>
          <p>{{ aberto.leitura.argumentoMaisForteContra }}</p>
        </template>

        <h4>Invalida esta leitura</h4>
        <p class="mb-0">{{ aberto.leitura.invalidaSe }}</p>
      </div>
    </Dialog>
  </article>
</template>

<style scoped>
/* A leitura do motor (o café, ADR 0066): uma linha discreta abaixo do realizado; no detalhe, um bloco destacado. */
.motor {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.15rem 0.45rem;
  font-size: 0.78rem;
}
.motor__valor {
  font-weight: 600;
}
.motor__valor--alta {
  color: var(--tendencia-alta);
}
.motor__valor--baixa {
  color: var(--tendencia-baixa);
}
.motor__valor--lateral {
  color: var(--tendencia-lateral);
}
.motor__diverge {
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: rgba(211, 154, 23, 0.15);
  color: #8a5f00;
  font-size: 0.68rem;
  font-weight: 600;
}
.detalhe__motor {
  margin: 0 0 1rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-surface-50);
}
.detalhe__motor h4 {
  margin-top: 0;
}
.detalhe__motor ul {
  margin-bottom: 0.4rem;
}
.detalhe__motor-selo {
  margin-left: 0.35rem;
  color: var(--p-text-muted-color);
  font-size: 0.72rem;
  font-weight: 400;
}
.detalhe__motor-nota {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

/* Cores das tendências. Também no detalhe: o modal é renderizado fora do card. */
.analise,
.detalhe {
  --tendencia-alta: #15803d;
  --tendencia-baixa: #b91c1c;
  --tendencia-lateral: #475569;
}

.analise {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-300);
  border-radius: 16px;
  background: var(--p-content-background);
  overflow: hidden;
}
.analise__topo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 1.15rem;
  padding: 1rem 0 0.9rem;
  border-bottom: 1px solid var(--p-content-border-color);
}
.analise__icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 2.4rem;
  height: 2.4rem;
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
  font-size: 1.1rem;
}
.analise__titulos {
  flex: 1;
  min-width: 0;
}
.analise__titulos h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}
.analise__referencia {
  margin: 0.1rem 0 0;
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
}
.analise__referencia strong {
  color: var(--p-text-color);
}
.analise__selo {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex: 0 0 auto;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  background: var(--p-content-hover-background);
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
.analise__qualidade {
  flex: 0 0 auto;
  font-size: 0.75rem;
  text-decoration: none;
  white-space: nowrap;
}
.analise__selo-ponto {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #6366f1;
}
@media (max-width: 575.98px) {
  .analise__topo {
    flex-wrap: wrap;
  }
  .analise__selo {
    order: 3;
  }
}

.analise__vazia {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem 1.5rem;
  text-align: center;
}
.analise__vazia > i {
  font-size: 1.75rem;
  color: var(--p-text-muted-color);
}
.analise__vazia-texto {
  margin: 0;
  font-weight: 600;
}
.analise__nota {
  margin: 0;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

/* Os 4 horizontes em linha do tempo (largura inteira): um traço liga os marcos de 1, 7, 30 e 90 dias, do centro da 1ª
   coluna ao da última. Em telas menores, 2x2 e depois um por linha, sem o traço. */
.analise__horizontes {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  padding: 2.4rem 1.15rem 1rem;
}
.analise__horizontes::before {
  content: "";
  position: absolute;
  top: 1.3rem;
  left: calc(1.15rem + (100% - 2.3rem - 3rem) / 8);
  right: calc(1.15rem + (100% - 2.3rem - 3rem) / 8);
  height: 2px;
  background: linear-gradient(90deg, var(--p-surface-300), var(--p-surface-400, #94a3b8));
}
@media (max-width: 991.98px) {
  .analise__horizontes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding-top: 1rem;
  }
  .analise__horizontes::before,
  .horizonte__marco {
    display: none;
  }
}
@media (max-width: 575.98px) {
  .analise__horizontes {
    grid-template-columns: minmax(0, 1fr);
  }
}

.horizonte__marco {
  position: absolute;
  top: -1.45rem;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  transform: translateX(-0.35rem);
  --marco-cor: var(--p-surface-400, #94a3b8);
}
.horizonte__marco-ponto {
  width: 0.7rem;
  height: 0.7rem;
  border: 2px solid var(--p-content-background);
  border-radius: 50%;
  background: var(--marco-cor);
  box-shadow: 0 0 0 1px var(--marco-cor);
}
.horizonte__marco-rotulo {
  padding: 0 0.3rem;
  background: var(--p-content-background);
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--p-text-muted-color);
}
.horizonte__marco--alta {
  --marco-cor: var(--tendencia-alta);
}
.horizonte__marco--baixa {
  --marco-cor: var(--tendencia-baixa);
}
.horizonte__marco--lateral {
  --marco-cor: var(--tendencia-lateral);
}

.horizonte {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.75rem;
  padding: 1rem 1.1rem 0.85rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 14px;
  background: var(--p-content-background);
  color: inherit;
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.horizonte:hover:not(:disabled),
.horizonte:focus-visible {
  border-color: var(--p-primary-color);
  box-shadow: 0 4px 14px rgba(19, 33, 59, 0.08);
}
.horizonte:disabled {
  cursor: default;
}

.horizonte__topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.horizonte__nome {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
}

/* Chip da confiança: âmbar (baixa), azul claro (média), azul forte (alta). Sem verde nem vermelho, que são a direção. */
.confianca {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.6rem;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}
.confianca--baixa {
  color: #92400e;
  border-color: rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.16);
}
.confianca--media {
  color: #1d4ed8;
  border-color: rgba(59, 130, 246, 0.35);
  background: rgba(59, 130, 246, 0.1);
}
.confianca--alta {
  color: #fff;
  border-color: #1d4ed8;
  background: #1d4ed8;
}
.confianca--nenhuma {
  color: var(--p-text-muted-color);
  border-color: var(--p-surface-300);
  border-style: dashed;
}

.horizonte__meio {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.tendencia {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.75rem;
  border: 1px solid;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.tendencia--alta {
  color: var(--tendencia-alta);
  border-color: rgba(34, 197, 94, 0.35);
  background: rgba(34, 197, 94, 0.1);
}
.tendencia--baixa {
  color: var(--tendencia-baixa);
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.1);
}
.tendencia--lateral {
  color: var(--tendencia-lateral);
  border-color: rgba(100, 116, 139, 0.35);
  background: rgba(100, 116, 139, 0.1);
}
/* Forte: a etiqueta preenchida com a cor cheia. */
.tendencia--forte.tendencia--alta {
  color: #fff;
  border-color: var(--tendencia-alta);
  background: var(--tendencia-alta);
}
.tendencia--forte.tendencia--baixa {
  color: #fff;
  border-color: var(--tendencia-baixa);
  background: var(--tendencia-baixa);
}
.tendencia--insuficiente {
  color: var(--p-text-muted-color);
  border-color: var(--p-surface-300);
  border-style: dashed;
  background: transparent;
}

.horizonte__faixa {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2rem;
}
.horizonte__faixa-rotulo {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}
.faixa {
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 6px;
  background: var(--p-content-hover-background);
  font-family: var(--bs-font-monospace, ui-monospace, monospace);
  font-size: 0.75rem;
  white-space: nowrap;
}
.faixa--vazia {
  font-family: inherit;
  font-style: italic;
  color: var(--p-text-muted-color);
}

/* O realizado: uma linha discreta abaixo da faixa lida, com a cor da faixa em que o preço caiu (sem marca de acerto). */
.realizado {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.2rem 0.5rem;
  padding-top: 0.55rem;
  border-top: 1px dashed var(--p-surface-300);
}
.realizado__valor {
  font-size: 0.8rem;
  font-weight: 700;
}
.realizado__valor--alta {
  color: var(--tendencia-alta);
}
.realizado__valor--baixa {
  color: var(--tendencia-baixa);
}
.realizado__valor--lateral,
.realizado__valor--insuficiente {
  color: var(--tendencia-lateral);
}
.realizado__nota {
  font-size: 0.72rem;
  color: var(--p-text-muted-color);
}
.detalhe__realizado {
  margin: 0 0 0.6rem;
  font-size: 0.85rem;
}

.horizonte__tese {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 0.82rem;
  line-height: 1.55;
}
.horizonte__abrir {
  display: inline-flex;
  align-items: center;
  align-self: flex-end;
  margin-top: auto;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-primary-color);
  opacity: 0.55;
  transition: opacity 0.15s;
}
.horizonte:hover .horizonte__abrir,
.horizonte:focus-visible .horizonte__abrir {
  opacity: 1;
}

.analise__rodape {
  margin: auto 1.15rem 0;
  padding: 0 0 0.9rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
.analise__proveniencia {
  display: block;
  margin-top: 0.2rem;
}

.detalhe h4 {
  margin: 1rem 0 0.35rem;
  font-size: 0.85rem;
  font-weight: 700;
}
.detalhe p,
.detalhe li {
  font-size: 0.875rem;
  line-height: 1.5;
}
.detalhe ul {
  padding-left: 1.1rem;
  margin: 0;
}
.detalhe__linha {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin: 0 0 0.6rem;
}
.detalhe__tese {
  margin: 0;
  font-weight: 600;
}
.detalhe__colunas {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
@media (max-width: 575.98px) {
  .detalhe__colunas {
    grid-template-columns: minmax(0, 1fr);
  }
}
.detalhe code {
  font-size: 0.75rem;
}
</style>
