require("dotenv").config();
const { loadConfig, safeConfigSummary } = require("./src/config");
const { createLogger } = require("./src/logger");
const { createDatabase } = require("./src/db");
const { createApp } = require("./src/app");

function start() {
  const logger = createLogger(console);
  const config = loadConfig(process.env);
  const summary = safeConfigSummary(config);

  logger.info(`[config] ${summary.mode} mode`);
  logger.info(`[config] SSO server: ${summary.ssoServer}`);
  logger.info(`[config] Client ID: ${summary.clientId}`);
  logger.info(`[config] Callback: ${summary.callback}`);
  logger.info(`[config] Request origin: ${summary.requestOrigin}`);
  logger.info(`[config] Success redirect: ${summary.successRedirect}`);
  logger.info(`[config] JWKS: ${summary.jwks}`);

  const db = createDatabase({ dbPath: config.dbPath, seed: true });
  const app = createApp({ config, db, logger });
  const server = app.listen(config.port, () => {
    logger.info(`EduVerify PNG backend listening on :${config.port} (${summary.mode} mode)`);
  });

  const shutdown = (signal) => {
    logger.info(`[shutdown] ${signal}`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  return { app, server, db, config };
}

if (require.main === module) {
  try {
    start();
  } catch (error) {
    console.error(`[startup] ${error.code || "ERROR"}: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { start };
