"use strict";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry simples com atraso fixo, usado só na fase de download de um
// coletor (falha transitória de rede/timeout) - nunca em parse/normalize/
// persist, onde um erro é de dado ou de programação, não de comunicação.
async function withRetry(fn, { tentativas = 3, delayMs = 500 } = {}) {
  let ultimoErro;

  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;
      if (tentativa < tentativas) {
        await sleep(delayMs);
      }
    }
  }

  throw ultimoErro;
}

module.exports = { withRetry };
