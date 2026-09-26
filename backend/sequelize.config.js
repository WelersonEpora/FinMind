require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const { lerConfigBanco } = require("./src/config/db-env");

const { dialect, host, port, database, username, password } = lerConfigBanco();

const common = {
  dialect,
  host,
  port,
  database,
  username,
  password,
  migrationStorageTableName: "sequelize_meta",
  seederStorage: "sequelize",
  seederStorageTableName: "sequelize_data"
};

module.exports = {
  development: common,
  test: {
    ...common,
    database: (dialect === "postgres" ? process.env.POSTGRES_DATABASE_TEST : process.env.MARIADB_DATABASE_TEST) || "finmind_test"
  },
  production: common
};
