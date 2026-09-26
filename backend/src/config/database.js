const { Sequelize } = require("sequelize");
const env = require("./env");

const sequelize = new Sequelize(env.db.database, env.db.username, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: env.db.dialect,
  logging: false
});

module.exports = sequelize;
