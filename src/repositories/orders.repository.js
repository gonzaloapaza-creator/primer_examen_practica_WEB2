'use strict';

const { query } = require('../config/db');

/**
 * Inserta la cabecera. order_id NO se envia: lo genera el DEFAULT nextval(...)
 * creado por migrations/001_orders_order_id_sequence.sql.
 * shipped_date queda NULL de forma explicita en este flujo.
 * @param {import('pg').PoolClient} client
 */
async function insertHeader(client, header) {
  const result = await client.query(
    `INSERT INTO public.orders (
        customer_id, employee_id, order_date, required_date, shipped_date,
        ship_via, freight, ship_name, ship_address, ship_city,
        ship_region, ship_postal_code, ship_country
     ) VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING order_id, customer_id, employee_id, order_date, required_date,
               shipped_date, ship_via, freight, ship_name, ship_address,
               ship_city, ship_region, ship_postal_code, ship_country`,
    [
      header.customer_id,
      header.employee_id,
      header.order_date,
      header.required_date ?? null,
      header.ship_via ?? null,
      header.freight ?? null,
      header.ship_name ?? null,
      header.ship_address ?? null,
      header.ship_city ?? null,
      header.ship_region ?? null,
      header.ship_postal_code ?? null,
      header.ship_country ?? null
    ]
  );
  return result.rows[0];
}

/**
 * Inserta todos los detalles en una sola sentencia parametrizada.
 * El precio unitario proviene de la fila bloqueada de products, nunca del cliente.
 * El trigger trg_descontar_stock descuenta inventario en esta misma transaccion.
 * @param {import('pg').PoolClient} client
 */
async function insertDetails(client, orderId, items) {
  const params = [];
  const valuesSql = items.map((item, index) => {
    const base = index * 4;
    params.push(item.product_id, item.unit_price, item.quantity, item.discount);
    return `($${base + 1}::smallint, $${base + 2}::real, $${base + 3}::smallint, $${base + 4}::real)`;
  });

  const result = await client.query(
    `INSERT INTO public.order_details (order_id, product_id, unit_price, quantity, discount)
     SELECT $${params.length + 1}::smallint, v.product_id, v.unit_price, v.quantity, v.discount
       FROM (VALUES ${valuesSql.join(', ')}) AS v(product_id, unit_price, quantity, discount)
      ORDER BY v.product_id
     RETURNING order_id, product_id, unit_price, quantity, discount`,
    [...params, orderId]
  );
  return result.rows;
}

const HEADER_SELECT = `
  SELECT o.order_id,
         o.customer_id,
         c.company_name  AS customer_company_name,
         c.contact_name  AS customer_contact_name,
         o.employee_id,
         e.first_name    AS employee_first_name,
         e.last_name     AS employee_last_name,
         o.order_date,
         o.required_date,
         o.shipped_date,
         o.ship_via,
         s.company_name  AS shipper_company_name,
         o.freight,
         o.ship_name,
         o.ship_address,
         o.ship_city,
         o.ship_region,
         o.ship_postal_code,
         o.ship_country
    FROM public.orders o
    LEFT JOIN public.customers c ON c.customer_id = o.customer_id
    LEFT JOIN public.employees e ON e.employee_id = o.employee_id
    LEFT JOIN public.shippers  s ON s.shipper_id  = o.ship_via
   WHERE o.order_id = $1`;

const DETAILS_SELECT = `
  SELECT d.product_id,
         p.product_name,
         d.unit_price,
         d.quantity,
         d.discount
    FROM public.order_details d
    LEFT JOIN public.products p ON p.product_id = d.product_id
   WHERE d.order_id = $1
   ORDER BY d.product_id ASC`;

/** Lee cabecera y detalles. Acepta un client de transaccion opcional. */
async function findFullById(orderId, client = null) {
  const runner = client || { query };
  const headerResult = await runner.query(HEADER_SELECT, [orderId]);
  if (headerResult.rowCount === 0) return null;
  const detailsResult = await runner.query(DETAILS_SELECT, [orderId]);
  return { header: headerResult.rows[0], details: detailsResult.rows };
}

module.exports = { insertHeader, insertDetails, findFullById };
