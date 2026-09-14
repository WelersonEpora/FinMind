// Customização mínima do preset Aura do PrimeVue - só alinha a cor
// primária ao azul já usado no resto do FinMind (Bootstrap `#0d6efd` /
// acento `#3B82F6`). Ao contrário do AgroMind (que tem um preset próprio de
// 71 linhas + um arquivo de tokens CSS dedicado, porque o PrimeVue é a
// única lib de UI de lá), aqui o PrimeVue é usado só nas telas de
// Observáveis/Execuções - decisão registrada em
// docs/adr/0005-primevue-para-tabelas-de-dados.md.
import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

export default definePreset(Aura, {
  semantic: {
    primary: {
      50: '{blue.50}',
      100: '{blue.100}',
      200: '{blue.200}',
      300: '{blue.300}',
      400: '{blue.400}',
      500: '#0d6efd',
      600: '#0b5ed7',
      700: '#0a58ca',
      800: '{blue.800}',
      900: '{blue.900}',
      950: '{blue.950}'
    }
  }
})
