'use strict';

const { query } = require('../config/db');

// Solo se exponen los campos necesarios para crear una orden.
// Datos como birth_date, home_phone, address o photo NO se seleccionan.
const BASE_COLUMNS = 'employee_id, first_name, last_name';

async function list({ q, limit, offset }) {
  const filters = [];
  const params = [];

  if (q) {
    params.push(`%${q}%`);
    filters.push(
      `(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR (first_name || ' ' || last_name) ILIKE $${params.length})`
    );
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM public.employees ${where}`,
    params
  );

  params.push(limit, offset);
  const rowsResult = await query(
    `SELECT ${BASE_COLUMNS}
       FROM public.employees
       ${where}
      ORDER BY last_name ASC, first_name ASC, employee_id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { rows: rowsResult.rows, total: countResult.rows[0].total };
}

async function findById(employeeId, client = null) {
  const runner = client || { query };
  const result = await runner.query(
    `SELECT ${BASE_COLUMNS} FROM public.employees WHERE employee_id = $1`,
    [employeeId]
  );
  return result.rows[0] || null;
}

module.exports = { list, findById };
