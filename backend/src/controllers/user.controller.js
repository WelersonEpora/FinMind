"use strict";

const userService = require("../services/user.service");

async function list(_req, res, next) {
  try {
    const users = await userService.listUsers();
    return res.json({ users });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    const user = await userService.createUser(req.body || {});
    return res.status(201).json({ user });
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const user = await userService.updateUser(req.params.id, req.body || {});
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    const user = await userService.updateOwnProfile(req.user.sub, req.body || {});
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, create, update, updateMe };
