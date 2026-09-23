"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const logger = require("../../shared/logger");
const { somarDias, diaDaSemanaIso, paraDate, paraIso } = require("../../shared/utils/date-utils");
const { zonedParaUtc } = require("../../shared/utils/zoned-time");
const zip = require("../../shared/utils/zip");
const { persistirObservacoes } = require("../base/persist-observations");

// Indicador do Milho CEPEA/ESALQ (o que liquida o futuro CCM), lido do arquivo público da B3
// "Indicadores Econômicos e Agropecuários - Final" (`Indic`, seção "Pesquisa por pregão"). ADR 0021.
//
// POR QUE PELA B3 E NÃO PELA CEPEA: o site da CEPEA bloqueia automação (desafio do Cloudflare na
// ferramenta de exportação; `robots.txt` contra agentes de IA). A B3 divulga o MESMO número - o
// indicador é a base de liquidação do CCM -: conferido contra o histórico exportado da CEPEA, 66 de 66
// datas iguais ao centavo em R$. Em US$ a B3 difere por centavos (outro câmbio de conversão).
//
// O arquivo: um zip com outro zip dentro (`ID<aammdd>.ex_`), que tem o `Indic.txt` em largura fixa
// (layout oficial da B3, "Indica.xls"). O arquivo do pregão D traz o valor de D e o de D-1; só o de D
// é lido (o de D-1 é o mesmo já lido no arquivo anterior: medido em 16 arquivos seguidos, nenhuma
// diferença). Dia sem pregão (fim de semana, feriado) volta como zip vazio. O milho só aparece no
// arquivo a partir de 2018-06-08.
//
// published_at: a B3 não informa. ESTIMADO no fim do dia do pregão em Brasília - mesma regra do CCM
// (o arquivo sai no encerramento do dia; a CEPEA divulga o indicador depois das 18h).

const URL_DOWNLOAD = "https://www.b3.com.br/pesquisapregao/download?filelist=";
const SOURCE_CODE = "B3";
const FUSO = "America/Sao_Paulo";
const PREFIXO_SERIE = "B3.MILHO_ESALQ";
const PRIMEIRA_DATA = "2018-06-08"; // 1º pregão com o milho no arquivo (04/06/2018 ainda não tem)

// Código no arquivo (grupo "IA" + código do indicador) -> campo da série. Os demais códigos do milho
// (IAMIL-MD-R$, IAMIL-PZ-R$, IAMIL-PZ-VPZ) ficam de fora: o arquivo não diz o que são, e a CEPEA só
// publica o valor à vista (ADR 0021).
const CAMPOS = [
  { codigoFonte: "IAMIL-AV-R$", campo: "AVISTA_BRL", unit: "BRL/saca" },
  { codigoFonte: "IAMIL-AV-US$", campo: "AVISTA_USD", unit: "USD/saca" }
];

// Janela da coleta diária: 7 dias corridos = 5 pregões (cobre fim de semana e cron perdido).
const DIAS_JANELA_DIARIA = 7;
const CONCORRENCIA = 3;
const TENTATIVAS_POR_REQUISICAO = 3;
const PAUSA_ENTRE_TENTATIVAS_MS = 1000;
const TIMEOUT_REQUISICAO_MS = 60 * 1000;

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Rede e 5xx = retentativa; 4xx = resposta definitiva.
async function buscar(url, signal) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= TENTATIVAS_POR_REQUISICAO; tentativa += 1) {
    const limite = globalThis.AbortSignal.timeout(TIMEOUT_REQUISICAO_MS);
    try {
      const response = await fetch(url, {
        signal: signal ? globalThis.AbortSignal.any([signal, limite]) : limite,
        headers: { "user-agent": "FinMind/0.1 (coleta de dados de mercado)" }
      });
      if (response.status < 500) {
        const corpo = Buffer.from(await response.arrayBuffer());
        return { ok: response.ok, status: response.status, corpo };
      }
      ultimoErro = new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (signal?.aborted) throw err;
      ultimoErro = limite.aborted ? new Error(`sem resposta em ${TIMEOUT_REQUISICAO_MS / 1000} s`) : err;
    }
    if (tentativa < TENTATIVAS_POR_REQUISICAO) await dormir(PAUSA_ENTRE_TENTATIVAS_MS * tentativa);
  }
  throw ultimoErro;
}

// Puro: uma linha do Indic.txt pelo layout oficial (posições 1-based do "Indica.xls") ou null.
//   10-11 tipo de registro ("01") | 12-19 data AAAAMMDD | 20-21 grupo | 22-46 código
//   47-71 valor (sinal + dígitos, sem vírgula) | 72-73 número de decimais
function lerLinhaIndic(linha) {
  if (linha.length < 73 || linha.slice(9, 11) !== "01") return null;
  const d = linha.slice(11, 19);
  const valor = /^([+-])(\d{24})$/.exec(linha.slice(46, 71));
  const decimais = /^\d{2}$/.test(linha.slice(71, 73)) ? Number(linha.slice(71, 73)) : NaN;
  if (!/^\d{8}$/.test(d) || !valor || Number.isNaN(decimais)) return null;
  return {
    data: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
    codigo: (linha.slice(19, 21) + linha.slice(21, 46)).trim(),
    valor: (valor[1] === "-" ? -1 : 1) * (Number(valor[2]) / 10 ** decimais)
  };
}

// Puro: do texto do Indic.txt, os valores do milho do pregão `data`.
// situacao: ok | sem_indicador (arquivo lido, sem o milho nessa data) | erro (layout não reconhecido)
function extrairIndicadorMilho(texto, data) {
  const registros = String(texto ?? "")
    .split(/\r?\n/)
    .map(lerLinhaIndic)
    .filter(Boolean);
  if (registros.length === 0) return { situacao: "erro", motivo: "Nenhuma linha do Indic.txt no layout esperado (layout mudou?)." };

  const valores = {};
  for (const { codigoFonte, campo } of CAMPOS) {
    const r = registros.find((reg) => reg.data === data && reg.codigo === codigoFonte);
    if (r) valores[campo] = r.valor;
  }
  if (Object.keys(valores).length === 0) return { situacao: "sem_indicador" };
  return { situacao: "ok", valores };
}

// Puro: do zip baixado, o texto do Indic.txt, ou null se o zip vem vazio (dia sem pregão).
function extrairTextoIndic(corpo) {
  const externas = zip.lerZip(corpo);
  if (externas.length === 0) return null;
  const internas = externas.flatMap((e) => (/\.ex_$/i.test(e.nome) ? zip.lerZip(e.conteudo) : [e]));
  const indic = internas.find((e) => /(^|\/)indic\.txt$/i.test(e.nome));
  if (!indic) throw new Error(`o zip não tem o Indic.txt (tem: ${internas.map((e) => e.nome).join(", ") || "nada"})`);
  return indic.conteudo.toString("latin1");
}

// Um pregão: { data, situacao, valores?, motivo? }. situacao: ok | sem_arquivo | sem_indicador | erro
async function baixarDia(data, signal) {
  const aammdd = data.slice(2).replace(/-/g, "");
  const url = `${URL_DOWNLOAD}ID${aammdd}.ex_,`;
  try {
    const r = await buscar(url, signal);
    if (!r.ok) return { data, situacao: "erro", motivo: `HTTP ${r.status}` };
    const texto = extrairTextoIndic(r.corpo);
    if (texto === null) return { data, situacao: "sem_arquivo" };
    return { data, url, ...extrairIndicadorMilho(texto, data) };
  } catch (err) {
    if (err.name === "AbortError") throw err;
    return { data, situacao: "erro", motivo: `Falha ao ler o arquivo da B3: ${err.message}` };
  }
}

function diasUteis(dataInicial, dataFinal) {
  const dias = [];
  for (let d = dataInicial; d <= dataFinal; d = somarDias(d, 1)) {
    if (diaDaSemanaIso(d) <= 5) dias.push(d);
  }
  return dias;
}

// Baixa um intervalo de pregões (coleta diária e backfill). Antes de 2018-06-08 não há milho no arquivo.
// A B3 leva ~20 s por arquivo (medido: fixo, com 1 ou 10 pedidos simultâneos; e o `filelist` com vários
// arquivos devolve só o último): o backfill de ~2.100 pregões pede `concorrencia` maior (~70 min com 10).
async function downloadIntervalo({ dataInicial, dataFinal, signal, concorrencia = CONCORRENCIA, log = logger }) {
  paraDate(dataInicial);
  paraDate(dataFinal);
  const dias = diasUteis(dataInicial < PRIMEIRA_DATA ? PRIMEIRA_DATA : dataInicial, dataFinal);
  const resultados = [];
  for (let i = 0; i < dias.length; i += concorrencia) {
    resultados.push(...(await Promise.all(dias.slice(i, i + concorrencia).map((d) => baixarDia(d, signal)))));
    const feitos = Math.min(i + concorrencia, dias.length);
    if (dias.length > 20 && (feitos % 100 < concorrencia || feitos === dias.length)) {
      log.info({ feitos, total: dias.length, ultimoDia: dias[feitos - 1] }, "Indicador do Milho CEPEA/ESALQ (B3): progresso");
    }
  }
  return resultados;
}

function download({ signal }) {
  const hoje = paraIso(new Date());
  return downloadIntervalo({ dataInicial: somarDias(hoje, -(DIAS_JANELA_DIARIA - 1)), dataFinal: hoje, signal });
}

// Dia sem arquivo (fim de semana, feriado, pregão do dia ainda não publicado) NÃO é erro. Arquivo sem
// o milho num dia também não (a CEPEA pode não ter divulgado) - mas se NENHUM dia da janela tem o
// milho, a fonte mudou: falha alto. Erro de leitura vira item inválido (partial_success).
function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta da B3 em formato inesperado (esperava a lista de pregões).");
  }
  const comArquivo = rawData.filter((d) => d.situacao === "ok" || d.situacao === "sem_indicador");
  if (rawData.length >= 4 && !rawData.some((d) => d.situacao === "ok")) {
    const ultimo = rawData.slice(-1)[0];
    throw new UpstreamServiceError(
      comArquivo.length
        ? `O arquivo Indic da B3 não trouxe o indicador do milho em nenhum de ${comArquivo.length} pregões (o código IAMIL mudou?).`
        : `A B3 não devolveu o arquivo Indic em nenhum de ${rawData.length} dias úteis (último: ${ultimo.data}, ${ultimo.situacao}${ultimo.motivo ? `: ${ultimo.motivo}` : ""}).`
    );
  }

  const itens = [];
  for (const dia of rawData) {
    if (dia.situacao === "ok") itens.push({ data: dia.data, url: dia.url, valores: dia.valores });
    else if (dia.situacao === "erro") itens.push({ data: dia.data, problema: dia.motivo || dia.situacao });
  }
  return itens;
}

function normalize(rawItems) {
  const validos = [];
  const invalidos = [];

  for (const item of rawItems) {
    if (item.problema) {
      invalidos.push({ item, motivo: `Pregão ${item.data}: ${item.problema}` });
      continue;
    }
    const publicadoEm = zonedParaUtc(item.data, "23:59:59", FUSO);

    for (const { codigoFonte, campo, unit } of CAMPOS) {
      const valor = item.valores[campo];
      if (valor === undefined) continue;
      if (!Number.isFinite(valor) || valor <= 0) {
        invalidos.push({ item, motivo: `${codigoFonte} ${item.data}: valor inválido (${valor}).` });
        continue;
      }
      validos.push({
        series_code: `${PREFIXO_SERIE}.${campo}`,
        observed_at: item.data,
        value: valor,
        unit,
        source_code: SOURCE_CODE,
        published_at: publicadoEm,
        published_at_is_estimated: true,
        published_at_basis: "lag_rule",
        metadata: {
          fonte: "B3 Pesquisa por pregão - Indicadores Econômicos e Agropecuários (Indic)",
          indicador: "Indicador do Milho CEPEA/ESALQ",
          codigoFonte,
          url: item.url,
          regraPublicacao: "fim_do_dia_do_pregao_brt"
        }
      });
    }
  }

  return { validos, invalidos };
}

module.exports = {
  codigo: "b3-milho-esalq",
  get timeoutMs() {
    return Math.max(env.collectors.sourceTimeoutMs, 120000);
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  downloadIntervalo,
  parse,
  normalize,
  persist: persistirObservacoes,
  lerLinhaIndic,
  extrairIndicadorMilho,
  extrairTextoIndic,
  PRIMEIRA_DATA
};
