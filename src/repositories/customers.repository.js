'use strict';

const { query } = require('../config/db');

const BASE_COLUMNS = `
  customer_id,
  company_name,
  contact_name,
  contact_title,
  city,
  country`;

/**
 * Lista clientes con busqueda opcional por identificador o empresa.
 * La busqueda viaja siempre como parametro ($1): los caracteres especiales o
 * intentos de inyeccion se tratan como datos literales.
 */
async function list({ q, limit, offset }) {
  const filters = [];
  const params = [];

  if (q) {
    params.push(`%${q}%`);
    filters.push(`(customer_id ILIKE $${params.length} OR company_name ILIKE $${params.length})`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM public.customers ${where}`,
    params
  );

  params.push(limit, offset);
  const rowsResult = await query(
    `SELECT ${BASE_COLUMNS}
       FROM public.customers
       ${where}
      ORDER BY company_name ASC, customer_id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { rows: rowsResult.rows, total: countResult.rows[0].total };
}

/** Busca un cliente. Si se pasa un client de transaccion, usa esa misma conexion. */
async function findById(customerId, client = null) {
  const runner = client || { query };
  const result = await runner.query(
    `SELECT customer_id, company_name, contact_name
       FROM public.customers
      WHERE customer_id = $1`,
    [customerId]
  );
  return result.rows[0] || null;
}

module.exports = { list, findById };
