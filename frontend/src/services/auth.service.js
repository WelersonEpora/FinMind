import http from './http.js'

async function login(email, password) {
  const { data } = await http.post('/api/v1/auth/login', { email, password })
  return data.user
}

async function logout() {
  await http.post('/api/v1/auth/logout')
}

async function me() {
  const { data } = await http.get('/api/v1/auth/me')
  return data.user
}

export default { login, logout, me }
