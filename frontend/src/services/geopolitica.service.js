import http from './http.js'

// Leitura diária de eventos de mercado (ADRs 0047 e 0049): a tela Eventos só lê.
async function listarEventos({ ativo, situacao, dataInicio, dataFim, pagina, tamanhoPagina, ordem } = {}) {
  const { data } = await http.get('/api/v1/geopolitica/eventos', {
    params: { ativo, situacao, dataInicio, dataFim, pagina, tamanhoPagina, ordem }
  })
  return data
}

async function getUltimaLeitura() {
  const { data } = await http.get('/api/v1/geopolitica/leituras/ultima')
  return data
}

// O que foi enviado à IA e o que ela devolveu numa leitura (comum a todos os eventos dela).
async function getDetalheIa(leituraId) {
  const { data } = await http.get(`/api/v1/geopolitica/leituras/${leituraId}/ia`)
  return data
}

export default { listarEventos, getUltimaLeitura, getDetalheIa }
