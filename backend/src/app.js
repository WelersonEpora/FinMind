const express = require("express");
const cookieParser = require("cookie-parser");
const routes = require("./routes");
const statusController = require("./controllers/status.controller");
const requestLogger = require("./shared/middlewares/request-logger");
const notFoundHandler = require("./shared/middlewares/not-found-handler");
const errorHandler = require("./shared/middlewares/error-handler");

const app = express();

app.disable("x-powered-by");

app.use(requestLogger);
app.use(express.json());
app.use(cookieParser());

// Fora do prefixo /api/v1 por não ser um recurso de domínio - mesmo
// critério usado no AgroMind.
app.get("/health", statusController.health);

app.use("/", routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
