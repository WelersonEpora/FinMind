import http from './http.js'

async function listarDocumentos() {
  const { data } = await http.get('/api/v1/documentos')
  return data.documentos
}

async function obterDocumento(id) {
  const { data } = await http.get(`/api/v1/documentos/${encodeURIComponent(id)}`)
  return data.documento
}

export default { listarDocumentos, obterDocumento }
