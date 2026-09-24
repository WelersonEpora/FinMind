"use strict";

const observationRepository = require("../repositories/observation.repository");
const { ValidationError } = require("../shared/errors");
const { validarPaginacao } = require("../shared/utils/pagination");
const { validarOrdenacao } = require("../shared/utils/ordenacao");
const { decodificarFuturoCcm } = require("../shared/utils/b3-contrato");
const { descreverRegiaoWasde } = require("../shared/utils/wasde-regiao");
const { descreverRegiaoConab } = require("../shared/utils/conab-regiao");
const { descreverRegiaoImea, descreverLocalCustoImea } = require("../shared/utils/imea-regiao");
const { descreverRegiaoNoaaVh } = require("../shared/utils/noaa-vh-regiao");
const { validarDataOpcional, TAMANHO_PAGINA_PADRAO, TAMANHO_PAGINA_MAXIMO } = require("./market-data.service");

// Leitura, para a tela de Observáveis, dos observáveis que vivem em
// `observation` (point-in-time, ADR 0008). Sempre a visão "vigente hoje"
// (asOf = agora): a tela mostra o que o FinMind sabe agora; a leitura
// histórica ("o que se sabia em D") é o `obterAsOf`, usado pelos fatores e
// pelo futuro experimento - não por esta tela.
//
// `item` é uma entrada do CATALOGO_OBSERVAVEIS com `origem: "observation"`.
// Há três formatos:
//   - `series: [{ modalidade, seriesCode }]` - conjunto fixo de séries (a
//     modalidade é a série no gráfico);
//   - `porCampo` + `campos` - UMA série por métrica (`<prefixoSerie>.<CAMPO>`), sem
//     itens: a tela oferece só o seletor de métrica (unidades diferentes, uma por vez);
//   - `porVencimento` (futuros com VÁRIOS vencimentos), `porRegiao` (uma
//     série por região do WASDE ou da Conab) ou `porAnoReferencia` (uma série por
//     ano-alvo das expectativas do Focus) + `campos` - séries `<prefixoSerie>.<ITEM>.<CAMPO>`.
//     Aqui a modalidade é o ITEM (vencimento ou região), o campo escolhido é UM
//     por vez (unidades diferentes) e cada item é uma linha própria - nunca uma
//     série contínua.

const CAMPOS_ORDENACAO_HISTORICO = ["referenceDate", "value"];

// O que muda entre um tipo de item e outro: como descobrir/rotular/ordenar os
// itens que existem no banco, qual deles é o "ativo" e os textos da tela.
// `descrever(codigo)` devolve null para um código que não pertence ao tipo (é
// ignorado); `ordem` é uma chave de texto (ordenada em pt-BR, depois pelo código).
const DIMENSAO_VENCIMENTO = {
  rotuloModalidade: "Vencimento",
  textos: {
    titulo: "Vencimentos",
    inativo: "vencido",
    mostrarInativos: "Mostrar vencimentos já vencidos",
    semSelecao: "Selecione ao menos um vencimento.",
    nota: "Cada linha é um vencimento; os vencimentos não são encadeados numa série contínua."
  },
  descrever(codigo) {
    const contrato = decodificarFuturoCcm(codigo);
    return contrato && { rotulo: contrato.rotulo, ordem: contrato.vencimento, extras: { vencimento: contrato.vencimento } };
  },
  // ativo = teve pregão no ÚLTIMO pregão coletado (todo vencimento listado aparece todo
  // dia, mesmo sem negócio, pelo preço de ajuste) - ou seja, ainda não venceu.
  ativo: (ultimaDataDoItem, ultimaDataGeral) => ultimaDataDoItem === ultimaDataGeral,
  // Destaque do card: o vencimento ativo mais próximo, identificado pelo ticker.
  escolherPrincipal: (itens) => itens.find((i) => i.ativo),
  destaque: (principal) => principal.codigo,
  padrao: (itens) => itens.filter((i) => i.ativo).map((i) => i.codigo)
};

// Dimensão "região" (WASDE por país, Conab por UF, IMEA por região e por município): o que muda é o mapa de rótulos, o texto do rótulo da
// coluna e as notas da tela; as regras (ativo, destaque, padrão) são as mesmas.
function criarDimensaoRegiao({ rotuloModalidade, textos, descreverRegiao }) {
  return {
    rotuloModalidade,
    textos,
    descrever(codigo) {
      const descricao = descreverRegiao(codigo);
      if (!descricao) return null; // código que não é deste tipo de item: ignorado
      const { rotulo, agregado } = descricao;
      // regiões antes de agregados, cada grupo em ordem alfabética
      return { rotulo, ordem: `${agregado ? "1" : "0"}${rotulo}`, extras: { agregado } };
    },
    // ativo = ainda publicada nos últimos 2 anos de dado (UE-27, ex-URSS e UE+Reino Unido pararam).
    ativo: (ultimaDataDoItem, ultimaDataGeral) => Number(String(ultimaDataDoItem).slice(0, 4)) >= Number(String(ultimaDataGeral).slice(0, 4)) - 1,
    // Destaque do card: a região configurada (ex.: mundo, Brasil), identificada pelo rótulo.
    escolherPrincipal: (itens, config) => itens.find((i) => i.codigo === config.itemPrincipal) ?? itens.find((i) => i.ativo),
    destaque: (principal) => principal.rotulo,
    padrao: (itens, config) => {
      const existentes = new Set(itens.map((i) => i.codigo));
      const escolhidos = (config.itensPadrao || []).filter((c) => existentes.has(c));
      return escolhidos.length ? escolhidos : itens.filter((i) => i.ativo).map((i) => i.codigo);
    }
  };
}

const DIMENSOES_REGIAO = {
  wasde: criarDimensaoRegiao({
    rotuloModalidade: "Região",
    descreverRegiao: descreverRegiaoWasde,
    textos: {
      titulo: "Regiões",
      inativo: "descontinuada",
      mostrarInativos: "Mostrar séries descontinuadas",
      semSelecao: "Selecione ao menos uma região.",
      nota:
        "Cada linha é uma região do WASDE, em milhões de toneladas, como publicado. Rótulos que mudaram ao longo dos anos (União Europeia, ex-URSS) são séries distintas, não emendadas. Agregados (mundo, mundo sem China etc.) têm escala muito maior que um país."
    }
  }),
  conab: criarDimensaoRegiao({
    rotuloModalidade: "Região/UF",
    descreverRegiao: descreverRegiaoConab,
    textos: {
      titulo: "Regiões e UFs",
      inativo: "descontinuada",
      mostrarInativos: "Mostrar séries descontinuadas",
      semSelecao: "Selecione ao menos uma região ou UF.",
      nota:
        "Cada linha é uma UF, uma macrorregião ou o Brasil, com a estimativa mais recente de cada levantamento mensal da Conab, como publicado (mil t, mil ha e kg/ha). O Brasil e as macrorregiões somam UFs e têm escala maior."
    }
  }),
  imea: criarDimensaoRegiao({
    rotuloModalidade: "Região",
    descreverRegiao: descreverRegiaoImea,
    textos: {
      titulo: "Regiões de Mato Grosso",
      inativo: "descontinuada",
      mostrarInativos: "Mostrar séries descontinuadas",
      semSelecao: "Selecione ao menos uma região.",
      nota:
        "Cada linha é Mato Grosso ou uma das 7 regiões em que o IMEA divide o estado (não são as regiões do IBGE), com o último valor de cada safra, como publicado (ha, t e sc/ha). Mato Grosso soma as regiões e tem escala maior."
    }
  }),
  "imea-custo": criarDimensaoRegiao({
    rotuloModalidade: "Local e tecnologia",
    descreverRegiao: descreverLocalCustoImea,
    textos: {
      titulo: "Locais e tecnologias",
      inativo: "descontinuada",
      mostrarInativos: "Mostrar séries descontinuadas",
      semSelecao: "Selecione ao menos um local.",
      nota:
        "Cada linha é Mato Grosso ou um município, em alta ou média tecnologia, com o custo por hectare (R$/ha) como o IMEA publica. Nem todo município tem planilha nos quatro arquivos: os que não têm não aparecem em todos os cards."
    }
  }),
  "noaa-vh": criarDimensaoRegiao({
    rotuloModalidade: "Região",
    descreverRegiao: descreverRegiaoNoaaVh,
    textos: {
      titulo: "Regiões",
      inativo: "descontinuada",
      mostrarInativos: "Mostrar séries descontinuadas",
      semSelecao: "Selecione ao menos uma região.",
      nota:
        "Cada linha é um país, um estado, o mundo ou um hemisfério, com o índice medido só sobre a área da cultura (0 a 100, como a NOAA publica). Abaixo de 40 a NOAA classifica como estresse da vegetação. Mundo e hemisférios são médias de áreas grandes e diluem choques regionais."
    }
  })
};

// Dimensão "ano de referência" (Focus, ADR 0022): o item é o ANO-ALVO da expectativa (`2026`, `2027`...), e cada
// boletim é um ponto da linha daquele ano. Ativo = o ano ainda consta do boletim mais recente (a fonte deixa de
// perguntar por um ano depois que ele termina).
const DIMENSAO_ANO_REFERENCIA = {
  rotuloModalidade: "Ano de referência",
  textos: {
    titulo: "Anos de referência",
    inativo: "encerrado",
    mostrarInativos: "Mostrar anos que o Focus já não pergunta",
    semSelecao: "Selecione ao menos um ano.",
    nota: "Cada linha é a expectativa para um ano-calendário, boletim a boletim (mediana, como publicada). O eixo do tempo é a data da pesquisa do boletim, não o ano esperado."
  },
  descrever(codigo) {
    return /^\d{4}$/.test(codigo) ? { rotulo: codigo, ordem: codigo, extras: {} } : null;
  },
  ativo: (ultimaDataDoItem, ultimaDataGeral) => ultimaDataDoItem === ultimaDataGeral,
  // Destaque do card: o ano mais próximo ainda perguntado (o ano corrente).
  escolherPrincipal: (itens) => itens.find((i) => i.ativo),
  destaque: (principal) => principal.rotulo,
  padrao: (itens) => itens.filter((i) => i.ativo).map((i) => i.codigo)
};

// { config, ...dimensão } do item, ou null quando o item é de formato fixo. `porRegiao.descritor` escolhe o
// mapa de rótulos ("wasde" por padrão).
function dimensaoDe(item) {
  if (item.porVencimento) return { ...DIMENSAO_VENCIMENTO, config: item.porVencimento };
  if (item.porAnoReferencia) return { ...DIMENSAO_ANO_REFERENCIA, config: item.porAnoReferencia };
  if (item.porRegiao) return { ...DIMENSOES_REGIAO[item.porRegiao.descritor || "wasde"], config: item.porRegiao };
  return null;
}

function ehPorSelecao(item) {
  return Boolean(dimensaoDe(item));
}

function campoDe(item, codigo) {
  return item.campos.find((c) => c.codigo === codigo);
}

// O campo pedido (ou o principal); campo que não é do card é rejeitado.
function resolverCampo(item, filtros) {
  const campo = campoDe(item, filtros.campo || item.campoPrincipal);
  if (!campo) throw new ValidationError(`"campo" deve ser um entre: ${item.campos.map((c) => c.codigo).join(", ")}.`);
  return campo;
}

function seriesDoCampo(item, codigoCampo) {
  return `${item.porCampo.prefixoSerie}.${codigoCampo}`;
}

// Itens presentes no banco, na ordem da dimensão. `ativo` é decidido pela dimensão
// (vencimento que ainda negocia; região ainda publicada).
async function listarItens(item, deps = {}) {
  const repo = deps.observationRepository || observationRepository;
  const dimensao = dimensaoDe(item);
  const descritos = (await repo.listarItens(dimensao.config))
    .map((linha) => ({ linha, descricao: dimensao.descrever(linha.codigo) }))
    .filter(({ descricao }) => descricao);
  const ultimaData = descritos.map(({ linha }) => linha.ultima_data).sort().pop() ?? null;

  return descritos
    .map(({ linha, descricao }) => ({
      codigo: linha.codigo,
      rotulo: descricao.rotulo,
      ...descricao.extras,
      ativo: dimensao.ativo(linha.ultima_data, ultimaData),
      primeiraData: linha.primeira_data,
      ultimaData: linha.ultima_data,
      pregoes: Number(linha.pregoes),
      ordem: descricao.ordem
    }))
    .sort((a, b) => a.ordem.localeCompare(b.ordem, "pt-BR") || a.codigo.localeCompare(b.codigo))
    .map(({ ordem: _ordem, ...resto }) => resto);
}

function seriesDoItem(item, codigoItem, campo) {
  return `${dimensaoDe(item).config.prefixoSerie}.${codigoItem}.${campo}`;
}

// Séries de um item de formato fixo.
function seriesFixasDoItem(item) {
  return item.series.map((s) => s.seriesCode);
}

function modalidadeDe(series, seriesCode) {
  return series.find((s) => s.seriesCode === seriesCode)?.modalidade ?? null;
}

function paraRegistroResposta(item, linha, { series, unidade }) {
  return {
    instrumento: item.instrumentCode,
    valor: Number(linha.value),
    unidade,
    modalidade: modalidadeDe(series, linha.series_code),
    dataReferencia: linha.observed_at,
    fonte: item.fonte,
    periodicidade: item.frequencia.toLowerCase(),
    tempoReal: false,
    atualizadoEm: linha.collected_at,
    // Quando o valor passou a estar disponível e se essa data é estimada
    // por regra (ver ADR 0008) - a tela precisa ser honesta sobre isso.
    publicadoEm: linha.published_at,
    publicadoEmEstimado: Boolean(Number(linha.published_at_is_estimated))
  };
}

// "Valor atual" do card. Para itens por vencimento/região: o campo principal do
// item em destaque (vencimento mais próximo ainda ativo; região configurada), sempre
// identificado em `destaque` - é só o destaque do card, não uma série contínua.
async function obterCotacaoAtual(item, deps = {}) {
  const repo = deps.observationRepository || observationRepository;
  const dimensao = dimensaoDe(item);

  if (item.porCampo) {
    const campo = campoDe(item, item.campoPrincipal);
    const seriesCode = seriesDoCampo(item, campo.codigo);
    const linha = await repo.buscarMaisRecente(seriesCode);
    if (!linha) return { cotacao: null, mensagem: "Nenhuma observação coletada ainda para este observável." };
    return { cotacao: paraRegistroResposta(item, linha, { series: [{ seriesCode, modalidade: "valor" }], unidade: campo.unidade }) };
  }

  if (dimensao) {
    const principal = dimensao.escolherPrincipal(await listarItens(item, deps), dimensao.config);
    if (!principal) return { cotacao: null, mensagem: "Nenhuma observação coletada ainda para este observável." };

    const campo = campoDe(item, item.campoPrincipal);
    const linha = await repo.buscarMaisRecente(seriesDoItem(item, principal.codigo, campo.codigo));
    if (!linha) return { cotacao: null, mensagem: "Nenhuma observação coletada ainda para este observável." };

    return {
      cotacao: paraRegistroResposta(item, linha, { series: [{ seriesCode: linha.series_code, modalidade: principal.codigo }], unidade: campo.unidade }),
      destaque: dimensao.destaque(principal)
    };
  }

  const principal = item.series.find((s) => s.modalidade === item.modalidadePrincipal) || item.series[0];
  const linha = await repo.buscarMaisRecente(principal.seriesCode);
  if (!linha) return { cotacao: null, mensagem: "Nenhuma observação coletada ainda para este observável." };
  return { cotacao: paraRegistroResposta(item, linha, { series: item.series, unidade: item.unidade }) };
}

// Cobertura agregada das séries do grupo + quanto da data de publicação é
// estimada (transparência do point-in-time).
async function obterEstatisticas(item, deps = {}) {
  const repo = deps.observationRepository || observationRepository;

  let seriesCodes;
  if (ehPorSelecao(item)) {
    seriesCodes = (await listarItens(item, deps)).flatMap((i) => item.campos.map((c) => seriesDoItem(item, i.codigo, c.codigo)));
  } else if (item.porCampo) {
    seriesCodes = item.campos.map((c) => seriesDoCampo(item, c.codigo));
  } else {
    seriesCodes = seriesFixasDoItem(item);
  }
  const resumos = seriesCodes.length ? await repo.resumirSeries(seriesCodes) : [];

  const datas = (campo) => resumos.map((r) => r[campo]).filter(Boolean).sort();
  const primeiras = datas("primeira_data");
  const ultimas = datas("ultima_data");
  const somar = (campo) => resumos.reduce((acc, r) => acc + Number(r[campo] || 0), 0);

  const totalVersoes = somar("total_versoes");
  const versoesEstimadas = somar("versoes_estimadas");

  return {
    primeiraData: primeiras[0] ?? null,
    ultimaData: ultimas[ultimas.length - 1] ?? null,
    totalObservacoes: somar("total_observacoes"),
    publicacao: { totalVersoes, versoesEstimadas, percentualEstimado: totalVersoes ? Math.round((versoesEstimadas / totalVersoes) * 1000) / 10 : null }
  };
}

// O que a tela precisa para montar os seletores de um card por vencimento/região:
// campos (com unidade), campo padrão, os itens (ativos e inativos), quais vêm
// marcados e os textos da dimensão.
async function obterDimensoes(item, deps = {}) {
  if (item.porCampo) return { campos: item.campos, campoPrincipal: item.campoPrincipal };
  const dimensao = dimensaoDe(item);
  if (!dimensao) return null;
  const itens = await listarItens(item, deps);
  return {
    campos: item.campos,
    campoPrincipal: item.campoPrincipal,
    rotuloModalidade: dimensao.rotuloModalidade,
    selecao: dimensao.textos,
    itens,
    itensPadrao: dimensao.padrao(itens, dimensao.config)
  };
}

// Descrição da dimensão de itens (ou null): usada pela exportação para rotular a coluna.
function descreverDimensao(item) {
  const dimensao = dimensaoDe(item);
  return dimensao ? { rotuloModalidade: dimensao.rotuloModalidade } : null;
}

// Resolve QUAIS séries consultar e a unidade delas, a partir dos filtros.
async function resolverSeries(item, filtros, deps) {
  if (item.porCampo) {
    const campo = resolverCampo(item, filtros);
    return { series: [{ modalidade: "valor", seriesCode: seriesDoCampo(item, campo.codigo) }], unidade: campo.unidade };
  }

  const dimensao = dimensaoDe(item);
  if (!dimensao) {
    let series = item.series;
    if (filtros.modality) {
      const serie = item.series.find((s) => s.modalidade === filtros.modality);
      if (!serie) throw new ValidationError(`"modality" deve ser uma entre: ${item.series.map((s) => s.modalidade).join(", ")}.`);
      series = [serie];
    }
    return { series, unidade: item.unidade };
  }

  const campo = resolverCampo(item, filtros);

  const existentes = await listarItens(item, deps);
  const pedidos = filtros.itens ? String(filtros.itens).split(",").map((v) => v.trim()).filter(Boolean) : null;
  // Sem escolha: o padrão da dimensão (os itens ativos, ou os configurados no catálogo).
  const escolhidos = pedidos ?? dimensao.padrao(existentes, dimensao.config);

  const desconhecidos = escolhidos.filter((codigo) => !existentes.some((i) => i.codigo === codigo));
  if (desconhecidos.length) throw new ValidationError(`${dimensao.rotuloModalidade}(s) desconhecido(s): ${desconhecidos.join(", ")}.`);

  return {
    series: escolhidos.map((codigo) => ({ modalidade: codigo, seriesCode: seriesDoItem(item, codigo, campo.codigo) })),
    unidade: campo.unidade
  };
}

async function obterHistorico(item, filtros, deps = {}) {
  const repo = deps.observationRepository || observationRepository;

  const dataInicio = validarDataOpcional(filtros.dataInicio, "dataInicio");
  const dataFim = validarDataOpcional(filtros.dataFim, "dataFim");
  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('"dataInicio" não pode ser posterior a "dataFim".');
  }

  const { pagina, tamanhoPagina } = validarPaginacao(filtros, { tamanhoPadrao: TAMANHO_PAGINA_PADRAO, tamanhoMaximo: TAMANHO_PAGINA_MAXIMO });
  const { ordenarPor, ordem } = validarOrdenacao(filtros, { camposPermitidos: CAMPOS_ORDENACAO_HISTORICO, padrao: "referenceDate" });

  const { series, unidade } = await resolverSeries(item, filtros, deps);
  if (series.length === 0) {
    return { historico: [], paginacao: { pagina, tamanhoPagina, total: 0, totalPaginas: 1 } };
  }

  const { registros, total } = await repo.buscarHistoricoAtual({
    seriesCodes: series.map((s) => s.seriesCode),
    dataInicio,
    dataFim,
    ordenarPor,
    ordem,
    limite: tamanhoPagina,
    deslocamento: (pagina - 1) * tamanhoPagina
  });

  return {
    historico: registros.map((linha) => paraRegistroResposta(item, linha, { series, unidade })),
    paginacao: { pagina, tamanhoPagina, total, totalPaginas: Math.max(1, Math.ceil(total / tamanhoPagina)) }
  };
}

module.exports = { obterCotacaoAtual, obterEstatisticas, obterDimensoes, obterHistorico, listarItens, descreverDimensao };
