"use strict";

const sequelize = require("../config/database");

const db = {};

db.User = require("./user")(sequelize);
db.SystemSetting = require("./systemSetting")(sequelize);
db.CollectionExecution = require("./collectionExecution")(sequelize);
db.MarketQuote = require("./marketQuote")(sequelize);

Object.values(db).forEach((model) => {
  if (model.associate) {
    model.associate(db);
  }
});

db.sequelize = sequelize;

module.exports = db;
