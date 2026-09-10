'use strict';

const { query } = require('../config/db');

// Regla de "apto para vender" (decision de implementacion de este proyecto):
//   discontinued = 0
//   units_in_stock IS NOT NULL AND units_in_stock > 0   (NULL nunca es disponibilidad)
//   unit_price IS NOT NULL AND unit_price >= 0
const AVAILABILITY_SQL = `
  p.discontinued = 0
  AND p.units_in_stock IS NOT NULL AND p.units_in_stock > 0
  AND p.unit_price IS NOT NULL AND p.unit_price >= 0`;

const SELECT_COLUMNS = `
  p.product_id,
  p.product_name,
  p.unit_price,
  p.units_in_stock,
  p.quantity_per_unit,
  p.discontinued,
  (${AVAILABILITY_SQL}) AS available`;

async function list({ q, limit, offset, includeUnavailable }) {
  const filters = [];
  const params = [];

  if (!includeUnavailable) filters.push(`(${AVAILABILITY_SQL})`);

  if (q) {
    params.push(`%${q}%`);
    filters.push(`p.product_name ILIKE $${params.length}`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM public.products p ${where}`,
    params
  );

  params.push(limit, offset);
  const rowsResult = await query(
    `SELECT ${SELECT_COLUMNS}
       FROM public.products p
       ${where}
      ORDER BY p.product_name ASC, p.product_id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { rows: rowsResult.rows, total: countResult.rows[0].total };
}

/**
 * Bloquea un producto para actualizacion dentro de una transaccion.
 * El llamador DEBE invocarlo en orden ascendente de product_id para evitar
 * deadlocks entre solicitudes concurrentes.
 * @param {import('pg').PoolClient} client conexion de la transaccion
 */
async function findByIdForUpdate(client, productId) {
  const result = await client.query(
    `SELECT product_id, product_name, unit_price, units_in_stock, discontinued
       FROM public.products
      WHERE product_id = $1
      FOR UPDATE`,
    [productId]
  );
  return result.rows[0] || null;
}

module.exports = { list, findByIdForUpdate, AVAILABILITY_SQL };
