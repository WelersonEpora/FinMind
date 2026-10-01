"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// FMI - reservas de ouro dos bancos centrais, pelo IRFCL (International Reserves and Foreign Currency Liquidity, o
// "Reserves Data Template" que cada banco central reporta ao FMI todo mês). Ouro, fator "Demanda de bancos centrais
// (reservas)", peso Alto. ADR 0036; reconhecimento em `docs/reconhecimento-fontes/fmi-irfcl-ouro.md`.
//
// VERIFICADO POR CHAMADA REAL em 2026-10-01: API SDMX pública, sem chave (`api.imf.org`, a que substituiu a antiga
// `dataservices.imf.org`, desligada). Uma chamada traz os 88 países (80 com dado em 2026), mensal desde dez/1999, em
// ~3 s. Duas séries por país:
//   IMF.IRFCL.OURO.<PAIS>.VOLUME_MI_OZT  volume de ouro nas reservas, em MILHÕES de onças troy (IRFCLDT1_IRFCL56V_FTO)
//   IMF.IRFCL.OURO.<PAIS>.VALOR_MI_USD   valor do mesmo ouro, em MILHÕES de US$ (IRFCLDT1_IRFCL56_USD)
// ESCALA: a API devolve o número em unidades (onças, US$) e declara, em cada série, o atributo SCALE = 6: o FMI
// publica para leitura em milhões (o nome do indicador já diz "gold volume in millions of fine troy ounces"). O valor
// é gravado na escala declarada, lida de cada série (nunca fixada aqui). Em unidades, o ouro da área do euro em US$
// (~1,5 trilhão) estoura a coluna `value` (até 10^12): foi o "numeric field overflow" da 1ª coleta, em dev.
// Setor "autoridades monetárias" (S1XS1311), o que todos os 88 reportam. Os EUA batem com o número oficial
// (261.499.000 onças).
//
// CONFERÊNCIA DE UNIDADE (defeito conhecido da fonte): alguns países reportam o volume numa unidade errada (em
// 2026-10-01, Brasil e Angola 1.000× maior e o Chile aparentemente em quilos). Só a comparação com o valor em US$ o
// revela: valor ÷ volume é um "preço implícito", que tem de ficar perto do dos demais países no mesmo mês. Fora de
// FATOR_FAIXA vezes a mediana do mês, o volume é gravado COMO PUBLICADO, com `metadata.conferenciaPreco` e um aviso:
// nunca corrigido aqui (seria inventar o dado). O mesmo marca quem informa o valor em US$ pelo preço contábil (EUA e
// Arábia Saudita, pelo preço legal de US$ 42,22): ali o volume está certo e o valor é que não é de mercado.
//
// published_at: a fonte NÃO informa (nem na resposta, nem no cabeçalho HTTP) e não guarda versões. Fica sem
// published_at, e o serviço point-in-time usa o instante da coleta (ADR 0008), como na PSD do USDA (ADR 0031): o
// número está certo, mas uma leitura "o que se sabia em D" anterior à primeira coleta não o enxerga. Uma revisão vista
// numa coleta posterior vira versão nova.
//
// Licença (ADR 0036): uso livre, inclusive comercial, com a citação "Source: International Monetary Fund, International
// Reserves and Foreign Currency Liquidity" e sem alterar o dado. Os termos restringem download em massa automatizado
// sem permissão; aqui é UMA consulta por dia à API pública que o FMI oferece para acesso automatizado (risco aceito
// pelo usuário, 2026-10-01).

const URL_API =
  "https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.STA/IRFCL/%2B/*.IRFCLDT1_IRFCL56V_FTO+IRFCLDT1_IRFCL56_USD.S1XS1311.M";
const SOURCE_CODE = "IMF_IRFCL";
const PREFIXO_SERIE = "IMF.IRFCL.OURO";
const INDICADORES = {
  IRFCLDT1_IRFCL56V_FTO: { campo: "VOLUME_MI_OZT", unit: "mi oz troy" },
  IRFCLDT1_IRFCL56_USD: { campo: "VALOR_MI_USD", unit: "mi USD" }
};
// A única escala conferida (todas as séries em 2026-10-01). Outra vira item inválido, para não gravar fora de escala.
const ESCALA_ESPERADA = 6;
// Preço implícito fora de [mediana / FATOR, mediana × FATOR] no mesmo mês = volume (ou valor) fora da escala.
const FATOR_FAIXA = 3;
// Abaixo disso, a mediana do mês não é confiável e o mês não é conferido.
const MINIMO_PAISES_NO_MES = 5;
const REGEX_PERIODO = /^(\d{4})-M(\d{2})$/;

function download({ signal }) {
  return baixar(URL_API, { signal, as: "json", headers: { Accept: "application/vnd.sdmx.data+json" } });
}

function dimensao(lista, id) {
  const i = (lista || []).findIndex((d) => d.id === id);
  return i < 0 ? null : { indice: i, valores: lista[i].values };
}

// Resposta SDMX JSON -> [{ pais, indicador, periodo, valor, escala }] (valor em texto, como veio; escala = o SCALE
// da série, a potência de 10 em que o FMI publica).
function parse(raw) {
  const estrutura = raw?.data?.structures?.[0];
  const series = raw?.data?.dataSets?.[0]?.series;
  if (!estrutura || !series) throw new UpstreamServiceError("Resposta do FMI em formato inesperado (esperava SDMX JSON com structures e dataSets).");

  const pais = dimensao(estrutura.dimensions?.series, "COUNTRY");
  const indicador = dimensao(estrutura.dimensions?.series, "INDICATOR");
  const tempo = dimensao(estrutura.dimensions?.observation, "TIME_PERIOD");
  if (!pais || !indicador || !tempo) throw new UpstreamServiceError("Resposta do FMI sem as dimensões COUNTRY, INDICATOR ou TIME_PERIOD.");

  const atributos = estrutura.attributes?.series || [];
  const iEscala = atributos.findIndex((a) => a.id === "SCALE");

  const itens = [];
  for (const [chave, serie] of Object.entries(series)) {
    const escalaBruta = iEscala < 0 ? null : atributos[iEscala].values?.[serie.attributes?.[iEscala]]?.id;
    const escala = escalaBruta === undefined || escalaBruta === null ? null : Number(escalaBruta);
    const posicoes = chave.split(":").map(Number);
    const codigoPais = pais.valores[posicoes[pais.indice]]?.id;
    const codigoIndicador = indicador.valores[posicoes[indicador.indice]]?.id;
    for (const [i, observacao] of Object.entries(serie.observations || {})) {
      const periodo = tempo.valores[Number(i)]?.value ?? tempo.valores[Number(i)]?.id;
      itens.push({ pais: codigoPais, indicador: codigoIndicador, periodo, valor: observacao?.[0] ?? null, escala });
    }
  }
  return itens;
}

function mediana(numeros) {
  const ordenados = [...numeros].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

// { "<pais>|<mes>" -> { precoImplicito, mediana } } dos pares fora da faixa.
function conferirPrecos(validos) {
  const pares = new Map();
  for (const v of validos) {
    const chave = `${v.metadata.pais}|${v.observed_at}`;
    if (!pares.has(chave)) pares.set(chave, {});
    pares.get(chave)[v.metadata.campo] = v.value;
  }
  const porMes = new Map();
  for (const [chave, par] of pares) {
    if (!(par.VOLUME_MI_OZT > 0 && par.VALOR_MI_USD > 0)) continue;
    const mes = chave.split("|")[1];
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push({ chave, preco: par.VALOR_MI_USD / par.VOLUME_MI_OZT });
  }
  const fora = new Map();
  for (const lista of porMes.values()) {
    if (lista.length < MINIMO_PAISES_NO_MES) continue;
    const m = mediana(lista.map((p) => p.preco));
    for (const { chave, preco } of lista) {
      if (preco < m / FATOR_FAIXA || preco > m * FATOR_FAIXA) fora.set(chave, { precoImplicito: preco, mediana: m });
    }
  }
  return fora;
}

function normalize(rawItems) {
  const validos = [];
  const invalidos = [];

  for (const item of rawItems) {
    const indicador = INDICADORES[item.indicador];
    const m = REGEX_PERIODO.exec(String(item.periodo));
    if (!indicador || !/^[A-Z0-9]{3,4}$/.test(String(item.pais)) || !m) {
      invalidos.push({ item, motivo: `País, indicador ou período inesperado: ${item.pais} / ${item.indicador} / ${item.periodo}.` });
      continue;
    }
    if (item.valor === null || item.valor === "") continue; // célula vazia: ausência, não observação
    if (item.escala !== ESCALA_ESPERADA) {
      invalidos.push({ item, motivo: `Escala (SCALE) ${item.escala} diferente da conferida (${ESCALA_ESPERADA}): não gravado para não ficar fora de escala.` });
      continue;
    }
    const publicado = Number(item.valor);
    if (!Number.isFinite(publicado) || publicado < 0) {
      invalidos.push({ item, motivo: `Valor inválido: "${item.valor}".` });
      continue;
    }
    // Arredondado às 6 casas da coluna `value` AQUI: senão o banco arredonda ao gravar e o serviço point-in-time
    // (que compara com toFixed(6)) discorda dele nos casos de meio, e um valor igual vira "revisão" a cada coleta
    // (93 revisões falsas na 2ª coleta de dev, 2026-10-01).
    const valor = Number((publicado / 10 ** item.escala).toFixed(6));

    validos.push({
      series_code: `${PREFIXO_SERIE}.${item.pais}.${indicador.campo}`,
      observed_at: `${m[1]}-${m[2]}-01`,
      value: valor,
      unit: indicador.unit,
      source_code: SOURCE_CODE,
      // Sem published_at: a fonte não informa; o serviço usa o instante da coleta.
      published_at_is_estimated: true,
      metadata: { fonte: "FMI (IRFCL)", pais: item.pais, campo: indicador.campo, indicadorFmi: item.indicador, periodo: item.periodo }
    });
  }

  // Conferência de unidade: marca (sem corrigir) e resume num aviso por país.
  const fora = conferirPrecos(validos);
  const porPais = new Map();
  for (const v of validos) {
    const achado = fora.get(`${v.metadata.pais}|${v.observed_at}`);
    if (!achado) continue;
    v.metadata.conferenciaPreco = {
      situacao: "fora_da_faixa",
      precoImplicitoUsdOz: Number(achado.precoImplicito.toFixed(2)),
      medianaDoMesUsdOz: Number(achado.mediana.toFixed(2))
    };
    if (v.metadata.campo !== "VOLUME_MI_OZT") continue;
    const resumo = porPais.get(v.metadata.pais) || { meses: 0, primeiro: v.observed_at, ultimo: v.observed_at, ultimoPreco: 0 };
    resumo.meses += 1;
    if (v.observed_at < resumo.primeiro) resumo.primeiro = v.observed_at;
    if (v.observed_at >= resumo.ultimo) {
      resumo.ultimo = v.observed_at;
      resumo.ultimoPreco = achado.precoImplicito;
    }
    porPais.set(v.metadata.pais, resumo);
  }
  const avisos = [...porPais].map(([pais, r]) => ({
    item: { pais, meses: r.meses, primeiro: r.primeiro, ultimo: r.ultimo },
    motivo: `Preço implícito (valor em US$ ÷ volume) fora da faixa em ${r.meses} mês(es), o último em ${r.ultimo.slice(0, 7)} (US$ ${r.ultimoPreco.toFixed(2)} a onça): volume em unidade errada ou valor contábil. Gravado como publicado e marcado em metadata.conferenciaPreco.`
  }));

  return { validos, invalidos, avisos };
}

module.exports = {
  codigo: "fmi-irfcl-ouro",
  get timeoutMs() {
    return env.collectors.sourceTimeoutMs;
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  parse,
  normalize,
  persist: persistirObservacoes,
  conferirPrecos,
  SOURCE_CODE,
  PREFIXO_SERIE,
  FATOR_FAIXA
};
