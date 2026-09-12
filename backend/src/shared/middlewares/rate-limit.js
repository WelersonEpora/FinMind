"use strict";

const { TooManyRequestsError } = require("../errors");

// Limitador em memória, por IP, janela fixa - suficiente para uma instância
// única sem réplicas/Redis (ver docs/decisoes-tecnicas.md - "sem padrão
// arquitetural sem necessidade comprovada"). Usado hoje só no login, para
// dificultar força bruta de senha.
function criarLimitadorDeRequisicoes({ janelaMs, maxRequisicoes, mensagem }) {
  const registros = new Map(); // chave (req.ip) -> { contagem, iniciaEm }

  return function limitarRequisicoes(req, _res, next) {
    const chave = req.ip;
    const agora = Date.now();
    const registro = registros.get(chave);

    if (!registro || agora - registro.iniciaEm >= janelaMs) {
      registros.set(chave, { contagem: 1, iniciaEm: agora });
      return next();
    }

    if (registro.contagem >= maxRequisicoes) {
      const tentarNovamenteEmMs = registro.iniciaEm + janelaMs - agora;
      return next(new TooManyRequestsError(mensagem, { tentarNovamenteEmMs }));
    }

    registro.contagem += 1;
    return next();
  };
}

module.exports = { criarLimitadorDeRequisicoes };
