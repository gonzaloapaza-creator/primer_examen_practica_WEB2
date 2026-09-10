'use strict';

const { query } = require('../config/db');

async function list({ limit, offset }) {
  const countResult = await query('SELECT COUNT(*)::int AS total FROM public.shippers');
  const rowsResult = await query(
    `SELECT shipper_id, company_name, phone
       FROM public.shippers
      ORDER BY shipper_id ASC
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return { rows: rowsResult.rows, total: countResult.rows[0].total };
}

async function findById(shipperId, client = null) {
  const runner = client || { query };
  const result = await runner.query(
    'SELECT shipper_id, company_name FROM public.shippers WHERE shipper_id = $1',
    [shipperId]
  );
  return result.rows[0] || null;
}

module.exports = { list, findById };
