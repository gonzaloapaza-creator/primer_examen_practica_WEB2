'use strict';

const express = require('express');
const { pool } = require('../config/db');
const { success, asyncHandler } = require('../utils/respond');

const customersRoutes = require('./customers.routes');
const employeesRoutes = require('./employees.routes');
const productsRoutes = require('./products.routes');
const shippersRoutes = require('./shippers.routes');
const ordersRoutes = require('./orders.routes');

const router = express.Router();

router.get(
  '/health',
  asyncHandler(async (req, res) => {
    await pool.query('SELECT 1');
    return success(res, 200, 'Servicio operativo', { status: 'ok', database: 'ok' });
  })
);

router.get('/', (req, res) =>
  success(res, 200, 'API de ordenes Northwind', {
    endpoints: [
      'GET /health',
      'GET /customers',
      'GET /employees',
      'GET /products',
      'GET /shippers',
      'POST /orders',
      'GET /orders/:id'
    ]
  })
);

router.use('/customers', customersRoutes);
router.use('/employees', employeesRoutes);
router.use('/products', productsRoutes);
router.use('/shippers', shippersRoutes);
router.use('/orders', ordersRoutes);

module.exports = router;
