"use strict";

const { Router } = require("express");
const userController = require("../controllers/user.controller");
const requireAuth = require("../shared/middlewares/require-auth");
const requireRole = require("../shared/middlewares/require-role");

const router = Router();

// Sem cadastro público de propósito - só um owner autenticado provisiona
// e edita outros usuários (mesmo critério do Personal-Assistant). Um
// colaborador só edita o próprio perfil, via /users/me (nunca papel/status/
// e-mail por ali - ver user.service.js updateOwnProfile). Precisa vir ANTES
// de /users/:id, senão "me" seria interpretado como :id.
router.patch("/users/me", requireAuth, userController.updateMe);

router.get("/users", requireAuth, requireRole("owner"), userController.list);
router.post("/users", requireAuth, requireRole("owner"), userController.create);
router.patch("/users/:id", requireAuth, requireRole("owner"), userController.update);

module.exports = router;
