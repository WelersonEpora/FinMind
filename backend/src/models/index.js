"use strict";

const sequelize = require("../config/database");

const db = {};

db.User = require("./user")(sequelize);
db.SystemSetting = require("./systemSetting")(sequelize);
db.CollectionExecution = require("./collectionExecution")(sequelize);
db.MarketQuote = require("./marketQuote")(sequelize);
db.Observation = require("./observation")(sequelize);
db.Workspace = require("./workspace")(sequelize);
db.WorkspaceMember = require("./workspaceMember")(sequelize);
db.GeopoliticaLeitura = require("./geopoliticaLeitura")(sequelize);
db.GeopoliticaEvento = require("./geopoliticaEvento")(sequelize);
db.FatorParametroVersao = require("./fatorParametroVersao")(sequelize);
db.AnaliseDiaria = require("./analiseDiaria")(sequelize);

Object.values(db).forEach((model) => {
  if (model.associate) {
    model.associate(db);
  }
});

db.sequelize = sequelize;

module.exports = db;
