'use strict';

const express = require('express');
const controller = require('../controllers/catalog.controller');
const { validateQuery } = require('../validation/validate');
const { listQuerySchema } = require('../validation/schemas');
const { asyncHandler } = require('../utils/respond');

const router = express.Router();

// GET /customers?q=&limit=&offset=
router.get('/', validateQuery(listQuerySchema), asyncHandler(controller.getCustomers));

module.exports = router;
