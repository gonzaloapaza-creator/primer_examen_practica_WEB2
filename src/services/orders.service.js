'use strict';

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { computeLineAmounts, computeOrderTotals } = require('../utils/money');
const customersRepository = require('../repositories/customers.repository');
const employeesRepository = require('../repositories/employees.repository');
const shippersRepository = require('../repositories/shippers.repository');
const productsRepository = require('../repositories/products.repository');
const ordersRepository = require('../repositories/orders.repository');

const SHIPPING_FIELDS = [
  'ship_name',
  'ship_address',
  'ship_city',
  'ship_region',
  'ship_postal_code',
  'ship_country'
];

/** Arma la representacion publica de la orden a partir de los valores almacenados. */
function presentOrder(header, details) {
  const lines = details.map((detail) => {
    const amounts = computeLineAmounts(detail);
    return {
      amounts,
      json: {
        product_id: detail.product_id,
        product_name: detail.product_name ?? null,
        unit_price: detail.unit_price,
        quantity: detail.quantity,
        discount: detail.discount,
        ...amounts.json
      }
    };
  });

  const totals = computeOrderTotals(
    lines.map((line) => line.amounts),
    header.freight
  );

  return {
    order_id: header.order_id,
    order_date: header.order_date,
    required_date: header.required_date,
    shipped_date: header.shipped_date,
    customer: {
      customer_id: header.customer_id,
      company_name: header.customer_company_name ?? null,
      contact_name: header.customer_contact_name ?? null
    },
    employee: {
      employee_id: header.employee_id,
      first_name: header.employee_first_name ?? null,
      last_name: header.employee_last_name ?? null
    },
    shipper:
      header.ship_via === null || header.ship_via === undefined
        ? null
        : { shipper_id: header.ship_via, company_name: header.shipper_company_name ?? null },
    shipping: SHIPPING_FIELDS.reduce((acc, field) => {
      acc[field] = header[field] ?? null;
      return acc;
    }, {}),
    items: lines.map((line) => line.json),
    amounts: totals
  };
}

/** Version resumida para listados: sin lineas, con importes ya calculados. */
function presentOrderSummary(header, details) {
  const lines = details.map((detail) => computeLineAmounts(detail));
  return {
    order_id: header.order_id,
    order_date: header.order_date,
    required_date: header.required_date,
    shipped_date: header.shipped_date,
    customer: {
      customer_id: header.customer_id,
      company_name: header.customer_company_name ?? null
    },
    employee: {
      employee_id: header.employee_id,
      first_name: header.employee_first_name ?? null,
      last_name: header.employee_last_name ?? null
    },
    items_count: details.length,
    amounts: computeOrderTotals(lines, header.freight)
  };
}

/** Detecta identificadores de producto repetidos dentro de la misma solicitud. */
function assertNoDuplicateProducts(items) {
  const seen = new Set();
  const duplicated = new Set();
  for (const item of items) {
    if (seen.has(item.product_id)) duplicated.add(item.product_id);
    seen.add(item.product_id);
  }
  if (duplicated.size > 0) {
    throw ApiError.badRequest(
      'DUPLICATE_PRODUCT',
      'Cada producto puede aparecer una sola vez en la orden: agrupe las cantidades en una sola linea',
      [...duplicated].sort((a, b) => a - b).map((product_id) => ({ product_id }))
    );
  }
}

/** Traduce errores de PostgreSQL a errores de API sin filtrar SQL ni stack traces. */
function translateDatabaseError(error) {
  if (error && error.isApiError) return error;

  switch (error && error.code) {
    case '23502': // not_null_violation
      if (error.column === 'order_id') {
        return new ApiError(
          500,
          'ORDER_ID_SEQUENCE_MISSING',
          'La columna orders.order_id no tiene generador de identificadores. Ejecute la migracion 001 antes de crear ordenes.'
        );
      }
      return new ApiError(400, 'VALIDATION_ERROR', 'Falta un campo obligatorio en la orden');
    case '2200H': // sequence_generator_limit_exceeded
      return ApiError.conflict(
        'ORDER_ID_LIMIT_REACHED',
        'Se alcanzo el maximo de identificadores de orden permitido por el tipo smallint (32767)'
      );
    case '23503': // foreign_key_violation
      return ApiError.conflict(
        'REFERENCE_CONFLICT',
        'Una entidad referenciada por la orden dejo de existir durante la operacion'
      );
    case '23505': // unique_violation
      return ApiError.conflict('ORDER_CONFLICT', 'Conflicto de unicidad al registrar la orden');
    case '40001': // serialization_failure
    case '40P01': // deadlock_detected
      return ApiError.conflict(
        'CONCURRENCY_CONFLICT',
        'Conflicto de concurrencia al reservar inventario. Reintente la solicitud.'
      );
    default:
      return error;
  }
}

/**
 * Crea una orden completa (cabecera + detalles) en una sola transaccion.
 *
 * Concurrencia: los productos se bloquean con SELECT ... FOR UPDATE en orden
 * ascendente de product_id (orden global y estable => sin deadlocks). El stock se
 * valida con los valores ya bloqueados, por lo que dos ventas simultaneas del
 * mismo producto se serializan y no puede producirse sobreventa.
 *
 * Inventario: el descuento lo realiza EXCLUSIVAMENTE el trigger
 * trg_descontar_stock sobre order_details, dentro de esta misma transaccion.
 * El backend no ejecuta ningun UPDATE de products.
 */
async function createOrder(input) {
  assertNoDuplicateProducts(input.items);

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const customer = await customersRepository.findById(input.customer_id, client);
    if (!customer) {
      throw ApiError.notFound('CUSTOMER_NOT_FOUND', 'El cliente indicado no existe', [
        { customer_id: input.customer_id }
      ]);
    }

    const employee = await employeesRepository.findById(input.employee_id, client);
    if (!employee) {
      throw ApiError.notFound('EMPLOYEE_NOT_FOUND', 'El empleado indicado no existe', [
        { employee_id: input.employee_id }
      ]);
    }

    if (input.ship_via !== null && input.ship_via !== undefined) {
      const shipper = await shippersRepository.findById(input.ship_via, client);
      if (!shipper) {
        throw ApiError.notFound('SHIPPER_NOT_FOUND', 'El transportista indicado no existe', [
          { ship_via: input.ship_via }
        ]);
      }
    }

    // Bloqueo determinista, siempre en orden ascendente de product_id.
    const requestedItems = [...input.items].sort((a, b) => a.product_id - b.product_id);

    const missing = [];
    const discontinued = [];
    const invalidPrice = [];
    const insufficientStock = [];
    const preparedItems = [];

    for (const item of requestedItems) {
      const product = await productsRepository.findByIdForUpdate(client, item.product_id);

      if (!product) {
        missing.push({ product_id: item.product_id });
        continue;
      }
      if (product.discontinued === 1) {
        discontinued.push({ product_id: product.product_id, product_name: product.product_name });
        continue;
      }
      if (
        product.unit_price === null ||
        product.unit_price === undefined ||
        !Number.isFinite(Number(product.unit_price)) ||
        Number(product.unit_price) < 0
      ) {
        invalidPrice.push({ product_id: product.product_id, unit_price: product.unit_price });
        continue;
      }
      if (product.units_in_stock === null || product.units_in_stock === undefined) {
        insufficientStock.push({
          product_id: product.product_id,
          requested: item.quantity,
          available: null
        });
        continue;
      }
      if (product.units_in_stock < item.quantity) {
        insufficientStock.push({
          product_id: product.product_id,
          requested: item.quantity,
          available: product.units_in_stock
        });
        continue;
      }

      preparedItems.push({
        product_id: product.product_id,
        product_name: product.product_name,
        unit_price: product.unit_price, // precio tomado de PostgreSQL
        quantity: item.quantity,
        discount: item.discount
      });
    }

    if (missing.length) {
      throw ApiError.notFound('PRODUCT_NOT_FOUND', 'Uno o mas productos no existen', missing);
    }
    if (discontinued.length) {
      throw ApiError.conflict(
        'PRODUCT_DISCONTINUED',
        'Uno o mas productos estan descontinuados y no pueden venderse',
        discontinued
      );
    }
    if (invalidPrice.length) {
      throw ApiError.conflict(
        'PRODUCT_PRICE_UNAVAILABLE',
        'Uno o mas productos no tienen un precio valido para vender',
        invalidPrice
      );
    }
    if (insufficientStock.length) {
      throw ApiError.conflict(
        'INSUFFICIENT_STOCK',
        'Stock insuficiente para uno de los productos',
        insufficientStock
      );
    }

    const header = await ordersRepository.insertHeader(client, input);
    const insertedDetails = await ordersRepository.insertDetails(
      client,
      header.order_id,
      preparedItems
    );

    // Se releen cabecera y detalles ya persistidos (con nombres de cliente,
    // empleado, transportista y productos) para responder con los valores reales.
    const stored = await ordersRepository.findFullById(header.order_id, client);

    await client.query('COMMIT');
    transactionStarted = false;

    return presentOrder(stored.header, stored.details.length ? stored.details : insertedDetails);
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[orders] fallo el ROLLBACK:', rollbackError.message);
      }
    }
    throw translateDatabaseError(error);
  } finally {
    client.release();
  }
}

async function getOrderById(orderId) {
  const stored = await ordersRepository.findFullById(orderId);
  if (!stored) {
    throw ApiError.notFound('ORDER_NOT_FOUND', 'La orden solicitada no existe', [
      { order_id: orderId }
    ]);
  }
  return presentOrder(stored.header, stored.details);
}

/**
 * Lista ordenes ya registradas (mas recientes primero) con filtros opcionales.
 * Los detalles de la pagina se leen en una sola consulta para evitar N+1.
 */
async function listOrders({ customerId, employeeId, from, to, limit, offset }) {
  const { rows, total } = await ordersRepository.list({
    customerId,
    employeeId,
    from,
    to,
    limit,
    offset
  });

  const detailsByOrder = await ordersRepository.findDetailsByOrderIds(
    rows.map((row) => row.order_id)
  );

  const data = rows.map((header) =>
    presentOrderSummary(header, detailsByOrder.get(header.order_id) || [])
  );

  return { data, meta: { total, limit, offset, returned: data.length } };
}

module.exports = { createOrder, getOrderById, listOrders, presentOrder, presentOrderSummary };
