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

module.exports = { createOrder, getOrderById };
