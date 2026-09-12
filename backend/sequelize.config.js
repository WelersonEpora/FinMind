require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const common = {
  dialect: "mysql",
  host: process.env.MARIADB_HOST,
  port: Number(process.env.MARIADB_PORT || 3306),
  database: process.env.MARIADB_DATABASE,
  username: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  migrationStorageTableName: "sequelize_meta",
  seederStorage: "sequelize",
  seederStorageTableName: "sequelize_data"
};

module.exports = {
  development: common,
  test: {
    ...common,
    database: process.env.MARIADB_DATABASE_TEST || "finmind_test"
  },
  production: common
};
