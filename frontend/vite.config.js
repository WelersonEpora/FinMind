import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Backend roda em outra porta em dev (npm run dev, fora do Docker).
// Proxy evita CORS, mantendo a mesma origem que o Nginx usa em produção
// (necessário também porque a autenticação depende de cookie).
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000'
    }
  }
})
