<script setup>
import { computed, ref, watch } from 'vue'
import metodologiaAtivoService from '../../services/metodologia-ativo.service.js'
import { formatarData, nivel, pressao, rotuloFonte, rotuloGrau, rotuloTipo } from '../../utils/geopolitica.js'

// O resultado de um fator de evento (ADR 0050): não há cálculo. São os eventos aceitos da leitura diária marcados com
// o fator, na janela dele até hoje, cada um com a data da leitura que o registrou, a idade, a fonte e a leitura da IA;
// e o texto exato que vai ao prompt da IA do ativo. A regra e o texto vêm do backend; a tela só desenha.
const props = defineProps({
  ativo: { type: String, required: true },
  fator: { type: String, required: true },
  // AAAA-MM-DD numa simulação; vazio = hoje.
  data: { type: String, default: '' }
})

const loading = ref(true)
const errorMessage = ref('')
const resultado = ref(null)

async function carregar() {
  loading.value = true
  errorMessage.value = ''
  try {
    const { eventosFator } = await metodologiaAtivoService.getEventosFator(props.ativo, props.fator, { data: props.data || undefined })
    resultado.value = eventosFator
  } catch (err) {
    errorMessage.value = err?.response?.data?.error?.message || 'Não foi possível carregar os eventos deste fator.'
  } finally {
    loading.value = false
  }
}

watch([() => props.fator, () => props.data], carregar, { immediate: true })

// Só as páginas que sustentam o evento (ligadas a ele pela pesquisa), como no bloco do prompt.
function fontesDoEvento(evento) {
  return (evento.fontes || []).filter((fonte) => fonte.origem === 'pesquisa' && fonte.url)
}

function idade(dias) {
  if (dias === 0) return 'hoje'
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`
}

const retrato = computed(() => resultado.value?.ultimaLeitura || null)
</script>

<template>
  <section class="eventos-fator">
    <div class="eventos-fator__topo">
      <h4>Resultado do fator <small>os eventos que vão ao prompt da IA do ativo</small></h4>
      <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="loading" @click="carregar">
        <i class="bi bi-arrow-clockwise"></i> Atualizar
      </button>
    </div>

    <div v-if="loading" class="text-muted">Carregando...</div>
    <div v-else-if="errorMessage" class="alert alert-danger mb-0">{{ errorMessage }}</div>
    <template v-else-if="resultado">
      <p class="eventos-fator__janela">
        Últimos {{ resultado.janelaDias }} dias ({{ formatarData(resultado.inicio) }} a
        {{ formatarData(resultado.dataReferencia) }}) · {{ resultado.leiturasNaJanela }} leitura(s)
        <template v-if="resultado.primeiraLeitura && resultado.primeiraLeitura > resultado.inicio">
          · a leitura diária começou em {{ formatarData(resultado.primeiraLeitura) }}
        </template>
      </p>

      <div v-if="!resultado.primeiraLeitura" class="alert alert-warning small mb-2">
        A leitura diária ainda não rodou para este ativo: sem eventos não quer dizer situação normal.
      </div>
      <p v-else-if="resultado.diasSemLeitura.length" class="eventos-fator__sem-leitura">
        <i class="bi bi-exclamation-triangle"></i>
        {{ resultado.diasSemLeitura.length }} dia(s) sem leitura na janela (sem informação, não calmaria):
        {{ resultado.diasSemLeitura.slice(0, 10).map(formatarData).join(', ') }}<template v-if="resultado.diasSemLeitura.length > 10">…</template>
      </p>

      <div v-if="retrato" class="eventos-fator__retrato">
        <span class="eventos-fator__nivel" :class="`eventos-fator__nivel--${nivel(retrato.nivel).classe}`">{{ nivel(retrato.nivel).rotulo }}</span>
        <span><strong>Leitura de {{ formatarData(retrato.data) }}:</strong> {{ retrato.resumo }}</span>
      </div>

      <p v-if="resultado.eventos.length === 0" class="text-muted small mb-2">Nenhum evento deste fator nas leituras da janela.</p>
      <ol v-else class="eventos-fator__lista">
        <li v-for="(evento, i) in resultado.eventos" :key="`${evento.data}-${i}`" class="eventos-fator__evento">
          <div class="eventos-fator__evento-topo">
            <span class="eventos-fator__quando">Registrado em {{ formatarData(evento.data) }}, {{ idade(evento.idadeDias) }}</span>
            <span class="eventos-fator__tipo">{{ rotuloTipo(evento.tipo) }}</span>
            <span v-if="pressao(evento.pressao)" class="eventos-fator__pressao" :class="`eventos-fator__pressao--${pressao(evento.pressao).classe}`">
              <i class="bi" :class="pressao(evento.pressao).icone"></i> Pressão {{ pressao(evento.pressao).rotulo.toLowerCase() }}
            </span>
          </div>
          <strong class="eventos-fator__titulo">{{ evento.titulo }}</strong>
          <p v-if="evento.resumo" class="eventos-fator__texto">{{ evento.resumo }}</p>
          <p v-if="evento.canalTransmissao" class="eventos-fator__texto"><strong>Canal:</strong> {{ evento.canalTransmissao }}</p>
          <p class="eventos-fator__graus">
            Intensidade: {{ rotuloGrau(evento.intensidade) }} · Confiança: {{ rotuloGrau(evento.confianca) }}
            <template v-if="fontesDoEvento(evento).length">
              · Fonte:
              <template v-for="(fonte, j) in fontesDoEvento(evento)" :key="fonte.url">
                <template v-if="j > 0">, </template>
                <a :href="fonte.url" target="_blank" rel="noopener noreferrer">{{ rotuloFonte(fonte) }}</a>
              </template>
            </template>
          </p>
        </li>
      </ol>

      <details class="eventos-fator__prompt">
        <summary>Texto exato que vai ao prompt</summary>
        <pre>{{ resultado.contexto }}</pre>
      </details>
    </template>
  </section>
</template>

<style scoped>
.eventos-fator {
  border: 1px solid rgba(19, 33, 59, 0.1);
  border-radius: 14px;
  padding: 1rem;
  background: var(--p-content-background);
}

.eventos-fator__topo {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.6rem;
}

.eventos-fator__topo h4 {
  margin: 0;
  font-size: 1rem;
}

.eventos-fator__topo h4 small {
  margin-left: 0.4rem;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
}

.eventos-fator__janela,
.eventos-fator__sem-leitura {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.eventos-fator__sem-leitura {
  color: #8a5a00;
}

.eventos-fator__retrato {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  background: rgba(19, 33, 59, 0.04);
  font-size: 0.85rem;
}

.eventos-fator__nivel {
  flex-shrink: 0;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  background: rgba(19, 33, 59, 0.1);
}

.eventos-fator__nivel--atencao {
  background: #fff1c2;
  color: #7a5a00;
}

.eventos-fator__nivel--relevante {
  background: #ffd9b8;
  color: #8a3f00;
}

.eventos-fator__nivel--excepcional {
  background: #f8c9c9;
  color: #8f1d1d;
}

.eventos-fator__lista {
  margin: 0 0 0.75rem;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.eventos-fator__evento-topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.6rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.eventos-fator__tipo {
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: rgba(19, 33, 59, 0.07);
  color: #13213b;
  font-weight: 600;
}

.eventos-fator__pressao {
  font-weight: 600;
}

.eventos-fator__pressao--alta {
  color: #1d7a3a;
}

.eventos-fator__pressao--baixa {
  color: #b42323;
}

.eventos-fator__titulo {
  display: block;
  margin: 0.2rem 0;
  font-size: 0.9rem;
}

.eventos-fator__texto,
.eventos-fator__graus {
  margin: 0 0 0.25rem;
  font-size: 0.83rem;
  line-height: 1.5;
}

.eventos-fator__graus {
  color: var(--p-text-muted-color);
}

.eventos-fator__prompt summary {
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
}

.eventos-fator__prompt pre {
  margin: 0.5rem 0 0;
  padding: 0.75rem;
  max-height: 22rem;
  overflow: auto;
  white-space: pre-wrap;
  border-radius: 8px;
  background: rgba(19, 33, 59, 0.05);
  font-size: 0.75rem;
}
</style>
