<script setup>
import { formatarMedida, periodoDoFator } from '../../utils/metodologia.js'
import { formatarData, nivel } from '../../utils/geopolitica.js'

// O resultado de um fator numa simulação (ADR 0050), numa linha do card: a medida da decisão com o período e a
// leitura do fator (C), num fator calculado; a contagem de eventos da janela e o nível do ativo, num fator de evento.
defineProps({
  resultado: { type: Object, required: true },
  // A data simulada (AAAA-MM-DD): antes da 1ª leitura diária, o fator de evento não tem informação.
  data: { type: String, required: true }
})
</script>

<template>
  <div class="resultado">
    <template v-if="resultado.tipo === 'CALCULADO'">
      <template v-if="resultado.medida">
        <span class="resultado__periodo">{{ periodoDoFator(resultado.periodicidade).referencia(resultado.observedAt) }}</span>
        <span>{{ resultado.medida.rotulo }}: <strong>{{ formatarMedida(resultado.medida.valor, resultado.medida.unidade) }}</strong></span>
        <span v-if="resultado.decisao" class="resultado__decisao" :class="`resultado__decisao--${resultado.decisao.direcao.toLowerCase()}`">
          {{ resultado.decisao.rotuloDirecao }} · {{ resultado.decisao.rotuloIntensidade
          }}<template v-if="resultado.decisao.rotuloTendencia"> · {{ resultado.decisao.rotuloTendencia }}</template>
        </span>
        <span v-else class="text-muted">leitura não calculada (histórico curto)</span>
      </template>
      <span v-else class="text-muted">Sem dado publicado até esta data.</span>
    </template>

    <template v-else-if="resultado.tipo === 'EVENTO'">
      <span v-if="!resultado.primeiraLeitura" class="text-muted">A leitura diária ainda não rodou para este ativo.</span>
      <span v-else-if="resultado.primeiraLeitura > data" class="text-muted">
        Sem leitura diária nesta data: ela começou em {{ formatarData(resultado.primeiraLeitura) }}.
      </span>
      <template v-else>
        <span><strong>{{ resultado.eventos }}</strong> evento(s) nos últimos {{ resultado.janelaDias }} dias</span>
        <span v-if="resultado.ultimaLeitura">
          nível do ativo em {{ formatarData(resultado.ultimaLeitura.data) }}: <strong>{{ nivel(resultado.ultimaLeitura.nivel).rotulo }}</strong>
        </span>
      </template>
    </template>
  </div>
</template>

<style scoped>
.resultado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
  padding: 0.45rem 0.6rem;
  border-radius: 8px;
  background: rgba(17, 102, 255, 0.05);
  font-size: 0.8rem;
}

.resultado__periodo {
  color: var(--p-text-muted-color);
}

.resultado__decisao {
  padding: 0.05rem 0.5rem;
  border-radius: 999px;
  font-weight: 600;
  background: rgba(19, 33, 59, 0.08);
}

.resultado__decisao--alta {
  background: #dff3e5;
  color: #1d6b35;
}

.resultado__decisao--baixa {
  background: #fbe1e1;
  color: #9b1c1c;
}
</style>
