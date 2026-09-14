import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import 'bootstrap-icons/font/bootstrap-icons.css'
import 'primeicons/primeicons.css'
import './assets/main.css'
import App from './App.vue'
import router from './router/index.js'
import finmindPreset from './theme/finmind-preset.js'

// Locale pt-BR do PrimeVue (paginação, etc.) - mesmo dicionário usado no
// AgroMind.
const localePtBR = {
  dayNames: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
  dayNamesShort: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  dayNamesMin: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
  monthNames: [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ],
  monthNamesShort: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  today: 'Hoje',
  clear: 'Limpar',
  dateFormat: 'dd/mm/yy'
}

createApp(App)
  .use(router)
  .use(PrimeVue, { theme: { preset: finmindPreset }, locale: localePtBR })
  .mount('#app')
