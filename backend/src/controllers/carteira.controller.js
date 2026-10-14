"use strict";

const carteiraService = require("../services/carteira.service");
const painelCarteiraService = require("../services/painel-carteira.service");
const diarioCarteiraService = require("../services/diario-carteira.service");
const medicaoCarteiraService = require("../services/medicao-carteira.service");

// Carteiras virtuais (ADR 0127). O espaço vem de req.workspaceMember (vínculo conferido no banco por
// requireWorkspaceMember), nunca do corpo da requisição.
const responder = (fn, status = 200) =>
  async function handler(req, res, next) {
    try {
      return res.status(status).json(await fn(req));
    } catch (err) {
      return next(err);
    }
  };

const espaco = (req) => req.workspaceMember.workspaceId;

module.exports = {
  opcoes: responder(() => painelCarteiraService.obterOpcoes()),
  listar: responder((req) => carteiraService.listarCarteiras(espaco(req))),
  criar: responder((req) => carteiraService.criarCarteira(espaco(req), req.user.sub, req.body || {}), 201),
  obter: responder((req) => carteiraService.obterCarteira(espaco(req), req.params.carteiraId)),
  registrarVersao: responder((req) => carteiraService.registrarVersaoDeParametros(espaco(req), req.params.carteiraId, req.user.sub, req.body || {}), 201),
  painel: responder((req) => painelCarteiraService.obterPainel(espaco(req), req.params.carteiraId)),
  rodadas: responder((req) => painelCarteiraService.listarRodadas(espaco(req), req.params.carteiraId)),
  posicoes: responder((req) => painelCarteiraService.listarPosicoes(espaco(req), req.params.carteiraId)),
  operacoes: responder((req) => painelCarteiraService.listarOperacoes(espaco(req), req.params.carteiraId)),
  recomendacoes: responder((req) => painelCarteiraService.listarRecomendacoes(espaco(req), req.params.carteiraId)),
  recomendacao: responder((req) => painelCarteiraService.obterRecomendacao(espaco(req), req.params.carteiraId, req.params.recomendacaoId)),
  medicao: responder((req) => medicaoCarteiraService.obterMedicao(espaco(req), req.params.carteiraId)),
  diario: responder((req) => diarioCarteiraService.obterDiario(espaco(req), req.params.carteiraId)),
  conferirEntrada: responder((req) => diarioCarteiraService.conferirEntrada(espaco(req), req.params.carteiraId, req.body || {})),
  registrarEntrada: responder((req) => diarioCarteiraService.registrarEntrada(espaco(req), req.params.carteiraId, req.user.sub, req.body || {}), 201),
  editarEntrada: responder((req) => diarioCarteiraService.editarEntrada(espaco(req), req.params.carteiraId, req.params.ordemId, req.user.sub, req.body || {})),
  cancelarOrdem: responder((req) => diarioCarteiraService.cancelarOrdem(espaco(req), req.params.carteiraId, req.params.ordemId, req.user.sub)),
  registrarSaida: responder((req) => diarioCarteiraService.registrarSaida(espaco(req), req.params.carteiraId, req.params.posicaoId, req.user.sub, req.body || {}), 201),
  moverStop: responder((req) => diarioCarteiraService.moverStop(espaco(req), req.params.carteiraId, req.params.posicaoId, req.user.sub, req.body || {}), 201)
};
