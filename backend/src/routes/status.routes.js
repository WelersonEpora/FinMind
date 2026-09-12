"use strict";

const { Router } = require("express");
const statusController = require("../controllers/status.controller");
const requireAuth = require("../shared/middlewares/require-auth");

const router = Router();

router.get("/status", requireAuth, statusController.status);

module.exports = router;
