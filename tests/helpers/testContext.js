'use strict';

/**
 * Utilidades compartidas por las pruebas de integracion.
 * Todas trabajan contra la base AISLADA definida en .env.test (northwind_test).
 */

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const request = require('supertest');

const config = require('../../src/config/env');

if (!config.isTest || !/_test$/i.test(config.db.database)) {
  throw new Error(
    `Las pruebas requieren NODE_ENV=test y una base terminada en _test. Actual: ${config.db.database}`
  );
}

const app = require('../../src/app');
const { pool, closePool } = require('../../src/config/db');

const SEED_SQL = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'migrations', 'testdb', '002_test_seed.sql'),
  'utf8'
);

/** Restablece los datos semilla. No reinicia la secuencia de order_id. */
async function resetDatabase() {
  await pool.query(SEED_SQL);
}

function api() {
  return request(app);
}

async function getStock(productId) {
  const { rows } = await pool.query(
    'SELECT units_in_stock FROM public.products WHERE product_id = $1',
    [productId]
  );
  return rows[0] ? rows[0].units_in_stock : null;
}

async function countRows(table) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS total FROM public.${table}`);
  return rows[0].total;
}

const validOrder = (overrides = {}) => ({
  customer_id: 'ALFKI',
  employee_id: 5,
  order_date: '2026-09-09',
  required_date: '2026-09-16',
  ship_via: 2,
  freight: 5.5,
  ship_name: 'Alfreds Futterkiste',
  ship_city: 'Berlin',
  ship_country: 'Germany',
  items: [
    { product_id: 1, quantity: 2, discount: 0 },
    { product_id: 3, quantity: 1, discount: 0.1 }
  ],
  ...overrides
});

/** Verifica la envoltura de error uniforme. */
function assertErrorShape(body, expectedCode) {
  assert.equal(body.success, false, 'success debe ser false');
  assert.equal(typeof body.message, 'string');
  assert.ok(body.error, 'debe incluir el objeto error');
  assert.equal(body.error.code, expectedCode);
  assert.equal(body.data, undefined, 'una respuesta de error no debe incluir data');
}

module.exports = {
  api,
  app,
  pool,
  closePool,
  resetDatabase,
  getStock,
  countRows,
  validOrder,
  assertErrorShape
};
