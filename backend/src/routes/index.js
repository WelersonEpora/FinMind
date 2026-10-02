"use strict";

const { Router } = require("express");
const authRoutes = require("./auth.routes");
const statusRoutes = require("./status.routes");
const centroDecisaoRoutes = require("./centro-decisao.routes");
const userRoutes = require("./user.routes");
const observaveisRoutes = require("./observaveis.routes");
const coletasRoutes = require("./coletas.routes");
const workspaceRoutes = require("./workspace.routes");
const statusProjetoRoutes = require("./status-projeto.routes");
const documentosProjetoRoutes = require("./documentos-projeto.routes");
const geopoliticaRoutes = require("./geopolitica.routes");

const router = Router();

router.use("/api/v1/auth", authRoutes);
router.use("/api/v1", statusRoutes);
router.use("/api/v1", centroDecisaoRoutes);
router.use("/api/v1", userRoutes);
router.use("/api/v1", observaveisRoutes);
router.use("/api/v1", coletasRoutes);
router.use("/api/v1", workspaceRoutes);
router.use("/api/v1", statusProjetoRoutes);
router.use("/api/v1", documentosProjetoRoutes);
router.use("/api/v1", geopoliticaRoutes);

module.exports = router;
