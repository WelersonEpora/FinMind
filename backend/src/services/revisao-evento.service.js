"use strict";

const geopoliticaRepository = require("../repositories/geopolitica.repository");
const revisaoEventoRepository = require("../repositories/revisao-evento.repository");
const { ValidationError, NotFoundError } = require("../shared/errors");

// A revisão imediata com evento de magnitude 3 (§6 da análise do café de 2026-10-19; aprovada pelo Comitê em 2026-10-22;
// ADR 0149). A magnitude 3 do documento é o grau ALTA da leitura diária de eventos (BAIXA, MEDIA e ALTA, a escala de três
// níveis do FinMind): cada evento ACEITO de grau ALTA do ativo pede a revisão de uma pessoa (os fatores e as regras diante
// do fato). Os pendentes são calculados dos eventos; a tabela guarda só a revisão feita. Só o café: a regra veio da
// análise do café.

const ATIVOS = Object.freeze(["CAFE"]);
// Desde a decisão do Comitê: os eventos de antes não pedem revisão.
const DESDE = "2026-10-22";
const GRAU = "ALTA";

const hojeIso = () => new Date().toISOString().slice(0, 10);
const dataDoEvento = (e) => String(e.leitura?.data_referencia ?? e.data_referencia).slice(0, 10);
// A chave natural do evento: a leitura do dia pode ser refeita e trocar os ids.
const chaveDoEvento = (ativo, data, titulo) => `${ativo}|${data}|${String(titulo).trim()}`;

function validarAtivo(ativo) {
  if (!ATIVOS.includes(ativo)) throw new ValidationError(`A revisão de eventos vale só para ${ATIVOS.join(", ")}.`);
}

async function eventosDeMagnitude3(ativo, deps) {
  const repo = deps.geopoliticaRepository || geopoliticaRepository;
  const eventos = await repo.listarEventosAceitosDoAtivo({ ativo, dataInicio: DESDE, dataFim: deps.hoje || hojeIso() });
  return eventos
    .filter((e) => e.intensidade === GRAU)
    .map((e) => {
      const data = dataDoEvento(e);
      return {
        chave: chaveDoEvento(ativo, data, e.titulo),
        ativo,
        data,
        titulo: e.titulo,
        tipo: e.tipo,
        fator: e.fator,
        pressao: e.pressao,
        intensidade: e.intensidade,
        confianca: e.confianca,
        resumo: e.resumo,
        fontes: e.fontes
      };
    });
}

// -> { revisoes: { ativo, desde, eventos: [{ ...evento, revisao: { observacao, revisadoPor, revisadoEm } | null }], pendentes } }
async function listar({ ativo = "CAFE" } = {}, deps = {}) {
  validarAtivo(ativo);
  const repo = deps.revisaoEventoRepository || revisaoEventoRepository;
  const eventos = await eventosDeMagnitude3(ativo, deps);
  const feitas = new Map((await repo.listarPorChaves(eventos.map((e) => e.chave))).map((r) => [r.chave, r]));
  const comRevisao = eventos.map((e) => {
    const r = feitas.get(e.chave);
    return { ...e, revisao: r ? { observacao: r.observacao, revisadoPor: r.revisado_por, revisadoEm: r.revisado_em } : null };
  });
  return { revisoes: { ativo, desde: DESDE, eventos: comRevisao, pendentes: comRevisao.filter((e) => !e.revisao).length } };
}

// Marca um evento como revisado. `chave`: a do evento (listar). Revisar de novo é recusado: desfaça antes.
async function revisar({ chave, observacao = null }, usuarioId, deps = {}) {
  const ativo = String(chave || "").split("|")[0];
  validarAtivo(ativo);
  const evento = (await eventosDeMagnitude3(ativo, deps)).find((e) => e.chave === chave);
  if (!evento) throw new NotFoundError("Evento de magnitude 3 não encontrado (a leitura do dia pode ter sido refeita).");
  const repo = deps.revisaoEventoRepository || revisaoEventoRepository;
  if (await repo.buscarPorChave(chave)) throw new ValidationError("Este evento já foi revisado.");
  const texto = observacao === null || observacao === undefined ? null : String(observacao).trim().slice(0, 2000) || null;
  await repo.criar({ ativo, data: evento.data, chave, evento, observacao: texto, revisado_por: usuarioId, revisado_em: new Date() });
  return listar({ ativo }, deps);
}

async function desfazer({ chave }, deps = {}) {
  const ativo = String(chave || "").split("|")[0];
  validarAtivo(ativo);
  await (deps.revisaoEventoRepository || revisaoEventoRepository).remover(chave);
  return listar({ ativo }, deps);
}

module.exports = { ATIVOS, DESDE, chaveDoEvento, listar, revisar, desfazer };
