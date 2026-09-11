'use strict';

/**
 * Crea/prepara la base de pruebas AISLADA definida en .env.test.
 * Uso: npm run test:db:setup
 *
 * Proteccion: se niega a trabajar si DB_NAME no termina en "_test".
 * Nunca toca la base de trabajo del usuario (northwind).
 *
 * Pasos:
 *   1. CREATE DATABASE <db>_test si no existe (conectando a MAINTENANCE_DB).
 *   2. migrations/testdb/001_test_schema.sql  (esquema compatible + trigger)
 *   3. migrations/testdb/002_test_seed.sql    (datos semilla con casos borde)
 *   4. migrations/001_orders_order_id_sequence.sql (la MISMA migracion real)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../src/config/env');

const ROOT = path.resolve(__dirname, '..');

if (!/_test$/i.test(config.db.database)) {
  console.error(
    `[test-db] ABORTADO: la base "${config.db.database}" no termina en "_test". ` +
      'Configure .env.test con una base de pruebas dedicada.'
  );
  process.exit(1);
}

function baseClientOptions(database) {
  return {
    host: config.db.host,
    port: config.db.port,
    database,
    user: config.db.user,
    password: config.db.password,
    ssl: config.db.ssl ? { rejectUnauthorized: true } : false,
    application_name: 'northwind-orders-test-setup'
  };
}

async function ensureDatabaseExists() {
  const client = new Client(baseClientOptions(config.maintenanceDatabase));
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      config.db.database
    ]);
    if (exists.rowCount > 0) {
      console.log(`[test-db] la base "${config.db.database}" ya existe`);
      return;
    }
    // El nombre ya fue validado contra /_test$/ y se cita con formato de identificador.
    const quoted = `"${config.db.database.replace(/"/g, '""')}"`;
    await client.query(`CREATE DATABASE ${quoted}`);
    console.log(`[test-db] base "${config.db.database}" creada`);
  } finally {
    await client.end();
  }
}

async function runSqlFiles(files) {
  const client = new Client(baseClientOptions(config.db.database));
  client.on('notice', (notice) => console.log(`   [postgres ${notice.severity}] ${notice.message}`));
  await client.connect();
  try {
    for (const relativePath of files) {
      const sql = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
      console.log(`[test-db] ejecutando ${relativePath} ...`);
      await client.query(sql);
      console.log(`[test-db] ${relativePath} OK`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  await ensureDatabaseExists();
  await runSqlFiles([
    path.join('migrations', 'testdb', '001_test_schema.sql'),
    path.join('migrations', 'testdb', '002_test_seed.sql'),
    path.join('migrations', '001_orders_order_id_sequence.sql')
  ]);
  console.log(`[test-db] base de pruebas "${config.db.database}" lista`);
}

main().catch((error) => {
  console.error('[test-db] fallo la preparacion:', error.message);
  process.exitCode = 1;
});
