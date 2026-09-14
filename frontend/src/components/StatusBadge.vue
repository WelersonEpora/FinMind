<script setup>
const props = defineProps({
  status: { type: String, required: true }
})

const CONFIG = {
  // Execuções de coleta (collection_execution.status)
  running: { label: 'Em andamento', classe: 'text-bg-secondary' },
  success: { label: 'Sucesso', classe: 'text-bg-success' },
  partial_success: { label: 'Parcial', classe: 'text-bg-warning' },
  failed: { label: 'Falha', classe: 'text-bg-danger' },
  // Frescor de um observável (observaveis.service.js::calcularSituacao)
  EM_DIA: { label: 'Em dia', classe: 'text-bg-success' },
  ATRASADA: { label: 'Atrasada', classe: 'text-bg-warning' },
  SEM_COLETA: { label: 'Sem coleta', classe: 'text-bg-secondary' }
}

function config() {
  return CONFIG[props.status] || { label: props.status, classe: 'text-bg-secondary' }
}
</script>

<template>
  <span class="badge" :class="config().classe">{{ config().label }}</span>
</template>
