<script setup>
import { computed } from 'vue'
import { pressao } from '../../utils/geopolitica.js'

// Pressão do fato sobre o preço (prompt v2 da geopolítica): leitura da IA, com o resto constante. Não é previsão.
const props = defineProps({
  codigo: { type: String, default: null },
  // Texto antes do rótulo (ex.: "Pressão:"), para os cards; na tabela, só o rótulo.
  prefixo: { type: String, default: '' }
})

const exibicao = computed(() => pressao(props.codigo))
</script>

<template>
  <span
    v-if="exibicao"
    class="pressao"
    :class="`pressao--${exibicao.classe}`"
    :title="`Pressão do fato sobre o preço: ${exibicao.rotulo.toLowerCase()} (leitura da IA, com o resto constante)`"
  >
    <template v-if="prefixo">{{ prefixo }} </template><i class="bi" :class="exibicao.icone"></i> {{ exibicao.rotulo }}
  </span>
  <span v-else>—</span>
</template>

<style scoped>
.pressao {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 600;
  white-space: nowrap;
}
.pressao--alta {
  color: var(--p-green-600, #16a34a);
}
.pressao--baixa {
  color: var(--p-red-600, #dc2626);
}
.pressao--ambigua {
  color: var(--p-text-muted-color);
}
</style>
