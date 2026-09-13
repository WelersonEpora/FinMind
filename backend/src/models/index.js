"use strict";

const sequelize = require("../config/database");

const db = {};

db.User = require("./user")(sequelize);
db.SystemSetting = require("./systemSetting")(sequelize);

Object.values(db).forEach((model) => {
  if (model.associate) {
    model.associate(db);
  }
});

db.sequelize = sequelize;

module.exports = db;
