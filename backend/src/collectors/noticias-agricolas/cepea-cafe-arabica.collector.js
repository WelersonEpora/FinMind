"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { diaDaSemanaIso, paraIso } = require("../../shared/utils/date-utils");
const { zonedParaUtc } = require("../../shared/utils/zoned-time");
const observationRepository = require("../../repositories/observation.repository");
const { persistirObservacoes, baixar } = require("../base/persist-observations");
const { lerNumero, lerData, PREFIXO_SERIE } = require("../cepea/cepea-cafe-planilha.collector");

// O diário do Indicador do Café Arábica CEPEA/ESALQ, pela página do Notícias Agrícolas que o republica (ADR 0146, §2).
// REPUBLICAÇÃO NÃO OFICIAL, como o Yahoo (ADRs 0096 e 0129): o Cepea bloqueia a coleta automática, e o histórico oficial
// vem da planilha exportada à mão (cepea-cafe-planilha). Decisão do usuário (2026-10-23): a leitura direta da página, sem
// busca pela IA; se o layout mudar, a coleta falha e acusa em Execuções.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-23: a página responde a uma requisição comum (200, 0,4 s; o `robots.txt` libera
// todos os agentes; sem página de termos de uso, só a política de privacidade). Traz os 10 últimos fechamentos, cada um
// num bloco "Fechamento: DD/MM/AAAA", "Fonte: Cepea/Esalq" e uma tabela `cot-fisicas` (Data | Valor R$ | Variação(%)).
// Os 10 (08/10 a 22/10/2026) bateram ao centavo com a planilha do Cepea. Só o R$: o US$ fica com a planilha.
//
// A MESMA SÉRIE da planilha (`CEPEA.CAFE_ARABICA.AVISTA_BRL`), com o `source_code` NOTICIAS_AGRICOLAS: os fatores leem
// uma série só, e a próxima planilha confirma o valor (o mesmo, ignorado) ou o corrige (revisão, ADR 0008).
//
// A CONFERÊNCIA, antes de gravar (no `persist`, que lê a base):
//   - SOBREPOSIÇÃO: a página precisa trazer ao menos um dia já na série, e TODOS os dias já na série precisam bater ao
//     centavo; uma divergência descarta a página inteira (a republicação errou ou é outro indicador);
//   - VARIAÇÃO: um dia novo com mais de 8% contra o dia anterior não é gravado (de 2010 em diante, 4 de 4.193 dias reais
//     passaram disso; nesses, a planilha cobre).
//
// published_at: a página não informa a hora. ESTIMADO no fim do dia do pregão em Brasília, a regra da planilha.

const URL_PAGINA = "https://www.noticiasagricolas.com.br/cotacoes/cafe/indicador-cepea-esalq-cafe-arabica";
const SOURCE_CODE = "NOTICIAS_AGRICOLAS";
const SERIE = `${PREFIXO_SERIE}.AVISTA_BRL`;
const FUSO = "America/Sao_Paulo";
const TITULO = "Indicador Café Arábica - Cepea/Esalq";
const VARIACAO_MAXIMA = 0.08;

// Puro: o HTML da página -> [{ data: "AAAA-MM-DD", valor }], do mais recente ao mais antigo. Lança se o layout mudou.
function extrairFechamentos(html) {
  const texto = String(html ?? "");
  if (!texto.includes(`<h1>${TITULO}</h1>`)) {
    throw new UpstreamServiceError(`A página do Notícias Agrícolas não tem o título "${TITULO}" (o layout mudou?).`);
  }
  const tabelas = [...texto.matchAll(/<table class="cot-fisicas">([\s\S]*?)<\/table>/g)].map((m) => m[1]);
  const fechamentos = tabelas.flatMap((t) =>
    [...t.matchAll(/<tr>\s*<td>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>\s*<td>\s*([\d.,]+)\s*<\/td>/g)].map((m) => ({
      data: lerData(m[1]),
      valor: lerNumero(m[2]),
      texto: `${m[1]} ${m[2]}`
    }))
  );
  if (fechamentos.length === 0) {
    throw new UpstreamServiceError("A página do Notícias Agrícolas não trouxe nenhum fechamento na tabela cot-fisicas (o layout mudou?).");
  }
  return fechamentos;
}

async function download({ signal }) {
  return baixar(URL_PAGINA, { signal });
}

function parse(html) {
  return extrairFechamentos(html);
}

function normalize(fechamentos, { hoje = paraIso(new Date()) } = {}) {
  const validos = [];
  const invalidos = [];
  for (const f of fechamentos) {
    if (!f.data || !(f.valor > 0) || f.data > hoje || diaDaSemanaIso(f.data) > 5) {
      invalidos.push({ item: f, motivo: `Fechamento fora do formato ou da data esperada: ${f.texto}.` });
      continue;
    }
    validos.push({
      series_code: SERIE,
      observed_at: f.data,
      value: f.valor,
      unit: "BRL/saca",
      source_code: SOURCE_CODE,
      published_at: zonedParaUtc(f.data, "23:59:59", FUSO),
      published_at_is_estimated: true,
      published_at_basis: "lag_rule",
      metadata: {
        fonte: "Notícias Agrícolas (republicação do Cepea; não oficial)",
        indicador: "Indicador do Café Arábica CEPEA/ESALQ",
        url: URL_PAGINA,
        regraPublicacao: "fim_do_dia_do_pregao_brt"
      }
    });
  }
  return { validos, invalidos };
}

// Puro: a conferência contra os valores já na série (Map observed_at -> valor). -> { aceitos, falhas }
function conferir(validos, conhecidos) {
  const sobrepostos = validos.filter((v) => conhecidos.has(v.observed_at));
  if (sobrepostos.length === 0) {
    return {
      aceitos: [],
      falhas: [{ item: null, motivo: "Nenhum dia da página já está na série: importe a planilha do Cepea antes (a conferência precisa da sobreposição)." }]
    };
  }
  const divergentes = sobrepostos.filter((v) => Math.abs(conhecidos.get(v.observed_at) - v.value) >= 0.005);
  if (divergentes.length > 0) {
    const lista = divergentes.map((v) => `${v.observed_at}: página ${v.value}, série ${conhecidos.get(v.observed_at)}`).join("; ");
    return { aceitos: [], falhas: [{ item: null, motivo: `A página diverge da série nos dias já conhecidos (${lista}); nada gravado.` }] };
  }

  const aceitos = [];
  const falhas = [];
  const valores = new Map(conhecidos);
  for (const v of [...validos].sort((a, b) => (a.observed_at < b.observed_at ? -1 : 1))) {
    if (conhecidos.has(v.observed_at)) {
      aceitos.push(v);
      continue;
    }
    const anteriores = [...valores.keys()].filter((d) => d < v.observed_at).sort();
    const anterior = anteriores.length ? valores.get(anteriores.at(-1)) : null;
    if (anterior != null && Math.abs(v.value / anterior - 1) > VARIACAO_MAXIMA) {
      falhas.push({ item: v, motivo: `${v.observed_at}: ${v.value} varia ${((v.value / anterior - 1) * 100).toFixed(1)}% contra o dia anterior (limite de 8%); não gravado.` });
      continue;
    }
    aceitos.push(v);
    valores.set(v.observed_at, v.value);
  }
  return { aceitos, falhas };
}

async function persist(validos, contexto, deps = {}) {
  const repo = deps.observationRepository || observationRepository;
  const ultimas = await repo.buscarUltimasVersoes(SERIE, { transaction: deps.transaction });
  const conhecidos = new Map([...ultimas].map(([data, versao]) => [data, Number(versao.value)]));
  const { aceitos, falhas } = conferir(validos, conhecidos);
  const resultado = aceitos.length ? await persistirObservacoes(aceitos, contexto, deps) : { criados: 0, atualizados: 0, ignorados: 0, falhas: [] };
  return { ...resultado, falhas: [...falhas, ...resultado.falhas] };
}

module.exports = {
  codigo: "noticias-agricolas-cepea-cafe",
  get timeoutMs() {
    return env.collectors.sourceTimeoutMs;
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  parse,
  normalize,
  persist,
  extrairFechamentos,
  conferir,
  URL_PAGINA,
  SOURCE_CODE
};
