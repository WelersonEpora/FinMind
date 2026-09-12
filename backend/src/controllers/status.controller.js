"use strict";

const statusService = require("../services/status.service");

async function health(_req, res) {
  res.json({ status: "ok" });
}

async function status(_req, res, next) {
  try {
    const data = await statusService.getStatus();
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

module.exports = { health, status };
