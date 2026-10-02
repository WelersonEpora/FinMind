<script setup>
import { computed, ref, watch } from 'vue'
import { formatarDataLonga, semanaDe, somarDias } from '../../utils/centro-decisao.js'

// Seletor de data do Centro de Decisão (ADR 0048), no desenho do AgroMind (SeletorDataCentroDecisao.vue): a semana
// de calendário em botões, setas que andam uma semana e um calendário para pular para qualquer data. Datas futuras
// não são selecionáveis: a tela mostra só o que já se sabia.
const props = defineProps({
  modelValue: { type: String, required: true },
  hoje: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue'])

// Semana exibida: segue a data escolhida, mas as setas andam por ela sem mudar a seleção.
const referenciaSemana = ref(props.modelValue)
watch(
  () => props.modelValue,
  (valor) => {
    referenciaSemana.value = valor
  }
)

const dias = computed(() => semanaDe(referenciaSemana.value, props.hoje).map((d) => ({ ...d, selecionada: d.data === props.modelValue })))
const podeAvancar = computed(() => dias.value[6].data < props.hoje)

function selecionar(data) {
  if (data > props.hoje || data === props.modelValue) return
  emit('update:modelValue', data)
}

function andarSemana(sentido) {
  const proxima = somarDias(referenciaSemana.value, 7 * sentido)
  referenciaSemana.value = proxima > props.hoje ? props.hoje : proxima
}

function aoEscolherNoCalendario(evento) {
  if (evento.target.value) selecionar(evento.target.value)
}
</script>

<template>
  <div class="seletor-data">
    <label class="seletor-data__atual" title="Escolher outra data">
      <i class="bi bi-calendar3"></i>
      <span>{{ formatarDataLonga(modelValue) }}</span>
      <input class="seletor-data__calendario" type="date" :value="modelValue" :max="hoje" @change="aoEscolherNoCalendario" />
    </label>

    <button type="button" class="seletor-data__seta" title="Semana anterior" @click="andarSemana(-1)">
      <i class="bi bi-chevron-left"></i>
    </button>
    <div class="seletor-data__dias">
      <button
        v-for="dia in dias"
        :key="dia.data"
        type="button"
        class="seletor-data__dia"
        :class="{ 'seletor-data__dia--selecionado': dia.selecionada, 'seletor-data__dia--hoje': dia.data === hoje }"
        :disabled="dia.futuro"
        :title="dia.futuro ? 'Data futura' : formatarDataLonga(dia.data)"
        @click="selecionar(dia.data)"
      >
        <span class="seletor-data__dia-semana">{{ dia.diaSemana }}</span>
        <span class="seletor-data__dia-numero">{{ dia.dia }}</span>
      </button>
    </div>
    <button type="button" class="seletor-data__seta" title="Próxima semana" :disabled="!podeAvancar" @click="andarSemana(1)">
      <i class="bi bi-chevron-right"></i>
    </button>
  </div>
</template>

<style scoped>
.seletor-data {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.seletor-data__atual {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0.5rem 0 0;
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
  white-space: nowrap;
}

/* O input de data fica invisível por cima do rótulo: clicar no rótulo abre o calendário nativo. */
.seletor-data__calendario {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.seletor-data__calendario::-webkit-calendar-picker-indicator {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.seletor-data__seta {
  border: 0;
  background: transparent;
  color: var(--p-text-muted-color);
  padding: 0.25rem 0.35rem;
  border-radius: 8px;
}
.seletor-data__seta:hover:not(:disabled) {
  background: var(--p-content-hover-background);
  color: var(--p-text-color);
}
.seletor-data__seta:disabled {
  opacity: 0.35;
}

.seletor-data__dias {
  display: flex;
  gap: 0.15rem;
}

.seletor-data__dia {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 2.4rem;
  padding: 0.25rem 0.3rem;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--p-text-color);
  line-height: 1.15;
}
.seletor-data__dia:hover:not(:disabled):not(.seletor-data__dia--selecionado) {
  background: var(--p-content-hover-background);
}
.seletor-data__dia:disabled {
  color: var(--p-text-muted-color);
  opacity: 0.45;
}
.seletor-data__dia-semana {
  font-size: 0.62rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}
.seletor-data__dia-numero {
  font-size: 0.95rem;
  font-weight: 700;
}
.seletor-data__dia--hoje .seletor-data__dia-numero {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.seletor-data__dia--selecionado {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}
.seletor-data__dia--selecionado .seletor-data__dia-semana {
  color: inherit;
}
</style>
