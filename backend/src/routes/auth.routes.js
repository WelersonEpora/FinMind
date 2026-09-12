"use strict";

const { Router } = require("express");
const authController = require("../controllers/auth.controller");
const requireAuth = require("../shared/middlewares/require-auth");
const { criarLimitadorDeRequisicoes } = require("../shared/middlewares/rate-limit");

const router = Router();

const limitarLogin = criarLimitadorDeRequisicoes({
  janelaMs: 60_000,
  maxRequisicoes: 10,
  mensagem: "Muitas tentativas de login. Aguarde um minuto e tente novamente."
});

router.post("/login", limitarLogin, authController.login);
router.post("/logout", authController.logout);
router.get("/me", requireAuth, authController.me);

module.exports = router;
