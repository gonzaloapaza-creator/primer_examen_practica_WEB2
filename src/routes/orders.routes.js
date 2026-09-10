'use strict';

const express = require('express');
const controller = require('../controllers/orders.controller');
const requireJsonContentType = require('../middlewares/requireJsonContentType');
const { validateBody, validateParams } = require('../validation/validate');
const { createOrderSchema, orderIdParamSchema } = require('../validation/schemas');
const { asyncHandler } = require('../utils/respond');

const router = express.Router();

// POST /orders
router.post(
  '/',
  requireJsonContentType,
  validateBody(createOrderSchema),
  asyncHandler(controller.createOrder)
);

// GET /orders/:id
router.get('/:id', validateParams(orderIdParamSchema), asyncHandler(controller.getOrderById));

module.exports = router;
