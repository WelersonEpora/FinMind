import axios from 'axios'

const TIMEOUT_PADRAO_MS = 20000

const http = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE_URL || '',
  timeout: TIMEOUT_PADRAO_MS,
  // Sessão viaja em cookie httpOnly - sem isso o navegador não envia o
  // cookie nas chamadas à API mesmo estando na mesma origem via proxy.
  withCredentials: true
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const isUnauthorized = error.response?.status === 401
    const isAuthEndpoint = error.config?.url?.includes('/auth/')

    if (isUnauthorized && !isAuthEndpoint && window.location.pathname !== '/login') {
      window.location.assign('/login')
    }

    return Promise.reject(error)
  }
)

export default http
