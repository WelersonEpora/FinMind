import http from './http.js'

async function getMetodologiaAtivo(ativo = 'PETROLEO') {
  const { data } = await http.get(`/api/v1/ativos/${encodeURIComponent(ativo)}/metodologia`)
  return data
}

// `desde` (AAAA-MM-DD) opcional: sem ele, o histórico inteiro. `parametros`: os da camada C, para simular (sem eles,
// os padrões do fator).
// `data` (AAAA-MM-DD) opcional: simula o fator naquela data, com o que se sabia até o fim dela.
async function getCalculoFator(ativo, fator, { desde, parametros, data: dataSimulada } = {}) {
  const { data } = await http.get(
    `/api/v1/ativos/${encodeURIComponent(ativo)}/metodologia/fatores/${encodeURIComponent(fator)}/calculo`,
    { params: { ...(desde ? { desde } : {}), ...(dataSimulada ? { data: dataSimulada } : {}), ...(parametros || {}) } }
  )
  return data
}

// O resultado de um fator de evento (ADR 0050): os eventos da leitura diária marcados com ele, na janela do fator, e o
// texto que vai ao prompt.
async function getEventosFator(ativo, fator, { data: dataSimulada } = {}) {
  const { data } = await http.get(`/api/v1/ativos/${encodeURIComponent(ativo)}/metodologia/fatores/${encodeURIComponent(fator)}/eventos`, {
    params: dataSimulada ? { data: dataSimulada } : {}
  })
  return data
}

// Simulação numa data (AAAA-MM-DD): o resumo de cada fator com o que se sabia até o fim dela e o bloco completo.
async function getSimulacao(ativo, dataSimulada) {
  const { data } = await http.get(`/api/v1/ativos/${encodeURIComponent(ativo)}/metodologia/simulacao`, { params: { data: dataSimulada } })
  return data
}

function urlParametros(ativo, fator) {
  return `/api/v1/ativos/${encodeURIComponent(ativo)}/metodologia/fatores/${encodeURIComponent(fator)}/parametros`
}

// Histórico das versões dos parâmetros da camada C em uso no sistema (ADR 0050).
async function getParametros(ativo, fator) {
  const { data } = await http.get(urlParametros(ativo, fator))
  return data
}

// Grava os parâmetros como os valores do sistema (só admin): uma versão nova, com o motivo.
async function salvarParametros(ativo, fator, { parametros, motivo }) {
  const { data } = await http.post(urlParametros(ativo, fator), { parametros, motivo })
  return data
}

export default { getMetodologiaAtivo, getCalculoFator, getEventosFator, getSimulacao, getParametros, salvarParametros }
