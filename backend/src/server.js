const app = require("./app");
const env = require("./config/env");

app.listen(env.appPort, () => {
  // Log simples para facilitar diagnóstico no ambiente local.
  console.log(`FinMind backend running on port ${env.appPort}`);
});
