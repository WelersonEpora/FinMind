import http from './http.js'

// Qualidade da IA (ADR 0064): as leituras de tendência de um ativo contra o realizado, com as medidas por horizonte, os
// dois benchmarks e as linhas que formam cada número.
async function getQualidadeIa({ ativo, desde, ate, versaoConfiguracao } = {}) {
  const { data } = await http.get('/api/v1/qualidade-ia', { params: { ativo, desde, ate, versaoConfiguracao } })
  return data
}

export default { getQualidadeIa }
