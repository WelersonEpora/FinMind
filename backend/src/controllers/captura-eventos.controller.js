"use strict";

const capturaEventosService = require("../services/captura-eventos.service");

// O teste de captura dos eventos (ADR 0144). Quem avaliou vem do token (req.user.sub), nunca do corpo.
const responder = (fn, status = 200) =>
  async function handler(req, res, next) {
    try {
      const resultado = await fn(req);
      return resultado === undefined ? res.status(204).end() : res.status(status).json(resultado);
    } catch (err) {
      return next(err);
    }
  };

module.exports = {
  listar: responder((req) => capturaEventosService.listar(req.query)),
  gerarCandidatos: responder((req) => capturaEventosService.gerarCandidatos(req.body || {}), 201),
  criarManual: responder((req) => capturaEventosService.criarManual(req.body || {}, req.user.sub), 201),
  avaliar: responder((req) => capturaEventosService.avaliar(req.params.id, req.body || {}, req.user.sub)),
  remover: responder((req) => capturaEventosService.remover(req.params.id))
};
