'use strict';

const express = require('express');
const controller = require('../controllers/catalog.controller');
const { validateQuery } = require('../validation/validate');
const { productsQuerySchema } = require('../validation/schemas');
const { asyncHandler } = require('../utils/respond');

const router = express.Router();

// GET /products?q=&limit=&offset=&include_unavailable=false
router.get('/', validateQuery(productsQuerySchema), asyncHandler(controller.getProducts));

module.exports = router;
