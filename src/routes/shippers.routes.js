'use strict';

const express = require('express');
const controller = require('../controllers/catalog.controller');
const { validateQuery } = require('../validation/validate');
const { listQuerySchema } = require('../validation/schemas');
const { asyncHandler } = require('../utils/respond');

const router = express.Router();

// GET /shippers?limit=&offset=  (consulta auxiliar para elegir ship_via)
router.get('/', validateQuery(listQuerySchema), asyncHandler(controller.getShippers));

module.exports = router;
