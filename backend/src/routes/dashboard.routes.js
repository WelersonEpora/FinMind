"use strict";

const { Router } = require("express");
const dashboardController = require("../controllers/dashboard.controller");
const requireAuth = require("../shared/middlewares/require-auth");

const router = Router();

router.get("/dashboard", requireAuth, dashboardController.dashboard);

module.exports = router;
