<script setup>
import { computed } from 'vue'
import { nivel } from '../../utils/geopolitica.js'

// Nível do dia da leitura de geopolítica (ADR 0047): Normal, Atenção, Relevante ou Excepcional.
const props = defineProps({
  codigo: { type: String, default: null }
})

const exibicao = computed(() => nivel(props.codigo))
</script>

<template>
  <span class="nivel-badge" :class="`nivel-badge--${exibicao.classe}`">{{ exibicao.rotulo }}</span>
</template>

<style scoped>
.nivel-badge {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  white-space: nowrap;
  border: 1px solid currentColor;
}
.nivel-badge--normal {
  color: var(--p-green-600, #16a34a);
}
.nivel-badge--atencao {
  color: var(--p-yellow-600, #ca8a04);
}
.nivel-badge--relevante {
  color: var(--p-orange-600, #ea580c);
}
.nivel-badge--excepcional {
  color: var(--p-red-600, #dc2626);
}
.nivel-badge--desconhecido {
  color: var(--p-text-muted-color);
}
</style>
