"use strict";

const dashboardService = require("../services/dashboard.service");

function dashboard(_req, res) {
  res.json(dashboardService.getDashboardCards());
}

module.exports = { dashboard };
