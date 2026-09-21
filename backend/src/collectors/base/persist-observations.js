"use strict";

const { URL } = require("node:url");
const pointInTimeService = require("../../services/point-in-time.service");
const observationRepository = require("../../repositories/observation.repository");

// `persist` comum a todo coletor que grava na camada point-in-time
// (observation, ADR 0008): delega ao serviço, que decide entre "novo",
// "mesmo valor" e "revisão" e nunca atualiza uma linha existente.
async function persistirObservacoes(validos, { execucaoId }, deps = {}) {
  const servico = deps.pointInTimeService || pointInTimeService;
  return servico.registrarObservacoes(validos, { execucaoId, coletadoEm: new Date() }, deps);
}

// `persist` de fontes que publicam EDIÇÕES datadas (WASDE, levantamentos da Conab): cada edição é uma "foto"
// do que se sabia naquele dia e entra com o `published_at` da edição. Duas travas, aprendidas no WASDE
// (ADR 0015):
//
// ORDEM DE CARGA: a coleta diária lê só a edição mais recente. Se ela gravasse uma série ANTES do backfill,
// o backfill depois não conseguiria inserir as edições antigas dessa série (o modelo append-only não insere
// versão no meio da sequência) e o vintage ficaria truncado. Por isso, com `exigirCargaInicial`, os valores de
// séries que ainda não têm carga histórica NÃO são gravados: vira uma falha com a instrução de rodar o
// backfill (`mensagemSemCarga`). O script de backfill chama com `exigirCargaInicial: false`.
//
// REINGESTÃO: o serviço só compara cada valor com a ÚLTIMA versão gravada; reler uma edição antiga seria lido
// como "conflito". Por isso, para séries JÁ carregadas, as edições já ingeridas (mesmo instante de publicação
// já presente na fonte) são descartadas. Uma série NOVA recebe todas as edições, em ordem.
async function persistirPorEdicao(validos, contexto, deps, { sourceCode, exigirCargaInicial, mensagemSemCarga }) {
  const repo = deps.observationRepository || observationRepository;
  const publicacoes = await repo.listarSeriesEInstantes(sourceCode, { transaction: deps.transaction });
  const seriesCarregadas = new Set(publicacoes.map((p) => p.series_code));
  const jaIngeridos = new Set(publicacoes.map((p) => new Date(p.published_at).getTime()));

  const falhas = [];
  let candidatos = validos;
  if (exigirCargaInicial) {
    const semCarga = validos.filter((v) => !seriesCarregadas.has(v.series_code));
    if (semCarga.length > 0) {
      const series = new Set(semCarga.map((v) => v.series_code)).size;
      falhas.push({ item: null, motivo: mensagemSemCarga({ series, valores: semCarga.length }) });
      candidatos = validos.filter((v) => seriesCarregadas.has(v.series_code));
    }
  }

  const novos = candidatos.filter((v) => !(seriesCarregadas.has(v.series_code) && jaIngeridos.has(v.published_at.getTime())));
  const resultado = await persistirObservacoes(novos, contexto, deps);
  return {
    ...resultado,
    ignorados: resultado.ignorados + (candidatos.length - novos.length),
    falhas: [...falhas, ...resultado.falhas]
  };
}

// Download HTTP comum: erro de rede/HTTP vira UpstreamServiceError (o runner
// marca a execução como failed).
async function baixar(url, { signal, headers = {}, as = "text" }) {
  const { UpstreamServiceError } = require("../../shared/errors");
  let response;
  try {
    response = await fetch(url, { signal, headers: { "user-agent": "FinMind/0.1 (coleta de dados de mercado)", ...headers } });
  } catch (err) {
    throw new UpstreamServiceError(`Falha de rede ao consultar ${new URL(url).host}: ${err.message}`);
  }
  if (!response.ok) {
    throw new UpstreamServiceError(`${new URL(url).host} respondeu com status ${response.status}.`);
  }
  return as === "json" ? response.json() : response.text();
}

module.exports = { persistirObservacoes, persistirPorEdicao, baixar };
