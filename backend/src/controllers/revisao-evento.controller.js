"use strict";

const revisaoEventoService = require("../services/revisao-evento.service");

// A revisão dos eventos de magnitude 3 (ADR 0149). Quem revisou vem do token (req.user.sub), nunca do corpo.
const responder = (fn, status = 200) =>
  async function handler(req, res, next) {
    try {
      return res.status(status).json(await fn(req));
    } catch (err) {
      return next(err);
    }
  };

module.exports = {
  listar: responder((req) => revisaoEventoService.listar(req.query)),
  revisar: responder((req) => revisaoEventoService.revisar(req.body || {}, req.user.sub), 201),
  desfazer: responder((req) => revisaoEventoService.desfazer(req.body || {}))
};
