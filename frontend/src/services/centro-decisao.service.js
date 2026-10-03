import http from './http.js'

// Centro de Decisão (ADR 0048): o preço do ativo como era conhecido na data, a leitura de eventos dela e, no petróleo,
// a leitura de tendência da IA com as evidências (ADR 0052).
async function getCentroDecisao({ ativo, data, serie } = {}) {
  const { data: resposta } = await http.get('/api/v1/centro-decisao', { params: { ativo, data, serie } })
  return resposta
}

// O prompt enviado à IA e a resposta dela, como ficaram gravados na leitura da data (só ao abrir o modal).
async function getAnaliseEnviada(ativo, dataAnalise) {
  const { data } = await http.get('/api/v1/centro-decisao/analise', { params: { ativo, data: dataAnalise } })
  return data
}

export default { getCentroDecisao, getAnaliseEnviada }
