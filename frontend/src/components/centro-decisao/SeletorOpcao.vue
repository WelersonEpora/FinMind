<script setup>
import { computed } from 'vue'

// Seletor do Centro de Decisão (ADR 0048), no desenho do AgroMind: a opção em uso em destaque e um menu com a marca
// na escolhida. Serve ao ativo (grande, com o emoji de cada um) e à série de preço do card (compacto, sem ícone).
// Dropdown do Bootstrap, como o seletor de espaço (WorkspaceSwitcher.vue).
const props = defineProps({
  modelValue: { type: String, required: true },
  // [{ codigo, nome, icone? }]: icone é um emoji, mostrado no botão e no menu.
  opcoes: { type: Array, required: true },
  // Para leitores de tela: "Ativo", "Série de preço".
  rotulo: { type: String, required: true },
  compacto: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

const atual = computed(() => props.opcoes.find((o) => o.codigo === props.modelValue) || props.opcoes[0])

function selecionar(codigo) {
  if (codigo !== props.modelValue) emit('update:modelValue', codigo)
}
</script>

<template>
  <div class="dropdown seletor-opcao" :class="{ 'seletor-opcao--compacto': compacto }">
    <button
      type="button"
      class="seletor-opcao__botao"
      data-bs-toggle="dropdown"
      aria-expanded="false"
      :aria-label="`${rotulo}: ${atual.nome}. Trocar`"
    >
      <span v-if="atual.icone" class="seletor-opcao__icone" aria-hidden="true">{{ atual.icone }}</span>
      <span class="seletor-opcao__nome">{{ atual.nome }}</span>
      <i class="bi bi-chevron-down seletor-opcao__chevron"></i>
    </button>

    <ul class="dropdown-menu seletor-opcao__menu" :class="{ 'dropdown-menu-end': compacto }">
      <li v-for="opcao in opcoes" :key="opcao.codigo">
        <button
          type="button"
          class="dropdown-item seletor-opcao__item"
          :class="{ 'seletor-opcao__item--atual': opcao.codigo === atual.codigo }"
          :aria-current="opcao.codigo === atual.codigo ? 'true' : undefined"
          @click="selecionar(opcao.codigo)"
        >
          <i class="bi bi-check2 seletor-opcao__marca" aria-hidden="true"></i>
          <span v-if="opcao.icone" class="seletor-opcao__item-icone" aria-hidden="true">{{ opcao.icone }}</span>
          <span>{{ opcao.nome }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.seletor-opcao__botao {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.3rem 0.5rem;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--p-text-color);
  transition: background 0.15s;
}
.seletor-opcao__botao:hover,
.seletor-opcao__botao[aria-expanded='true'] {
  background: var(--p-content-hover-background);
}
.seletor-opcao__botao:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.seletor-opcao__icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  line-height: 1;
}

.seletor-opcao__nome {
  font-size: 1.15rem;
  font-weight: 700;
}

.seletor-opcao__chevron {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  transition: transform 0.15s;
}
.seletor-opcao__botao[aria-expanded='true'] .seletor-opcao__chevron {
  transform: rotate(180deg);
}

.seletor-opcao__menu {
  min-width: 14rem;
  padding: 0.4rem;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.seletor-opcao__item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
}
.seletor-opcao__item:active {
  background: var(--p-content-hover-background);
  color: inherit;
}

.seletor-opcao__marca {
  width: 1rem;
  visibility: hidden;
  color: var(--p-primary-color);
}
.seletor-opcao__item--atual {
  font-weight: 700;
}
.seletor-opcao__item--atual .seletor-opcao__marca {
  visibility: visible;
}

.seletor-opcao__item-icone {
  font-size: 1.1rem;
  line-height: 1;
}

/* Compacto: no canto do título de um card (série de preço), com o menu alinhado à direita. */
.seletor-opcao--compacto .seletor-opcao__botao {
  gap: 0.4rem;
  padding: 0.2rem 0.4rem;
  border-radius: 8px;
}
.seletor-opcao--compacto .seletor-opcao__nome {
  font-size: 0.95rem;
}
.seletor-opcao--compacto .seletor-opcao__menu {
  font-size: 0.9rem;
}
</style>
