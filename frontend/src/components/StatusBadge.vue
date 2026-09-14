<script setup>
const props = defineProps({
  status: { type: String, required: true }
})

const CONFIG = {
  // Execuções de coleta (collection_execution.status)
  running: { label: 'Em andamento', classe: 'status-badge--andamento', icone: 'pi-spin pi-spinner' },
  success: { label: 'Sucesso', classe: 'status-badge--sucesso', icone: 'pi-check-circle' },
  partial_success: { label: 'Parcial', classe: 'status-badge--parcial', icone: 'pi-exclamation-circle' },
  failed: { label: 'Falha', classe: 'status-badge--falha', icone: 'pi-times-circle' },
  // Frescor de um observável (observaveis.service.js::calcularSituacao)
  EM_DIA: { label: 'Em dia', classe: 'status-badge--sucesso', icone: 'pi-check-circle' },
  ATRASADA: { label: 'Atrasada', classe: 'status-badge--falha', icone: 'pi-exclamation-triangle' },
  SEM_COLETA: { label: 'Sem coleta', classe: 'status-badge--neutro', icone: 'pi-minus-circle' }
}

function config() {
  return CONFIG[props.status] || { label: props.status, classe: 'status-badge--neutro', icone: 'pi-question-circle' }
}
</script>

<template>
  <span class="status-badge" :class="config().classe">
    <i class="pi" :class="config().icone"></i> {{ config().label }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

/* Verde mais fechado que o --p-green-500 padrão do preset Aura (achado
   real: ficava claro demais) - mesmo tom usado no AgroMind
   (DashboardShell.vue, --positive: oklch(0.52 0.12 150)). */
.status-badge--sucesso {
  color: oklch(0.52 0.12 150);
}
.status-badge--parcial {
  color: #b8860b;
}
.status-badge--falha {
  color: var(--p-red-500);
}
.status-badge--andamento,
.status-badge--neutro {
  color: var(--p-surface-500);
}
</style>
