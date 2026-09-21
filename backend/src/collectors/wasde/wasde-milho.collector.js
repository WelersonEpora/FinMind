"use strict";

const { URL } = require("node:url");
const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { persistirObservacoes } = require("../base/persist-observations");
const observationRepository = require("../../repositories/observation.repository");
const { lerPlanilha, extrairEdicao } = require("./wasde-milho.parser");

// WASDE (USDA) - balanço de oferta e demanda do MILHO (EUA e mundo), uma edição por mês, lido
// da planilha XLS de cada edição publicada no ESMIS. ADR 0015.
//
// POR QUE ESTA FONTE E NÃO SÓ A PSD (ADR 0014): a API da PSD só devolve a edição mais recente de
// cada dado; o ESMIS guarda TODAS as edições, e cada uma é uma "foto" datada do que o mercado
// sabia naquele dia. É a camada de vintage real do balanço do milho.
//
// VERIFICADO POR CHAMADA REAL em 2026-09-21 (ver o ADR):
//   - A página `/concern/publications/3t945q76s?page=N` do ESMIS lista 10 edições por página, cada
//     uma com a DATA do release (`<time datetime>`) e os links de PDF/TXT/XLS/XML. É HTML: não há
//     API confirmada (a página de documentação não carrega sem JavaScript).
//   - 190 edições desde 2011-01; todas têm XLS, exceto uma edição especial de 2014-01-23.
//   - O XLS baixado é idêntico, byte a byte, ao baixado pelo navegador.
//   - Há edições republicadas no mesmo dia (slug `2026-05-12-0` = `wasde0526v2.xls`).
//
// published_at: a data do release é REAL (vem da listagem). O horário não: o WASDE sai ao meio-dia
// de Nova York, e aqui vale o FIM DO DIA em UTC (conservador: nunca antecipa o que se sabia).
//
// observed_at: safra 2024/25 -> 1º/set/2024 (convenção; o WASDE agrega anos comerciais locais).
// Só entram valores publicados; nenhum cálculo, conversão de unidade nem interpretação.

const BASE_URL = "https://esmis.nal.usda.gov";
const URL_LISTAGEM = `${BASE_URL}/concern/publications/3t945q76s`;
const SOURCE_CODE = "USDA_WASDE";
const DATA_INICIAL = "2011-01-01";
// A coleta diária relê as 3 últimas edições: pega a nova e uma correção republicada de uma recente.
const EDICOES_NA_COLETA_DIARIA = 3;
const PAUSA_MS = 1_000;
const MAX_PAGINAS = 60;
const TIMEOUT_MS = 10 * 60 * 1000;
const TAMANHO_MINIMO_XLS = 50_000;
const ASSINATURA_OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
const USER_AGENT = "FinMind/0.1 (coleta de dados de mercado)";

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------- listagem (HTML)

// Uma página da listagem -> edições { data, slug, caminhoXls }. As linhas do topo da página que se
// repetem em todas as páginas ("última edição") não têm o link `/publication/.../<slug>`, então
// ficam de fora. `caminhoXls` é null se a edição não tem planilha.
function extrairEdicoesDaPagina(html) {
  const edicoes = [];
  for (const m of html.matchAll(/<tr\b[\s\S]*?<\/tr>/g)) {
    const linha = m[0];
    const data = /datetime="(\d{4}-\d{2}-\d{2})/.exec(linha)?.[1];
    const slug = /\/publication\/world-agricultural-supply-and-demand-estimates\/([0-9a-z-]+)/.exec(linha)?.[1];
    if (!data || !slug) continue;
    const caminhoXls = /href="(\/sites\/default\/release-files\/[A-Za-z0-9/]+\/[^"/]+\.xls)"/.exec(linha)?.[1] || null;
    edicoes.push({ data, slug, caminhoXls });
  }
  return edicoes;
}

// Duas ou mais edições na MESMA data (republicação: `-0`, `-1`, `v2`): o modelo point-in-time não
// representa duas versões do mesmo dia, então vale a ÚLTIMA (a corrigida). A anterior fica só no
// site. Ordem por sufixo numérico do slug ("2026-05-12" < "2026-05-12-0" < "2026-05-12-1").
function ordemNaData(slug) {
  const m = /^\d{4}-\d{2}-\d{2}(?:-(\d+))?$/.exec(slug);
  return m?.[1] === undefined ? -1 : Number(m[1]);
}

function escolherUmaPorData(edicoes) {
  const porData = new Map();
  for (const e of edicoes) {
    const atual = porData.get(e.data);
    if (!atual || ordemNaData(e.slug) > ordemNaData(atual.slug)) porData.set(e.data, e);
  }
  return [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
}

async function buscar(url, { signal, fetchFn = fetch }) {
  let response;
  try {
    response = await fetchFn(url, { signal, headers: { "user-agent": USER_AGENT } });
  } catch (err) {
    throw new UpstreamServiceError(`Falha de rede ao consultar ${new URL(url).host}: ${err.message}`);
  }
  if (!response.ok) {
    throw new UpstreamServiceError(`${new URL(url).host} respondeu com status ${response.status} (${new URL(url).pathname}).`);
  }
  return response;
}

// Percorre as páginas (10 edições cada, da mais nova para a mais antiga) até passar de `desde`, até
// não aparecer edição nova ou até `maxEdicoes` (só a coleta diária usa: 1 página basta).
async function listarEdicoes({ desde = DATA_INICIAL, ate, maxEdicoes = Infinity, signal, fetchFn = fetch, esperar = aguardar } = {}) {
  const porSlug = new Map();

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    if (pagina > 0) await esperar(PAUSA_MS);
    const response = await buscar(`${URL_LISTAGEM}?page=${pagina}`, { signal, fetchFn });
    const doHtml = extrairEdicoesDaPagina(await response.text());
    const novas = doHtml.filter((e) => !porSlug.has(e.slug));
    if (novas.length === 0) break;
    for (const e of novas) porSlug.set(e.slug, e);

    const maisAntiga = doHtml.reduce((min, e) => (e.data < min ? e.data : min), "9999-12-31");
    if (maisAntiga < desde) break;
    if (porSlug.size >= maxEdicoes) break;
  }

  const filtradas = [...porSlug.values()].filter((e) => e.data >= desde && (!ate || e.data <= ate));
  return escolherUmaPorData(filtradas);
}

// ---------------------------------------------------------------- download (XLS)

async function baixarPlanilha(edicao, { signal, fetchFn = fetch } = {}) {
  const response = await buscar(`${BASE_URL}${edicao.caminhoXls}`, { signal, fetchFn });
  const buffer = Buffer.from(await response.arrayBuffer());
  // Guarda contra uma página de erro/HTML salva como .xls: o XLS antigo é um arquivo OLE.
  if (buffer.length < TAMANHO_MINIMO_XLS || !buffer.subarray(0, 4).equals(ASSINATURA_OLE)) {
    throw new UpstreamServiceError(`O arquivo ${edicao.caminhoXls} não parece uma planilha XLS (${buffer.length} bytes).`);
  }
  return { ...edicao, arquivo: edicao.caminhoXls.split("/").pop(), buffer };
}

// Edições em sequência, com pausa entre os downloads. Uma edição sem XLS entra como item com
// `semPlanilha` (vira inválido no normalize, não derruba o lote).
async function baixarEdicoes(edicoes, { signal, fetchFn = fetch, esperar = aguardar } = {}) {
  const baixadas = [];
  for (const [i, edicao] of edicoes.entries()) {
    if (!edicao.caminhoXls) {
      baixadas.push({ ...edicao, semPlanilha: true });
      continue;
    }
    if (i > 0) await esperar(PAUSA_MS);
    baixadas.push(await baixarPlanilha(edicao, { signal, fetchFn }));
  }
  return baixadas;
}

// Coleta diária: as N edições mais recentes (a listagem já vem da mais nova para a mais antiga).
async function download({ signal, fetchFn, esperar } = {}) {
  const todas = await listarEdicoes({ maxEdicoes: EDICOES_NA_COLETA_DIARIA, desde: "2000-01-01", signal, fetchFn, esperar });
  return baixarEdicoes(todas.slice(-EDICOES_NA_COLETA_DIARIA), { signal, fetchFn, esperar });
}

// Backfill: edições de `dataInicial` a `dataFinal` (datas ISO).
async function downloadIntervalo({ dataInicial = DATA_INICIAL, dataFinal, signal, fetchFn, esperar } = {}) {
  const edicoes = await listarEdicoes({ desde: dataInicial, ate: dataFinal, signal, fetchFn, esperar });
  return baixarEdicoes(edicoes, { signal, fetchFn, esperar });
}

// ---------------------------------------------------------------- persist

// O serviço point-in-time só compara cada valor com a ÚLTIMA versão gravada da série. Reler uma
// edição antiga (a coleta diária relê as 3 últimas; um backfill pode ser repetido) traria valores
// de jul/ago contra a versão de set já gravada e seria lido como "conflito" (380 falhas na 1ª coleta
// diária real, 2026-09-21). Por isso as edições JÁ INGERIDAS são descartadas antes: uma edição é
// "ingerida" se já existe alguma linha desta fonte publicada no mesmo instante (o fim do dia do
// release). Uma edição realmente nova, ou uma lacuna que ficou para trás, segue para o serviço:
// a nova entra normalmente; uma lacuna com valor diferente do atual é reportada como falha (o
// modelo append-only não insere versão no meio da sequência).
// ORDEM DE CARGA: a coleta diária lê só as 3 últimas edições. Se ela gravasse uma série ANTES do backfill,
// o backfill depois não conseguiria inserir as edições antigas dessa série (o modelo append-only não insere
// versão no meio da sequência) e o vintage ficaria truncado. Por isso a coleta diária SE RECUSA a gravar
// séries que ainda não têm carga histórica (fonte vazia ou região recém-incluída no escopo) e manda rodar o
// backfill (`persistirBackfill`, usado pelo script, não tem essa trava).
//
// REINGESTÃO: o serviço só compara cada valor com a ÚLTIMA versão gravada; reler uma edição antiga seria
// lido como "conflito" (380 falhas na 1ª coleta diária real, 2026-09-21). Por isso, para séries JÁ
// carregadas, as edições já ingeridas (mesmo instante de publicação já presente na fonte) são descartadas.
// Uma série NOVA recebe todas as edições, em ordem. Uma lacuna que ficou para trás numa série já carregada
// segue para o serviço e, se o valor difere do atual, é reportada como falha.
async function persistirEdicoes(validos, contexto, deps, { exigirCargaInicial }) {
  const repo = deps.observationRepository || observationRepository;
  const publicacoes = await repo.listarSeriesEInstantes(SOURCE_CODE, { transaction: deps.transaction });
  const seriesCarregadas = new Set(publicacoes.map((p) => p.series_code));
  const jaIngeridos = new Set(publicacoes.map((p) => new Date(p.published_at).getTime()));

  const falhas = [];
  let candidatos = validos;
  if (exigirCargaInicial) {
    const semCarga = validos.filter((v) => !seriesCarregadas.has(v.series_code));
    if (semCarga.length > 0) {
      const series = new Set(semCarga.map((v) => v.series_code)).size;
      falhas.push({
        item: null,
        motivo: `Carga histórica do WASDE ainda não feita para ${series} série(s) (${semCarga.length} valores não gravados): rode "npm run backfill:wasde-milho" antes da coleta diária.`
      });
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

const persist = (validos, contexto, deps = {}) => persistirEdicoes(validos, contexto, deps, { exigirCargaInicial: true });
const persistirBackfill = (validos, contexto, deps = {}) => persistirEdicoes(validos, contexto, deps, { exigirCargaInicial: false });

// ---------------------------------------------------------------- parse / normalize

const MESES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Cada edição vira { data, slug, arquivo, edicao, mes, observacoes, invalidos, erro }. Falha ao
// ler UMA planilha não aborta as demais.
function parse(rawData) {
  if (!Array.isArray(rawData)) {
    throw new UpstreamServiceError("Resposta do ESMIS em formato inesperado (esperava uma lista de edições).");
  }
  return rawData.map((item) => {
    const base = { data: item.data, slug: item.slug, arquivo: item.arquivo || null };
    if (item.semPlanilha) return { ...base, erro: "A edição não tem planilha XLS no ESMIS." };
    try {
      return { ...base, ...extrairEdicao(lerPlanilha(item.buffer)) };
    } catch (err) {
      return { ...base, erro: `Falha ao ler a planilha: ${err.message}` };
    }
  });
}

// O mês do cabeçalho da planilha tem de ser o mês do release: barra um arquivo trocado.
function cabecalhoConfere(edicao) {
  if (!edicao.mes) return false;
  const [ano, mes] = edicao.data.split("-").map(Number);
  return edicao.mes.ano === ano && edicao.mes.nome === MESES_EN[mes - 1];
}

function normalize(edicoes) {
  const validos = [];
  const invalidos = [];

  for (const edicao of edicoes) {
    const ident = `${edicao.data} (${edicao.arquivo || edicao.slug})`;
    if (edicao.erro) {
      invalidos.push({ item: { edicao: ident }, motivo: edicao.erro });
      continue;
    }
    if (!cabecalhoConfere(edicao)) {
      invalidos.push({
        item: { edicao: ident },
        motivo: `Cabeçalho da planilha (${edicao.mes ? `${edicao.mes.nome} ${edicao.mes.ano}` : "ausente"}) não confere com a data do release.`
      });
      continue;
    }
    for (const motivo of edicao.invalidos) invalidos.push({ item: { edicao: ident }, motivo: motivo.motivo });

    const publishedAt = fimDoDiaUtc(edicao.data);
    for (const o of edicao.observacoes) {
      validos.push({
        series_code: o.seriesCode,
        observed_at: o.observedAt,
        value: o.valor,
        unit: o.unidade,
        source_code: SOURCE_CODE,
        published_at: publishedAt,
        published_at_is_estimated: false,
        published_at_basis: "source",
        metadata: {
          fonte: "USDA WASDE (ESMIS)",
          produto: "milho",
          escopo: o.escopo,
          regiao: o.regiao,
          atributo: o.atributo,
          safra: o.safra,
          situacao: o.situacao,
          edicao: edicao.edicao,
          dataRelease: edicao.data,
          arquivo: edicao.arquivo
        }
      });
    }
  }

  // Ordem cronológica: o serviço point-in-time decide "novo / mesmo valor / revisão" comparando
  // com a última versão de cada série, então uma edição nunca pode entrar antes da anterior.
  validos.sort((a, b) => a.published_at - b.published_at);
  return { validos, invalidos };
}

module.exports = {
  codigo: "wasde-milho",
  timeoutMs: TIMEOUT_MS,
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  downloadIntervalo,
  parse,
  normalize,
  persist,
  persistirBackfill,
  extrairEdicoesDaPagina,
  escolherUmaPorData,
  listarEdicoes,
  baixarEdicoes,
  cabecalhoConfere,
  SOURCE_CODE,
  DATA_INICIAL,
  EDICOES_NA_COLETA_DIARIA,
  PAUSA_MS
};
