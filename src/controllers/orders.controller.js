'use strict';

const ordersService = require('../services/orders.service');
const { success } = require('../utils/respond');

async function createOrder(req, res) {
  const order = await ordersService.createOrder(req.validatedBody);
  res.location(`/orders/${order.order_id}`);
  return success(res, 201, 'Orden creada correctamente', order);
}

async function getOrderById(req, res) {
  const order = await ordersService.getOrderById(req.validatedParams.id);
  return success(res, 200, 'Orden obtenida correctamente', order);
}

async function getOrders(req, res) {
  const { customer_id: customerId, employee_id: employeeId, from, to, limit, offset } =
    req.validatedQuery;
  const result = await ordersService.listOrders({
    customerId,
    employeeId,
    from,
    to,
    limit,
    offset
  });
  return success(res, 200, 'Ordenes obtenidas correctamente', result.data, { meta: result.meta });
}

module.exports = { createOrder, getOrderById, getOrders };
