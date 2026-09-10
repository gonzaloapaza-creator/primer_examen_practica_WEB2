'use strict';

const app = require('./app');
const config = require('./config/env');
const { pool, closePool } = require('./config/db');

let server;
let shuttingDown = false;

async function verifyDatabaseConnection() {
  const result = await pool.query('SELECT current_database() AS db, version() AS version');
  const row = result.rows[0];
  console.log(`[startup] conectado a la base "${row.db}"`);
  console.log(`[startup] ${row.version.split(',')[0]}`);
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] senal ${signal} recibida: cerrando servidor...`);

  const forceExit = setTimeout(() => {
    console.error('[shutdown] cierre forzado tras 10s');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('[shutdown] servidor HTTP cerrado');
    }
    await closePool();
    console.log('[shutdown] pool de PostgreSQL cerrado');
    process.exit(0);
  } catch (error) {
    console.error('[shutdown] error al cerrar:', error.message);
    process.exit(1);
  }
}

async function start() {
  try {
    // El servidor NO ejecuta migraciones ni cambios de esquema automaticamente.
    await verifyDatabaseConnection();
  } catch (error) {
    console.error('[startup] no se pudo conectar a PostgreSQL:', error.message);
    console.error('[startup] revise las variables DB_* de su archivo .env');
    process.exit(1);
  }

  server = app.listen(config.port, () => {
    console.log(`[startup] API escuchando en http://localhost:${config.port} (${config.nodeEnv})`);
  });

  server.on('error', (error) => {
    console.error('[startup] error del servidor HTTP:', error.message);
    process.exit(1);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] promesa rechazada sin manejar:', reason instanceof Error ? reason.message : reason);
  shutdown('unhandledRejection');
});
process.on('uncaughtException', (error) => {
  console.error('[fatal] excepcion no capturada:', error.message);
  shutdown('uncaughtException');
});

start();
