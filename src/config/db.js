'use strict';

const fs = require('fs');
const { Pool, types } = require('pg');
const config = require('./env');

// PostgreSQL DATE (OID 1082) se devuelve tal cual llega ("YYYY-MM-DD").
// Sin esto, el driver construye un Date en zona local y la fecha puede
// desplazarse un dia al serializar a JSON.
types.setTypeParser(1082, (value) => value);

function buildSslConfig() {
  if (!config.db.ssl) return false;
  // La verificacion de certificado permanece activa a proposito.
  const ssl = { rejectUnauthorized: true };
  if (config.db.sslCaPath) {
    ssl.ca = fs.readFileSync(config.db.sslCaPath, 'utf8');
  }
  return ssl;
}

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
  ssl: buildSslConfig(),
  application_name: 'northwind-orders-api'
});

// Un error en un cliente inactivo no debe tumbar el proceso.
pool.on('error', (error) => {
  // Solo el mensaje: nunca la cadena de conexion ni la contrasena.
  console.error('[db] error en cliente inactivo del pool:', error.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Ejecuta una funcion dentro de una unica transaccion sobre una unica conexion.
 * Toda consulta del callback debe usar el client recibido.
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const result = await callback(client);
    await client.query('COMMIT');
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[db] fallo el ROLLBACK:', rollbackError.message);
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, withTransaction, closePool };
