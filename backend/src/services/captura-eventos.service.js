"use strict";

const crypto = require("node:crypto");
const eventoReferenciaRepository = require("../repositories/evento-referencia.repository");
const observationRepository = require("../repositories/observation.repository");
const geopoliticaRepository = require("../repositories/geopolitica.repository");
const { decodificarFuturoB3 } = require("../shared/utils/b3-contrato");
const { somarDias } = require("../shared/utils/date-utils");
const { NotFoundError, ValidationError } = require("../shared/errors");
const criterio = require("../shared/captura-eventos");

// O teste de captura dos eventos (ADR 0144; análise do café de 2026-10-19, item E2): a lista de eventos de referência
// (o gabarito) e a medida de quantos dos relevantes a leitura diária de eventos capturou.
//
// Os candidatos saem de gatilhos objetivos, SEM a IA de eventos, para o teste não ser circular:
//   - CALENDARIO: o dia de publicação de um relatório do ativo (shared/captura-eventos.js), pela observation;
//   - PRECO: um movimento grande do preço no futuro da B3 do ativo (|z| >= 2 contra os 60 retornos anteriores).
// À parte, SECUNDARIA: o evento aceito da própria leitura sustentado só por fonte secundária (o alerta do ADR 0130). Esse
// vem da IA: a captura dele é por construção, e o resumo mostra o percentual também sem ele. MANUAL: o que o usuário
// adiciona. Quem julga a relevância e a captura é uma pessoa (o usuário, decisão de 2026-10-23).

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIODO_MAXIMO_DIAS = 400;
// O histórico do preço antes do período, para os 60 retornos do desvio.
const DIAS_DE_HISTORICO_DO_PRECO = 120;

const fmtPct = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fmtZ = (n) => `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

function validarAtivo(ativo) {
  const codigo = String(ativo || "").trim().toUpperCase();
  if (!criterio.CODIGOS_ATIVO.includes(codigo)) throw new ValidationError(`"ativo" deve ser um entre: ${criterio.CODIGOS_ATIVO.join(", ")}.`);
  return codigo;
}

function validarData(valor, campo) {
  if (!REGEX_DATA.test(String(valor || "")) || Number.isNaN(Date.parse(`${valor}T00:00:00Z`))) throw new ValidationError(`"${campo}" deve estar em AAAA-MM-DD.`);
  return valor;
}

function diasEntre(inicio, fim) {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000);
}

function validarPeriodo({ dataInicio, dataFim }) {
  validarData(dataInicio, "dataInicio");
  validarData(dataFim, "dataFim");
  if (dataInicio > dataFim) throw new ValidationError('"dataInicio" não pode ser depois de "dataFim".');
  if (diasEntre(dataInicio, dataFim) > PERIODO_MAXIMO_DIAS) throw new ValidationError(`O período tem no máximo ${PERIODO_MAXIMO_DIAS} dias.`);
  return { dataInicio, dataFim };
}

const ehDiaUtil = (iso) => {
  const dia = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dia !== 0 && dia !== 6;
};

// `n` dias úteis (segunda a sexta) depois de `iso`.
function somarDiasUteis(iso, n) {
  let d = iso;
  for (let restantes = n; restantes > 0; ) {
    d = somarDias(d, 1);
    if (ehDiaUtil(d)) restantes -= 1;
  }
  return d;
}

// As leituras que podem capturar um evento: do dia dele até 2 dias úteis depois.
function janelaDeCaptura(data) {
  return { inicio: data, fim: somarDiasUteis(data, criterio.DIAS_UTEIS_CAPTURA) };
}

const hashCurto = (texto) => crypto.createHash("sha1").update(texto).digest("hex").slice(0, 12);

// --- Os gatilhos (funções puras) ------------------------------------------------------------------------------------

// CALENDARIO: um candidato por relatório e dia de publicação. `dias`: o que listarDiasDePublicacao devolve.
function candidatosDoCalendario(ativo, dias) {
  const nomes = new Map(criterio.ATIVOS[ativo].relatorios.map((r) => [r.fonte, r.nome]));
  return dias
    .filter((d) => nomes.has(d.sourceCode))
    .map((d) => ({
      ativo,
      data: d.dia,
      origem: "CALENDARIO",
      chave: `CALENDARIO:${ativo}:${d.sourceCode}:${d.dia}`,
      titulo: `Publicação: ${nomes.get(d.sourceCode)}`,
      detalhe: { fonte: d.sourceCode, versoes: d.versoes, dataEstimada: d.estimada }
    }));
}

function desvioPadrao(valores) {
  const media = valores.reduce((s, v) => s + v, 0) / valores.length;
  return Math.sqrt(valores.reduce((s, v) => s + (v - media) ** 2, 0) / (valores.length - 1));
}

// Os retornos do dia no vencimento mais negociado, dentro do contrato. `ajustes` e `negociados`: Map ticker -> Map data
// -> valor. -> [{ data, ticker, retorno, z }] (z null sem os 60 retornos anteriores).
function retornosDoFuturo({ ajustes, negociados }, { janelaRetornos = criterio.PRECO.janelaRetornos } = {}) {
  const dias = [...new Set([...ajustes.values()].flatMap((m) => [...m.keys()]))].sort();
  const retornos = [];
  for (let i = 1; i < dias.length; i += 1) {
    const [dia, anterior] = [dias[i], dias[i - 1]];
    const candidatos = [...ajustes.entries()]
      .filter(([, porDia]) => porDia.has(dia) && porDia.has(anterior) && porDia.get(anterior) > 0)
      .map(([ticker, porDia]) => ({ ticker, porDia, negocios: negociados.get(ticker)?.get(dia) || 0 }))
      .filter((c) => c.negocios > 0)
      .sort((a, b) => b.negocios - a.negocios);
    if (candidatos.length === 0) continue;
    const [{ ticker, porDia }] = candidatos;
    retornos.push({ data: dia, ticker, retorno: porDia.get(dia) / porDia.get(anterior) - 1 });
  }
  return retornos.map((r, i) => {
    if (i < janelaRetornos) return { ...r, z: null };
    const desvio = desvioPadrao(retornos.slice(i - janelaRetornos, i).map((x) => x.retorno));
    return { ...r, z: desvio > 0 ? r.retorno / desvio : null };
  });
}

// PRECO: um candidato por dia com |z| >= o mínimo, dentro do período.
function candidatosDoPreco(ativo, retornos, { dataInicio, dataFim }) {
  return retornos
    .filter((r) => r.z !== null && Math.abs(r.z) >= criterio.PRECO.zMinimo && r.data >= dataInicio && r.data <= dataFim)
    .map((r) => ({
      ativo,
      data: r.data,
      origem: "PRECO",
      chave: `PRECO:${ativo}:${r.data}`,
      titulo: `Movimento do preço: ${decodificarFuturoB3(r.ticker)?.rotulo ?? r.ticker} ${fmtPct(r.retorno * 100)} no dia (z ${fmtZ(r.z)})`,
      detalhe: { ticker: r.ticker, retornoPct: r.retorno * 100, z: r.z }
    }));
}

// SECUNDARIA: os eventos aceitos da leitura do ativo sustentados só por fonte secundária. `eventos`: [{ data, titulo,
// fontes }]. A chave usa o título, não o id: a leitura do dia pode ser refeita.
function candidatosSecundarios(ativo, eventos) {
  return eventos
    .filter((e) => {
      const daPesquisa = (e.fontes || []).filter((f) => f.origem === "pesquisa");
      return daPesquisa.length > 0 && daPesquisa.every((f) => f.secundaria);
    })
    .map((e) => ({
      ativo,
      data: e.data,
      origem: "SECUNDARIA",
      chave: `SECUNDARIA:${ativo}:${e.data}:${hashCurto(e.titulo)}`,
      titulo: `Alerta: ${e.titulo}`.slice(0, 300),
      detalhe: { fontes: [...new Set(e.fontes.filter((f) => f.origem === "pesquisa").map((f) => f.nome))] }
    }));
}

// --- O resumo -------------------------------------------------------------------------------------------------------

function contagem(itens) {
  const relevantes = itens.filter((i) => i.relevante === true);
  const capturados = relevantes.filter((i) => i.captura === "CAPTURADO").length;
  const naoCapturados = relevantes.filter((i) => i.captura === "NAO_CAPTURADO").length;
  const conferidos = capturados + naoCapturados;
  return {
    relevantes: relevantes.length,
    capturados,
    naoCapturados,
    semConferencia: relevantes.length - conferidos,
    pctCaptura: conferidos > 0 ? (capturados / conferidos) * 100 : null
  };
}

// O resumo do período: quantos foram avaliados e, dos relevantes conferidos, quantos foram capturados, contra a meta.
// O percentual sem os alertas de fonte secundária (que vêm da própria leitura) vai ao lado.
function resumir(itens, { dataInicio, dataFim }) {
  const geral = contagem(itens);
  const semSecundaria = contagem(itens.filter((i) => i.origem !== "SECUNDARIA"));
  const diasDoPeriodo = diasEntre(dataInicio, dataFim) + 1;
  const pendentes = itens.filter((i) => i.relevante === null).length;
  return {
    total: itens.length,
    avaliados: itens.length - pendentes,
    pendentes,
    ...geral,
    semSecundaria,
    porOrigem: Object.fromEntries(Object.keys(criterio.ORIGENS).map((o) => [o, { total: itens.filter((i) => i.origem === o).length, ...contagem(itens.filter((i) => i.origem === o)) }])),
    diasDoPeriodo,
    // O teste vale num período de 30 dias, com tudo avaliado e conferido.
    periodoDoCriterio: diasDoPeriodo === criterio.PERIODO_DIAS,
    completo: pendentes === 0 && geral.semConferencia === 0,
    atingeMeta: geral.pctCaptura === null ? null : geral.pctCaptura >= criterio.META_PCT
  };
}

function paraResposta(r) {
  return {
    id: r.id,
    ativo: r.ativo,
    data: r.data,
    origem: r.origem,
    origemRotulo: criterio.ORIGENS[r.origem],
    titulo: r.titulo,
    detalhe: r.detalhe,
    relevante: r.relevante,
    captura: r.captura,
    capturaEvento: r.captura_evento,
    observacao: r.observacao,
    avaliadoEm: r.avaliado_em,
    janela: janelaDeCaptura(r.data)
  };
}

function criterioParaResposta() {
  return {
    versao: criterio.VERSAO,
    metaPct: criterio.META_PCT,
    periodoDias: criterio.PERIODO_DIAS,
    diasUteisCaptura: criterio.DIAS_UTEIS_CAPTURA,
    zMinimo: criterio.PRECO.zMinimo,
    janelaRetornos: criterio.PRECO.janelaRetornos,
    origens: criterio.ORIGENS,
    ativos: Object.fromEntries(Object.entries(criterio.ATIVOS).map(([codigo, a]) => [codigo, { futuro: a.futuro, relatorios: a.relatorios }]))
  };
}

// --- Os casos de uso ------------------------------------------------------------------------------------------------

function agruparPorTicker(linhas) {
  const porTicker = new Map();
  for (const linha of linhas) {
    const ticker = linha.series_code.split(".")[2];
    if (!porTicker.has(ticker)) porTicker.set(ticker, new Map());
    porTicker.get(ticker).set(String(linha.observed_at).slice(0, 10), Number(linha.value));
  }
  return porTicker;
}

// Os retornos do futuro do ativo, do histórico antes do período até o fim dele.
async function lerRetornos(ativo, { dataInicio, dataFim }, deps) {
  const repo = deps.observationRepository || observationRepository;
  const prefixo = criterio.ATIVOS[ativo].futuro;
  const tickers = (await repo.listarUltimasDatasItens({ prefixoSerie: prefixo, campoReferencia: "SETTLE" })).map((i) => i.codigo);
  if (tickers.length === 0) return [];
  const filtro = { asOf: deps.agora || new Date(), observadoDesde: somarDias(dataInicio, -DIAS_DE_HISTORICO_DO_PRECO), observadoAte: dataFim };
  const [ajustes, negociados] = await Promise.all([
    repo.buscarAsOf({ seriesCodes: tickers.map((t) => `${prefixo}.${t}.SETTLE`), ...filtro }),
    repo.buscarAsOf({ seriesCodes: tickers.map((t) => `${prefixo}.${t}.CONTRACTS`), ...filtro })
  ]);
  return retornosDoFuturo({ ajustes: agruparPorTicker(ajustes), negociados: agruparPorTicker(negociados) });
}

// POST /captura-eventos/candidatos: gera os candidatos do período e grava os novos (os que já existem ficam como estão,
// com a avaliação). -> { criados, gerados, porOrigem }.
async function gerarCandidatos({ ativo, dataInicio, dataFim } = {}, deps = {}) {
  const codigo = validarAtivo(ativo);
  const periodo = validarPeriodo({ dataInicio, dataFim });
  const obsRepo = deps.observationRepository || observationRepository;
  const geoRepo = deps.geopoliticaRepository || geopoliticaRepository;
  const [dias, retornos, eventos] = await Promise.all([
    obsRepo.listarDiasDePublicacao({ sourceCodes: criterio.ATIVOS[codigo].relatorios.map((r) => r.fonte), ...periodo }),
    lerRetornos(codigo, periodo, deps),
    geoRepo.listarEventosAceitosDoAtivo({ ativo: codigo, ...periodo })
  ]);
  const candidatos = [
    ...candidatosDoCalendario(codigo, dias),
    ...candidatosDoPreco(codigo, retornos, periodo),
    ...candidatosSecundarios(
      codigo,
      eventos.map((e) => ({ data: String(e.leitura.data_referencia).slice(0, 10), titulo: e.titulo, fontes: e.fontes }))
    )
  ];
  const criados = await (deps.eventoReferenciaRepository || eventoReferenciaRepository).inserirCandidatos(candidatos);
  const porOrigem = Object.fromEntries(Object.keys(criterio.ORIGENS).map((o) => [o, candidatos.filter((c) => c.origem === o).length]));
  return { criados, gerados: candidatos.length, porOrigem };
}

// GET /captura-eventos?ativo=&dataInicio=&dataFim=
async function listar({ ativo, dataInicio, dataFim } = {}, deps = {}) {
  const codigo = validarAtivo(ativo);
  const periodo = validarPeriodo({ dataInicio, dataFim });
  const registros = await (deps.eventoReferenciaRepository || eventoReferenciaRepository).listar({ ativo: codigo, ...periodo });
  const itens = registros.map(paraResposta);
  return { eventosReferencia: itens, resumo: resumir(itens, periodo), criterio: criterioParaResposta() };
}

function validarTitulo(titulo) {
  const texto = String(titulo || "").trim();
  if (!texto) throw new ValidationError('"titulo" é obrigatório.');
  if (texto.length > 300) throw new ValidationError('"titulo" tem no máximo 300 caracteres.');
  return texto;
}

function validarObservacao(observacao) {
  if (observacao === null || observacao === undefined || observacao === "") return null;
  const texto = String(observacao).trim();
  if (texto.length > 2000) throw new ValidationError('"observacao" tem no máximo 2000 caracteres.');
  return texto || null;
}

// POST /captura-eventos: um evento que os gatilhos não pegaram, adicionado à mão (já como relevante: quem o adiciona o
// julgou assim).
async function criarManual({ ativo, data, titulo, observacao } = {}, usuarioId, deps = {}) {
  const codigo = validarAtivo(ativo);
  validarData(data, "data");
  const registro = await (deps.eventoReferenciaRepository || eventoReferenciaRepository).criar({
    ativo: codigo,
    data,
    origem: "MANUAL",
    chave: `MANUAL:${crypto.randomUUID()}`,
    titulo: validarTitulo(titulo),
    detalhe: null,
    relevante: true,
    observacao: validarObservacao(observacao),
    avaliado_por: usuarioId,
    avaliado_em: deps.agora || new Date()
  });
  return { eventoReferencia: paraResposta(registro) };
}

// O evento da leitura que capturou o de referência, como cópia: { id, data, titulo }, com a data na janela.
function validarCapturaEvento(valor, janela) {
  if (valor === null || valor === undefined) return null;
  const { id, data, titulo } = valor;
  if (!id || !REGEX_DATA.test(String(data || "")) || !titulo) throw new ValidationError('"capturaEvento" deve ter id, data e titulo.');
  if (data < janela.inicio || data > janela.fim) {
    throw new ValidationError(`O evento que capturou deve ser de uma leitura de ${janela.inicio} a ${janela.fim} (até ${criterio.DIAS_UTEIS_CAPTURA} dias úteis depois).`);
  }
  return { id: String(id), data, titulo: String(titulo).slice(0, 300) };
}

// PATCH /captura-eventos/:id: a avaliação (só os campos enviados). Fora de relevante, a captura é apagada.
async function avaliar(id, campos = {}, usuarioId, deps = {}) {
  const repo = deps.eventoReferenciaRepository || eventoReferenciaRepository;
  const atual = REGEX_UUID.test(String(id)) ? await repo.buscarPorId(id) : null;
  if (!atual) throw new NotFoundError("Evento de referência não encontrado.");

  const mudanca = {};
  if ("relevante" in campos) {
    if (![true, false, null].includes(campos.relevante)) throw new ValidationError('"relevante" deve ser true, false ou null.');
    mudanca.relevante = campos.relevante;
  }
  if ("captura" in campos) {
    if (![null, "CAPTURADO", "NAO_CAPTURADO"].includes(campos.captura)) throw new ValidationError('"captura" deve ser CAPTURADO, NAO_CAPTURADO ou null.');
    mudanca.captura = campos.captura;
  }
  if ("capturaEvento" in campos) mudanca.captura_evento = validarCapturaEvento(campos.capturaEvento, janelaDeCaptura(atual.data));
  if ("observacao" in campos) mudanca.observacao = validarObservacao(campos.observacao);

  const relevante = "relevante" in mudanca ? mudanca.relevante : atual.relevante;
  const captura = "captura" in mudanca ? mudanca.captura : atual.captura;
  if (mudanca.captura && relevante !== true) throw new ValidationError("Só um evento relevante tem captura.");
  if (relevante !== true) Object.assign(mudanca, { captura: null, captura_evento: null });
  else if (captura !== "CAPTURADO") mudanca.captura_evento = null;

  const registro = await repo.atualizar(id, { ...mudanca, avaliado_por: usuarioId, avaliado_em: deps.agora || new Date() });
  return { eventoReferencia: paraResposta(registro) };
}

// DELETE /captura-eventos/:id: só o adicionado à mão (o gerado volta na próxima geração; para tirá-lo, "não relevante").
async function remover(id, deps = {}) {
  const repo = deps.eventoReferenciaRepository || eventoReferenciaRepository;
  const atual = REGEX_UUID.test(String(id)) ? await repo.buscarPorId(id) : null;
  if (!atual) throw new NotFoundError("Evento de referência não encontrado.");
  if (atual.origem !== "MANUAL") throw new ValidationError('Só o evento adicionado à mão pode ser removido; o gerado se marca como "não relevante".');
  await repo.remover(id);
}

module.exports = {
  gerarCandidatos,
  listar,
  criarManual,
  avaliar,
  remover,
  candidatosDoCalendario,
  candidatosDoPreco,
  candidatosSecundarios,
  retornosDoFuturo,
  resumir,
  janelaDeCaptura,
  somarDiasUteis
};
