"use strict";

const { UpstreamServiceError } = require("../../shared/errors");
const logger = require("../../shared/logger");
const { somarDias, diaDaSemanaIso, paraDate } = require("../../shared/utils/date-utils");
const { zonedParaUtc } = require("../../shared/utils/zoned-time");
const { decodificarFuturoCcm } = require("../../shared/utils/b3-contrato");
const observationRepository = require("../../repositories/observation.repository");
const { persistirObservacoes } = require("../base/persist-observations");
const { extrairDoPdf, COLUNAS } = require("./b3-bdi-ccm.parser");

// B3 - HISTÓRICO do futuro de milho (CCM) por vencimento, a partir do Boletim Diário de Informações
// (BDI) em PDF. ADR 0020. Complementa o `b3-ccm-futuro` (CSV do Up2Data, janela rolante de ~15
// meses, ADR 0009): grava nas MESMAS séries `B3.CCM.<TICKER>.<CAMPO>` e acrescenta dois campos que o
// CSV não tem - OPEN (abertura) e OPEN_INTEREST (contratos em aberto).
//
// SÓ BACKFILL: não é registrado na coleta diária (collectors/index.js). O BDI só tem a tabela por
// vencimento no layout que vai de 2022-03-21 (1º boletim com o capítulo de derivativos) a 2025-12-11;
// desde 2025-12-12 o capítulo é um resumo sem vencimentos. Não há dado novo a coletar todo dia.
//
// COMPLEMENTAR, NUNCA CONCORRENTE: um par (série, pregão) que já existe no banco não é regravado.
// Motivo real (medido): o BDI ARREDONDA o volume para inteiro (218.878.358 x 218.878.357,50 no CSV);
// deixar o serviço point-in-time comparar geraria "revisões" falsas. O que já existe é mantido; a
// divergência entre as duas fontes é só MEDIDA (log), com tolerância de arredondamento no volume.
//
// published_at: a MESMA regra do `b3-ccm-futuro` (fim do dia do pregão em Brasília, estimado), para a
// série não ter duas regras de publicação conforme o período. O `lastUpdateDate` do BDI NÃO serve:
// é a hora da ÚLTIMA (re)publicação - achado real: pregões de fev/2025 republicados em 26/03/2025, 42
// dias depois. Ele fica em `metadata` (rastreabilidade), junto com o status ("Publicado"/"Republicado").

const API = "https://arquivos.b3.com.br/bdi/";
const CAPITULO = "03-1"; // "Derivativos" no layout antigo (o arquivo tem o capítulo inteiro, ~60 páginas)
const SOURCE_CODE = "B3";
const FUSO = "America/Sao_Paulo";
const PRIMEIRA_DATA = "2022-03-01"; // `minDate` do app do BDI; o 1º boletim com derivativos é 2022-03-21
const ULTIMA_DATA_LAYOUT_ANTIGO = "2025-12-11";
const CONCORRENCIA = 3;
const TENTATIVAS_POR_REQUISICAO = 3;
const PAUSA_ENTRE_TENTATIVAS_MS = 1000;
const TOLERANCIA_ARREDONDAMENTO = { VOLUME_BRL: 0.5 };

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Rede e 5xx = retentativa; 4xx = resposta definitiva. (A B3 responde 500 também para arquivo que não
// existe: por isso o arquivo só é pedido quando o status diz que o boletim do dia foi publicado.)
async function buscar(url, signal) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= TENTATIVAS_POR_REQUISICAO; tentativa += 1) {
    try {
      const response = await fetch(url, { signal, headers: { "user-agent": "FinMind/0.1 (coleta de dados de mercado)" } });
      if (response.status < 500) return response;
      ultimoErro = new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (err.name === "AbortError") throw err;
      ultimoErro = err;
    }
    if (tentativa < TENTATIVAS_POR_REQUISICAO) await dormir(PAUSA_ENTRE_TENTATIVAS_MS * tentativa);
  }
  throw ultimoErro;
}

// Um pregão: { data, situacao, ... }. situacao:
//   sem_boletim - o BDI não tem boletim nessa data (feriado; confirmado: todas as 59 datas assim entre
//                 2022-03 e 2026-09 são feriados da B3)
//   sem_tabela  - há boletim, mas sem a tabela de futuros do CCM (capítulo ausente ou layout novo)
//   ok          - tabela lida ({ linhas, invalidos })
//   erro        - falha real (download, PDF ilegível, data do boletim diferente, layout mudou)
async function baixarDia(data, signal) {
  const compacta = data.replace(/-/g, "");
  const arquivo = `BDI_${CAPITULO}_${compacta}.pdf`;
  try {
    const rStatus = await buscar(`${API}download/status?dateRef=${data}`, signal);
    if (!rStatus.ok) return { data, situacao: "erro", motivo: `Status do BDI: HTTP ${rStatus.status}` };
    const status = await rStatus.json();
    if (!status?.statusName) return { data, situacao: "sem_boletim" };

    const publicacao = { status: status.statusName, atualizadoEm: status.lastUpdateDate, errata: Boolean(status.errata) };
    const url = `${API}download/bdi/${data}/${arquivo}`;
    let rPdf;
    try {
      rPdf = await buscar(url, signal);
    } catch (err) {
      if (err.name === "AbortError") throw err;
      return { data, situacao: "erro", publicacao, arquivo, motivo: `Download do ${arquivo} falhou: ${err.message}` };
    }
    if (!rPdf.ok) return { data, situacao: "erro", publicacao, arquivo, motivo: `Download do ${arquivo}: HTTP ${rPdf.status}` };

    const resultado = await extrairDoPdf(Buffer.from(await rPdf.arrayBuffer()));
    if (resultado.dataReferencia && resultado.dataReferencia !== data) {
      return { data, situacao: "erro", publicacao, arquivo, motivo: `O boletim baixado é de ${resultado.dataReferencia}, não de ${data}.` };
    }
    return { data, publicacao, arquivo, url, ...resultado };
  } catch (err) {
    if (err.name === "AbortError") throw err;
    return { data, situacao: "erro", arquivo, motivo: `Falha ao ler o ${arquivo}: ${err.message}` };
  }
}

function diasUteis(dataInicial, dataFinal) {
  const dias = [];
  for (let d = dataInicial; d <= dataFinal; d = somarDias(d, 1)) {
    if (diaDaSemanaIso(d) <= 5) dias.push(d);
  }
  return dias;
}

// Baixa e lê um intervalo de pregões (um PDF de ~500 KB por dia). Guarda só o resultado da tabela do
// CCM, nunca o PDF - um backfill completo (~940 boletins) não cabe na memória de outra forma.
async function downloadIntervalo({ dataInicial = PRIMEIRA_DATA, dataFinal = ULTIMA_DATA_LAYOUT_ANTIGO, signal, log = logger } = {}) {
  paraDate(dataInicial);
  paraDate(dataFinal);
  const dias = diasUteis(dataInicial, dataFinal);
  const resultados = [];

  for (let i = 0; i < dias.length; i += CONCORRENCIA) {
    resultados.push(...(await Promise.all(dias.slice(i, i + CONCORRENCIA).map((d) => baixarDia(d, signal)))));
    const feitos = Math.min(i + CONCORRENCIA, dias.length);
    if (feitos % 60 < CONCORRENCIA || feitos === dias.length) {
      log.info({ feitos, total: dias.length, ultimoDia: dias[feitos - 1] }, "Backfill do CCM via BDI: progresso");
    }
  }
  return resultados;
}

// Resumo por situação (usado pelo script de backfill para relatar lacunas).
function resumirDias(rawData) {
  const porSituacao = {};
  for (const dia of rawData) (porSituacao[dia.situacao] ||= []).push(dia.data);
  const ok = porSituacao.ok || [];
  return {
    diasUteis: rawData.length,
    comTabela: ok.length,
    primeiroComTabela: ok[0] || null,
    ultimoComTabela: ok.at(-1) || null,
    semBoletim: porSituacao.sem_boletim || [],
    semTabela: rawData.filter((d) => d.situacao === "sem_tabela").map((d) => ({ data: d.data, motivo: d.motivo })),
    erros: rawData.filter((d) => d.situacao === "erro").map((d) => ({ data: d.data, motivo: d.motivo })),
    formatos: rawData.reduce((acc, d) => (d.formato ? { ...acc, [d.formato]: (acc[d.formato] || 0) + 1 } : acc), {})
  };
}

// Dia sem boletim (feriado) e boletim sem tabela NÃO são erro (são lacunas da fonte, relatadas pelo
// script). Erro de verdade vira item inválido -> execução partial_success.
function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta do BDI em formato inesperado (esperava a lista de pregões).");
  }

  // Se NENHUM boletim publicado de uma janela com vários pregões teve a tabela lida, a fonte mudou ou
  // caiu (ou a janela está toda no layout novo) - não é lacuna isolada. Falha alto.
  const publicados = rawData.filter((d) => d.situacao !== "sem_boletim");
  if (publicados.length >= 4 && !publicados.some((d) => d.situacao === "ok")) {
    const amostra = publicados.at(-1);
    throw new UpstreamServiceError(
      `Nenhum dos ${publicados.length} boletins do BDI teve a tabela de futuros do CCM lida (último: ${amostra.data}, ${amostra.situacao}${amostra.motivo ? `: ${amostra.motivo}` : ""}). O layout antigo vai até ${ULTIMA_DATA_LAYOUT_ANTIGO}.`
    );
  }

  const itens = [];
  for (const dia of rawData) {
    if (dia.situacao === "ok") {
      const contexto = { data: dia.data, formato: dia.formato, publicacao: dia.publicacao, arquivo: dia.arquivo, url: dia.url };
      for (const linha of dia.linhas) itens.push({ ...contexto, linha });
      for (const invalido of dia.invalidos) itens.push({ data: dia.data, problema: `${invalido.vencimento}: ${invalido.motivo}` });
    } else if (dia.situacao === "erro") {
      itens.push({ data: dia.data, problema: dia.motivo });
    }
  }
  return itens;
}

function normalize(rawItems) {
  const validos = [];
  const invalidos = [];

  for (const item of rawItems) {
    if (item.problema) {
      invalidos.push({ item, motivo: `BDI ${item.data}: ${item.problema}` });
      continue;
    }

    const ticker = `CCM${item.linha.vencimento}`;
    const contrato = decodificarFuturoCcm(ticker);
    if (!contrato) {
      invalidos.push({ item, motivo: `BDI ${item.data}: vencimento "${item.linha.vencimento}" não reconhecido.` });
      continue;
    }

    const publicadoEm = zonedParaUtc(item.data, "23:59:59", FUSO);
    for (const coluna of COLUNAS) {
      if (!coluna) continue;
      const valor = item.linha.valores[coluna.sufixo];
      if (valor === null || valor === undefined) continue; // "-" no boletim: sem negócio / sem posição
      validos.push({
        series_code: `B3.CCM.${ticker}.${coluna.sufixo}`,
        observed_at: item.data,
        value: valor,
        unit: coluna.unit,
        source_code: SOURCE_CODE,
        published_at: publicadoEm,
        published_at_is_estimated: true,
        published_at_basis: "lag_rule",
        metadata: {
          fonte: "B3 BDI - Boletim Diário de Informações (PDF, capítulo de derivativos)",
          arquivo: item.arquivo,
          url: item.url,
          ticker,
          vencimento: contrato.vencimento,
          campoFonte: coluna.campoFonte,
          formatoNumerico: item.formato,
          bdiStatus: item.publicacao?.status || null,
          bdiAtualizadoEm: item.publicacao?.atualizadoEm || null,
          regraPublicacao: "fim_do_dia_do_pregao_brt"
        }
      });
    }
  }

  return { validos, invalidos };
}

function divergem(sufixo, a, b) {
  return Math.abs(Number(a) - Number(b)) > (TOLERANCIA_ARREDONDAMENTO[sufixo] ?? 1e-6);
}

// Persistência COMPLEMENTAR: só o que ainda não existe para (série, pregão) é gravado; o que já existe
// (em geral vindo do CSV do `b3-ccm-futuro`) fica como está e conta como ignorado. As divergências
// entre os dois valores são medidas e registradas no log (conferência cruzada), sem virar revisão.
async function persistirComplemento(validos, contexto, deps = {}) {
  const repo = deps.observationRepository || observationRepository;
  const log = deps.logger || logger;

  const porSerie = new Map();
  for (const v of validos) {
    if (!porSerie.has(v.series_code)) porSerie.set(v.series_code, []);
    porSerie.get(v.series_code).push(v);
  }

  const novos = [];
  let jaExistentes = 0;
  let conferidos = 0;
  const divergencias = [];
  for (const [seriesCode, valores] of porSerie) {
    const existentes = await repo.buscarUltimasVersoes(seriesCode, { transaction: deps.transaction });
    const sufixo = seriesCode.split(".").at(-1);
    for (const v of valores) {
      const existente = existentes.get(v.observed_at);
      if (!existente) {
        novos.push(v);
        continue;
      }
      jaExistentes += 1;
      conferidos += 1;
      if (divergem(sufixo, existente.value, v.value)) {
        divergencias.push({ serie: seriesCode, pregao: v.observed_at, noBanco: Number(existente.value), noBdi: v.value });
      }
    }
  }

  if (conferidos > 0) {
    const nivel = divergencias.length > 0 ? "warn" : "info";
    log[nivel](
      { conferidos, divergencias: divergencias.length, amostra: divergencias.slice(0, 20) },
      "Conferência cruzada BDI x valores já gravados (o que já existe é mantido)"
    );
  }

  const resultado = await persistirObservacoes(novos, contexto, deps);
  return { ...resultado, ignorados: resultado.ignorados + jaExistentes, divergencias };
}

module.exports = {
  codigo: "b3-ccm-bdi",
  // Backfill de ~940 boletins: o script define o timeout; este é só um piso para uso avulso.
  timeoutMs: 60 * 60 * 1000,
  tentativasRetry: 1,
  download: ({ signal }) => downloadIntervalo({ signal }),
  downloadIntervalo,
  parse,
  normalize,
  persist: persistirComplemento,
  resumirDias,
  baixarDia,
  PRIMEIRA_DATA,
  ULTIMA_DATA_LAYOUT_ANTIGO
};
