import http from './http.js'

async function getDashboard() {
  const { data } = await http.get('/api/v1/dashboard')
  return data
}

export default { getDashboard }
