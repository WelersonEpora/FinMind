"use strict";

const XLSX = require("xlsx");
const { ValidationError } = require("../../shared/errors");
const { zonedParaUtc } = require("../../shared/utils/zoned-time");
const { persistirObservacoes } = require("../base/persist-observations");

// Indicador do Café Arábica CEPEA/ESALQ, pela planilha que o usuário exporta à mão no site do Cepea ("Gerar Excel").
// ADR 0146 (análise do café de 2026-10-19, item E8: o Cepea aprovado pelo Comitê como o preço físico do F4 e do F5).
//
// POR QUE À MÃO: o site do Cepea bloqueia automação (desafio do Cloudflare na exportação; `robots.txt` contra agentes de
// IA), e o arquivo `Indic` da B3, de onde vem o milho (ADR 0021), não traz o café. Este coletor nunca faz requisição ao
// Cepea: recebe os arquivos já baixados (a tela de importação, POST /api/v1/cepea/cafe/importacao, ou o script
// `npm run importar:cepea-cafe`). Não é registrado na coleta diária.
//
// O ARQUIVO (conferido na exportação de 2026-10-23, 7.506 pregões de 02/09/1996 a 22/10/2026; o mesmo layout que o
// AgroMind registrou para o milho e a soja): XLS binário (OLE2), aba "Plan 1" com 4 linhas de cabeçalho -
//   0: "Café | INDICADOR DO CAFÉ ARÁBICA CEPEA/ESALQ"   1: "Nota", metodologia   2: "Fonte", "Cepea"
//   3: "Data", "À vista R$", "À vista US$"              4+: "DD/MM/AAAA", "1.620,92", "322,38" (texto, vírgula decimal)
// e uma aba "Worksheet" vazia. O nome do arquivo não diz o produto (`cepea-consulta-<hora>.xls`): vale o título.
//
// published_at: a planilha não informa. ESTIMADO no fim do dia do pregão em Brasília (o Cepea divulga o indicador no
// fim da tarde), a mesma regra do milho pela B3. Um valor que mude numa exportação posterior vira revisão (ADR 0008).

const SOURCE_CODE = "CEPEA";
const FUSO = "America/Sao_Paulo";
const PREFIXO_SERIE = "CEPEA.CAFE_ARABICA";
const TITULO = "INDICADOR DO CAFE ARABICA CEPEA/ESALQ";
const COLUNAS = ["DATA", "A VISTA R$", "A VISTA US$"];
const CAMPOS = [
  { coluna: 1, campo: "AVISTA_BRL", unit: "BRL/saca" },
  { coluna: 2, campo: "AVISTA_USD", unit: "USD/saca" }
];

// Sem acento e em maiúsculas: o título e o cabeçalho são comparados assim.
const semAcento = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();

// "1.620,92" -> 1620.92; vazio ou fora do formato -> NaN.
function lerNumero(texto) {
  const t = String(texto ?? "").trim();
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(t)) return Number.NaN;
  return Number(t.replace(/\./g, "").replace(",", "."));
}

// "22/10/2026" -> "2026-10-22"; fora do formato ou data impossível -> null.
function lerData(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto ?? "").trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const data = new Date(`${iso}T00:00:00Z`);
  // A volta para texto pega a data impossível (31/02 viraria 03/03).
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === iso ? iso : null;
}

// Puro: um arquivo exportado -> { linhas: [[data, brl, usd]] } ou lança ValidationError (não é a planilha do café).
function lerPlanilha(conteudo, nome = "arquivo") {
  let wb;
  try {
    wb = XLSX.read(conteudo, { raw: false });
  } catch (err) {
    throw new ValidationError(`"${nome}" não é uma planilha legível: ${err.message}`);
  }
  const aba = wb.Sheets["Plan 1"] || wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(aba, { header: 1, raw: false, defval: null });
  const titulo = String(linhas[0]?.[0] ?? "");
  if (!semAcento(titulo).includes(TITULO)) {
    throw new ValidationError(`"${nome}" não é o Indicador do Café Arábica CEPEA/ESALQ (título: "${titulo || "vazio"}").`);
  }
  const cabecalho = (linhas[3] || []).slice(0, 3).map(semAcento);
  if (COLUNAS.some((c, i) => cabecalho[i] !== c)) {
    throw new ValidationError(`"${nome}": colunas fora do layout esperado (${(linhas[3] || []).slice(0, 3).join(", ")}).`);
  }
  return { linhas: linhas.slice(4).filter((l) => l?.[0] != null && String(l[0]).trim() !== "") };
}

// O coletor de uma importação: `arquivos` = [{ nome, conteudo: Buffer }], já recebidos.
function criarColetorCepeaCafePlanilha({ arquivos }) {
  return {
    codigo: "cepea-cafe-planilha",
    timeoutMs: 60000,
    tentativasRetry: 1,
    download: async () => arquivos,
    parse(rawData) {
      return rawData.flatMap(({ nome, conteudo }) => lerPlanilha(conteudo, nome).linhas.map((linha) => ({ arquivo: nome, linha })));
    },
    normalize,
    persist: persistirObservacoes
  };
}

// Puro. Arquivos sobrepostos repetem dias: o mesmo valor entra uma vez; valores diferentes no mesmo dia, nenhum.
function normalize(rawItems) {
  const invalidos = [];
  const porDia = new Map();
  for (const item of rawItems) {
    const [textoData, ...valores] = item.linha;
    const data = lerData(textoData);
    const numeros = CAMPOS.map(({ coluna }) => lerNumero(valores[coluna - 1]));
    if (!data || numeros.some((v) => !(v > 0))) {
      invalidos.push({ item, motivo: `Linha fora do formato em "${item.arquivo}": ${item.linha.slice(0, 3).join(" | ")}.` });
      continue;
    }
    const anterior = porDia.get(data);
    if (anterior && anterior.numeros.some((v, i) => v !== numeros[i])) anterior.conflito = true;
    else if (!anterior) porDia.set(data, { arquivo: item.arquivo, numeros });
  }

  const validos = [];
  for (const [data, { arquivo, numeros, conflito }] of porDia) {
    if (conflito) {
      invalidos.push({ item: { data }, motivo: `${data}: valores diferentes entre os arquivos enviados; nada gravado.` });
      continue;
    }
    CAMPOS.forEach(({ campo, unit }, i) => {
      validos.push({
        series_code: `${PREFIXO_SERIE}.${campo}`,
        observed_at: data,
        value: numeros[i],
        unit,
        source_code: SOURCE_CODE,
        published_at: zonedParaUtc(data, "23:59:59", FUSO),
        published_at_is_estimated: true,
        published_at_basis: "lag_rule",
        metadata: {
          fonte: "Cepea - exportação manual do site (Gerar Excel)",
          indicador: "Indicador do Café Arábica CEPEA/ESALQ",
          arquivo,
          regraPublicacao: "fim_do_dia_do_pregao_brt"
        }
      });
    });
  }
  return { validos, invalidos };
}

module.exports = { criarColetorCepeaCafePlanilha, lerPlanilha, lerNumero, lerData, normalize, PREFIXO_SERIE, SOURCE_CODE };
