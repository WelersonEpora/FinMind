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

function photoFormData(file) {
  const formData = new FormData()
  formData.append('photo', file)
  return formData
}

async function uploadMyPhoto(file) {
  const { data } = await http.post('/api/v1/users/me/photo', photoFormData(file))
  return data.user
}

async function removeMyPhoto() {
  const { data } = await http.delete('/api/v1/users/me/photo')
  return data.user
}

async function uploadUserPhoto(id, file) {
  const { data } = await http.post(`/api/v1/users/${id}/photo`, photoFormData(file))
  return data.user
}

async function removeUserPhoto(id) {
  const { data } = await http.delete(`/api/v1/users/${id}/photo`)
  return data.user
}

export default {
  listUsers,
  createUser,
  updateUser,
  updateOwnProfile,
  uploadMyPhoto,
  removeMyPhoto,
  uploadUserPhoto,
  removeUserPhoto
}
