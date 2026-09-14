'use strict';

const express = require('express');
const controller = require('../controllers/orders.controller');
const requireJsonContentType = require('../middlewares/requireJsonContentType');
const { validateBody, validateParams, validateQuery } = require('../validation/validate');
const { createOrderSchema, orderIdParamSchema, ordersQuerySchema } = require('../validation/schemas');
const { asyncHandler } = require('../utils/respond');

const router = express.Router();

// POST /orders
router.post(
  '/',
  requireJsonContentType,
  validateBody(createOrderSchema),
  asyncHandler(controller.createOrder)
);

// GET /orders?customer_id=&employee_id=&from=&to=&limit=&offset=
router.get('/', validateQuery(ordersQuerySchema), asyncHandler(controller.getOrders));

// GET /orders/:id
router.get('/:id', validateParams(orderIdParamSchema), asyncHandler(controller.getOrderById));

module.exports = router;
