"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { somarDias, diaDaSemanaIso, paraDate, paraIso } = require("../../shared/utils/date-utils");
const { zonedParaUtc } = require("../../shared/utils/zoned-time");
const { decodificarFuturoB3 } = require("../../shared/utils/b3-contrato");
const { persistirObservacoes } = require("../base/persist-observations");
const { produtoB3 } = require("./b3-produtos");

// B3 - futuros agrícolas por VENCIMENTO, preço diário, via o arquivo público
// `TradeInformationConsolidatedFile` (Up2Data, sem chave e sem recaptcha - ver
// docs/adr/0009). Um coletor por produto (`criarColetorFuturoB3`, ver
// b3-produtos.js): milho (CCM, ADR 0009) e café arábica (ICF, ADR 0028).
//
// Um arquivo por pregão, com TODOS os derivativos (~6 MB). Cada coletor baixa
// cada dia, guarda só as linhas dos futuros do seu produto e descarta o resto
// (os dois coletores baixam o mesmo arquivo: cada um falha e é reexecutado
// sozinho, ao custo de um download a mais por pregão).
//
// POR QUE ISTO É URGENTE: o arquivo só existe numa janela rolante de ~15
// meses. Cada dia sem coletar perde o dia mais antigo; o que o FinMind
// acumular aqui passa a ser o histórico.
//
// Cada vencimento é preservado separadamente (NÃO há série contínua nem
// rolagem). Cada campo do arquivo vira uma série `<prefixo>.<TICKER>.<CAMPO>`
// em `observation` (ex.: B3.CCM.CCMF27.SETTLE, B3.ICF.ICFZ26.SETTLE), pois
// observation guarda um escalar por linha.
//
// Filtro: só o futuro (ticker exato <símbolo><mês><aa>, segmento AGRIBUSINESS).
// O arquivo também traz `CCME11` (segmento CASH, outro instrumento) e centenas
// de opções (CCMF27C006800...), que ficam de fora.
//
// Unidades: os preços do CCM são em R$/saca e os do ICF em US$/saca (a cotação
// do contrato); o volume financeiro (NtlFinVol) é em R$ nos dois - conferido no
// ICF: 539 contratos x 100 sacas x US$ 338,94 x ~5,19 = R$ 94,8 milhões (2026-09-25).
//
// published_at: a B3 não informa quando publicou (o download não traz
// Last-Modified). Estimado como o FIM do dia do pregão em Brasília - conservador
// (o arquivo "Final" sai depois do fechamento) - e limitado a collected_at.

const API = "https://arquivos.b3.com.br/api/";
const NOME_ARQUIVO = "TradeInformationConsolidatedFile";
const SOURCE_CODE = "B3";
const FUSO = "America/Sao_Paulo";

// Janela da coleta diária: 7 dias corridos = sempre 5 dias úteis (cobre fim de
// semana e alguns dias perdidos de cron; a proteção "fonte caiu" do parse
// depende de a janela ter pelo menos 4 dias úteis).
const DIAS_JANELA_DIARIA = 7;
const CONCORRENCIA = 3;

const COLUNAS_ESPERADAS =
  "RptDt;TckrSymb;ISIN;SgmtNm;MinPric;MaxPric;TradAvrgPric;LastPric;OscnPctg;AdjstdQt;AdjstdQtTax;RefPric;TradQty;FinInstrmQty;NtlFinVol";

// Marca dos campos de preço: a unidade é a do produto (`unidadePreco`).
const PRECO = "PRECO";

// índice da coluna no CSV -> série. Campos vazios (ex.: AdjstdQtTax e RefPric
// não existem para futuro) simplesmente não geram observação.
const CAMPOS = [
  { indice: 4, sufixo: "LOW", campo: "MinPric", unit: PRECO },
  { indice: 5, sufixo: "HIGH", campo: "MaxPric", unit: PRECO },
  { indice: 6, sufixo: "AVG", campo: "TradAvrgPric", unit: PRECO },
  { indice: 7, sufixo: "LAST", campo: "LastPric", unit: PRECO },
  { indice: 8, sufixo: "OSCN_PCT", campo: "OscnPctg", unit: "pct" },
  { indice: 9, sufixo: "SETTLE", campo: "AdjstdQt", unit: PRECO },
  { indice: 10, sufixo: "ADJ_RATE", campo: "AdjstdQtTax", unit: "pct" },
  { indice: 11, sufixo: "REF_PRICE", campo: "RefPric", unit: PRECO },
  { indice: 12, sufixo: "TRADES", campo: "TradQty", unit: "negocios" },
  { indice: 13, sufixo: "CONTRACTS", campo: "FinInstrmQty", unit: "contratos" },
  { indice: 14, sufixo: "VOLUME_BRL", campo: "NtlFinVol", unit: "BRL" }
];

const PAUSA_ENTRE_TENTATIVAS_MS = 500;
const TENTATIVAS_POR_REQUISICAO = 3;
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 4xx = "não há arquivo para esta data" (dia sem pregão/fora da janela);
// rede e 5xx = erro de verdade, com retentativa.
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

// Puro e testável: dado o texto do CSV, devolve { situacao, linhas } com só
// os futuros do produto `simbolo`. `situacao` = final | nao_final | erro | vazio.
function extrairFuturos(csv, simbolo) {
  if (!csv || !csv.trim()) return { situacao: "vazio", linhas: [] };

  const linhas = csv.split(/\r?\n/);
  const status = /^Status do Arquivo:\s*(.+?)\s*$/i.exec(linhas[0] || "");
  if (!status) return { situacao: "erro", linhas: [], motivo: `Primeira linha inesperada: "${(linhas[0] || "").slice(0, 60)}".` };
  if (status[1].toLowerCase() !== "final") return { situacao: "nao_final", linhas: [], motivo: `Status do arquivo: "${status[1]}".` };
  if ((linhas[1] || "").trim() !== COLUNAS_ESPERADAS) {
    return { situacao: "erro", linhas: [], motivo: "Colunas do arquivo diferentes do esperado (layout mudou?)." };
  }

  const futuros = linhas
    .slice(2)
    .filter((linha) => {
      const c = linha.split(";");
      return c[3] === "AGRIBUSINESS" && decodificarFuturoB3(c[1], simbolo) !== null;
    })
    // COPIA a linha. O split() do V8 devolve "sliced strings" que mantêm vivo o
    // texto INTEIRO do arquivo (~7 MB) - guardar 7 linhas por pregão retinha
    // ~7,8 MB por dia (~2,5 GB num backfill de 321 pregões) e derrubou uma VM de
    // 1 GB. Com a cópia, só as poucas linhas do produto ficam na memória.
    .map((linha) => Buffer.from(linha, "latin1").toString("latin1"));
  return { situacao: "final", linhas: futuros };
}

// Um pregão: { data, situacao, linhas, motivo? }.
async function baixarDia(data, simbolo, signal) {
  try {
    const r1 = await buscar(`${API}download/requestname?fileName=${NOME_ARQUIVO}&date=${data}&recaptchaToken=`, signal);
    if (!r1.ok) return { data, situacao: "indisponivel", linhas: [], motivo: `HTTP ${r1.status}` };

    const { redirectUrl } = await r1.json();
    const r2 = await buscar(API + String(redirectUrl).replace(/^~\//, ""), signal);
    if (!r2.ok) return { data, situacao: "indisponivel", linhas: [], motivo: `HTTP ${r2.status}` };

    const csv = Buffer.from(await r2.arrayBuffer()).toString("latin1");
    return { data, ...extrairFuturos(csv, simbolo) };
  } catch (err) {
    if (err.name === "AbortError") throw err;
    return { data, situacao: "erro", linhas: [], motivo: `Falha ao baixar: ${err.message}` };
  }
}

function diasUteis(dataInicial, dataFinal) {
  const dias = [];
  for (let d = dataInicial; d <= dataFinal; d = somarDias(d, 1)) {
    if (diaDaSemanaIso(d) <= 5) dias.push(d);
  }
  return dias;
}

// Baixa um intervalo de pregões (usado pela coleta diária e pelo backfill).
async function baixarIntervalo(simbolo, { dataInicial, dataFinal, signal }) {
  paraDate(dataInicial);
  paraDate(dataFinal);
  const dias = diasUteis(dataInicial, dataFinal);
  const resultados = [];

  for (let i = 0; i < dias.length; i += CONCORRENCIA) {
    resultados.push(...(await Promise.all(dias.slice(i, i + CONCORRENCIA).map((d) => baixarDia(d, simbolo, signal)))));
  }
  return resultados;
}

// Dia sem arquivo (feriado, fora da janela) NÃO é erro. Erro de verdade
// (rede, layout, arquivo não final) vira item inválido -> execução
// partial_success, e o próximo dia de coleta refaz a janela.
function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta da B3 em formato inesperado (esperava a lista de pregões).");
  }

  // Se NENHUM pregão devolveu arquivo numa janela com vários dias úteis, a
  // fonte mudou ou caiu - não é um período de feriados. Falha alto.
  if (rawData.length >= 4 && !rawData.some((d) => d.situacao === "final")) {
    const amostra = rawData.slice(-1)[0];
    throw new UpstreamServiceError(`A B3 não devolveu nenhum arquivo final em ${rawData.length} dias úteis (último: ${amostra.data}, ${amostra.situacao}${amostra.motivo ? `: ${amostra.motivo}` : ""}).`);
  }

  const itens = [];
  for (const dia of rawData) {
    if (dia.situacao === "final") {
      for (const linha of dia.linhas) itens.push({ data: dia.data, linha });
    } else if (dia.situacao === "erro" || dia.situacao === "nao_final") {
      itens.push({ data: dia.data, problema: dia.motivo || dia.situacao });
    }
  }
  return itens;
}

function numero(texto) {
  if (texto === undefined || texto === "") return null;
  const valor = Number(String(texto).replace(",", "."));
  return Number.isFinite(valor) ? valor : NaN;
}

function normalizar(produto, rawItems) {
  const validos = [];
  const invalidos = [];

  for (const item of rawItems) {
    if (item.problema) {
      invalidos.push({ item, motivo: `Pregão ${item.data}: ${item.problema}` });
      continue;
    }

    const c = item.linha.split(";");
    const ticker = c[1];
    const contrato = decodificarFuturoB3(ticker, produto.simbolo);
    if (c[0] !== item.data || !contrato) {
      invalidos.push({ item, motivo: `Linha inconsistente com o pregão ${item.data}: "${item.linha.slice(0, 60)}".` });
      continue;
    }

    const { vencimento } = contrato;
    const publicadoEm = zonedParaUtc(item.data, "23:59:59", FUSO);

    for (const { indice, sufixo, campo, unit } of CAMPOS) {
      const valor = numero(c[indice]);
      if (valor === null) continue; // ex.: contrato sem negócio no dia não tem mín/máx/último
      if (Number.isNaN(valor)) {
        invalidos.push({ item, motivo: `${ticker} ${item.data}: ${campo} inválido ("${c[indice]}").` });
        continue;
      }
      validos.push({
        series_code: `${produto.prefixoSerie}.${ticker}.${sufixo}`,
        observed_at: item.data,
        value: valor,
        unit: unit === PRECO ? produto.unidadePreco : unit,
        source_code: SOURCE_CODE,
        published_at: publicadoEm,
        published_at_is_estimated: true,
        published_at_basis: "lag_rule",
        metadata: {
          fonte: "B3 TradeInformationConsolidatedFile",
          ticker,
          isin: c[2],
          vencimento,
          campoFonte: campo,
          regraPublicacao: "fim_do_dia_do_pregao_brt"
        }
      });
    }
  }

  return { validos, invalidos };
}

// Coletor de um produto de b3-produtos.js ("ccm", "icf").
function criarColetorFuturoB3(chave) {
  const produto = produtoB3(chave);
  const downloadIntervalo = (opcoes) => baixarIntervalo(produto.simbolo, opcoes);

  return {
    codigo: produto.codigoColetor,
    get timeoutMs() {
      return Math.max(env.collectors.sourceTimeoutMs, 120000);
    },
    get tentativasRetry() {
      return env.collectors.retryTentativas;
    },
    download({ signal }) {
      const hoje = paraIso(new Date());
      return downloadIntervalo({ dataInicial: somarDias(hoje, -(DIAS_JANELA_DIARIA - 1)), dataFinal: hoje, signal });
    },
    downloadIntervalo,
    parse,
    normalize: (rawItems) => normalizar(produto, rawItems),
    persist: persistirObservacoes
  };
}

module.exports = { criarColetorFuturoB3, extrairFuturos };
