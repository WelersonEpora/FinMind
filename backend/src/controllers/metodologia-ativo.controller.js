"use strict";

const metodologiaAtivoService = require("../services/metodologia-ativo.service");

async function detalhar(req, res, next) {
  try {
    return res.json(metodologiaAtivoService.obterMetodologiaAtivo(req.params.ativo));
  } catch (err) {
    return next(err);
  }
}

async function calcularFator(req, res, next) {
  try {
    return res.json(await metodologiaAtivoService.calcularFator(req.params.ativo, req.params.fator, { ...req.query }));
  } catch (err) {
    return next(err);
  }
}

async function obterEventosFator(req, res, next) {
  try {
    return res.json(await metodologiaAtivoService.obterEventosFator(req.params.ativo, req.params.fator));
  } catch (err) {
    return next(err);
  }
}

async function listarParametros(req, res, next) {
  try {
    return res.json(await metodologiaAtivoService.listarParametros(req.params.ativo, req.params.fator));
  } catch (err) {
    return next(err);
  }
}

async function salvarParametros(req, res, next) {
  try {
    const resultado = await metodologiaAtivoService.salvarParametros(req.params.ativo, req.params.fator, req.body || {}, req.user.sub);
    return res.status(201).json(resultado);
  } catch (err) {
    return next(err);
  }
}

module.exports = { detalhar, calcularFator, obterEventosFator, listarParametros, salvarParametros };
