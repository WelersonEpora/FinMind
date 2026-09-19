"use strict";

const { Router } = require("express");
const multer = require("multer");
const userController = require("../controllers/user.controller");
const requireAuth = require("../shared/middlewares/require-auth");
const requireRole = require("../shared/middlewares/require-role");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

// Sem cadastro público de propósito - só um admin autenticado provisiona
// e edita outros usuários (mesmo critério do Personal-Assistant). Um
// usuário comum só edita o próprio perfil, via /users/me (nunca papel/status/
// e-mail por ali - ver user.service.js updateOwnProfile). Rotas /me
// precisam vir ANTES de /users/:id, senão "me" seria interpretado como :id.
router.patch("/users/me", requireAuth, userController.updateMe);
router.post("/users/me/photo", requireAuth, upload.single("photo"), userController.uploadMyPhoto);
router.delete("/users/me/photo", requireAuth, userController.removeMyPhoto);

router.get("/users", requireAuth, requireRole("admin"), userController.list);
router.post("/users", requireAuth, requireRole("admin"), userController.create);
router.patch("/users/:id", requireAuth, requireRole("admin"), userController.update);
router.post("/users/:id/photo", requireAuth, requireRole("admin"), upload.single("photo"), userController.uploadUserPhoto);
router.delete("/users/:id/photo", requireAuth, requireRole("admin"), userController.removeUserPhoto);

// Ver a foto de qualquer usuário não precisa ser admin - só autenticado
// (é o mesmo tipo de dado que já aparece em listas/avatares pra todo mundo).
router.get("/users/:id/photo", requireAuth, userController.streamPhoto);

module.exports = router;
