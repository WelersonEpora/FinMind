import http from './http.js'

async function getStatus() {
  const { data } = await http.get('/api/v1/status')
  return data
}

export default { getStatus }
