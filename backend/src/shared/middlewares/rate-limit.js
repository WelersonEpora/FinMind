"use strict";

const { TooManyRequestsError } = require("../errors");

// Limitador em memória, por IP, janela fixa - suficiente para uma instância
// única sem réplicas/Redis (ver docs/decisoes-tecnicas.md - "sem padrão
// arquitetural sem necessidade comprovada"). Usado hoje só no login, para
// dificultar força bruta de senha.
// `chave` decide quem é contado - por padrão o IP; rotas autenticadas que
// precisam de limite por usuário (ex.: adicionar membro, que não pode virar
// um meio de testar e-mails em massa) passam `(req) => req.user.sub`.
function criarLimitadorDeRequisicoes({ janelaMs, maxRequisicoes, mensagem, chave = (req) => req.ip }) {
  const registros = new Map(); // chave (IP ou usuário) -> { contagem, iniciaEm }

  return function limitarRequisicoes(req, _res, next) {
    const idDoChamador = chave(req);
    const agora = Date.now();
    const registro = registros.get(idDoChamador);

    if (!registro || agora - registro.iniciaEm >= janelaMs) {
      registros.set(idDoChamador, { contagem: 1, iniciaEm: agora });
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
