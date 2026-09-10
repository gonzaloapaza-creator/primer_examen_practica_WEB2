'use strict';

/**
 * Ejecuta las migraciones SQL de migrations/ (no las de migrations/testdb).
 * Uso: npm run db:migrate
 *
 * Cada archivo .sql maneja su propia transaccion (BEGIN/COMMIT) y es idempotente.
 * Los mensajes RAISE NOTICE del servidor se muestran en consola.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../src/config/env');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

async function main() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    console.log('[migrate] no hay archivos .sql en migrations/');
    return;
  }

  const client = new Client({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    ssl: config.db.ssl ? { rejectUnauthorized: true } : false,
    application_name: 'northwind-orders-migrate'
  });

  client.on('notice', (notice) => {
    console.log(`   [postgres ${notice.severity}] ${notice.message}`);
  });

  await client.connect();
  console.log(`[migrate] base de datos: ${config.db.database} (${config.db.host}:${config.db.port})`);

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] ejecutando ${file} ...`);
      await client.query(sql);
      console.log(`[migrate] ${file} OK`);
    }
    console.log('[migrate] todas las migraciones se aplicaron correctamente');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[migrate] fallo la migracion:', error.message);
  if (error.hint) console.error('[migrate] sugerencia:', error.hint);
  process.exitCode = 1;
});
