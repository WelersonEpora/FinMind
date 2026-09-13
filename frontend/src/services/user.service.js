import http from './http.js'

async function listUsers() {
  const { data } = await http.get('/api/v1/users')
  return data.users
}

async function createUser(payload) {
  const { data } = await http.post('/api/v1/users', payload)
  return data.user
}

async function updateUser(id, payload) {
  const { data } = await http.patch(`/api/v1/users/${id}`, payload)
  return data.user
}

async function updateOwnProfile(payload) {
  const { data } = await http.patch('/api/v1/users/me', payload)
  return data.user
}

export default { listUsers, createUser, updateUser, updateOwnProfile }
