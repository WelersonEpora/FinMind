"use strict";

const { Router } = require("express");
const authRoutes = require("./auth.routes");
const statusRoutes = require("./status.routes");
const dashboardRoutes = require("./dashboard.routes");
const userRoutes = require("./user.routes");

const router = Router();

router.use("/api/v1/auth", authRoutes);
router.use("/api/v1", statusRoutes);
router.use("/api/v1", dashboardRoutes);
router.use("/api/v1", userRoutes);

module.exports = router;
