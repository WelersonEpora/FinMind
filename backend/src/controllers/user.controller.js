"use strict";

const userService = require("../services/user.service");
const { ValidationError } = require("../shared/errors");

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

function requireFile(req) {
  if (!req.file) {
    throw new ValidationError('Envie a foto no campo "photo".');
  }
  return req.file;
}

async function uploadMyPhoto(req, res, next) {
  try {
    const file = requireFile(req);
    const user = await userService.setPhoto(req.user.sub, { buffer: file.buffer, mimeType: file.mimetype });
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

async function removeMyPhoto(req, res, next) {
  try {
    const user = await userService.removePhoto(req.user.sub);
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

async function uploadUserPhoto(req, res, next) {
  try {
    const file = requireFile(req);
    const user = await userService.setPhoto(req.params.id, { buffer: file.buffer, mimeType: file.mimetype });
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

async function removeUserPhoto(req, res, next) {
  try {
    const user = await userService.removePhoto(req.params.id);
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

async function streamPhoto(req, res, next) {
  try {
    const { buffer, mimeType } = await userService.getPhoto(req.params.id);
    res.set("Content-Type", mimeType);
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  list,
  create,
  update,
  updateMe,
  uploadMyPhoto,
  removeMyPhoto,
  uploadUserPhoto,
  removeUserPhoto,
  streamPhoto
};
