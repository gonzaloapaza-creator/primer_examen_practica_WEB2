'use strict';

const customersRepository = require('../repositories/customers.repository');
const employeesRepository = require('../repositories/employees.repository');
const productsRepository = require('../repositories/products.repository');
const shippersRepository = require('../repositories/shippers.repository');

function buildMeta({ total, limit, offset, returned }) {
  return { total, limit, offset, returned };
}

async function listCustomers({ q, limit, offset }) {
  const { rows, total } = await customersRepository.list({ q, limit, offset });
  return { data: rows, meta: buildMeta({ total, limit, offset, returned: rows.length }) };
}

async function listEmployees({ q, limit, offset }) {
  const { rows, total } = await employeesRepository.list({ q, limit, offset });
  return { data: rows, meta: buildMeta({ total, limit, offset, returned: rows.length }) };
}

async function listProducts({ q, limit, offset, includeUnavailable }) {
  const { rows, total } = await productsRepository.list({ q, limit, offset, includeUnavailable });
  const data = rows.map((row) => ({
    product_id: row.product_id,
    product_name: row.product_name,
    unit_price: row.unit_price,
    units_in_stock: row.units_in_stock,
    quantity_per_unit: row.quantity_per_unit,
    discontinued: row.discontinued === 1,
    available: row.available === true
  }));
  return {
    data,
    meta: {
      ...buildMeta({ total, limit, offset, returned: data.length }),
      filter: includeUnavailable ? 'todos los productos' : 'solo productos aptos para vender'
    }
  };
}

async function listShippers({ limit, offset }) {
  const { rows, total } = await shippersRepository.list({ limit, offset });
  return { data: rows, meta: buildMeta({ total, limit, offset, returned: rows.length }) };
}

module.exports = { listCustomers, listEmployees, listProducts, listShippers };
