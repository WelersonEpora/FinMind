"use strict";

const dashboardService = require("../services/dashboard.service");

async function dashboard(_req, res, next) {
  try {
    return res.json(await dashboardService.getDashboardCards());
  } catch (err) {
    return next(err);
  }
}

module.exports = { dashboard };
