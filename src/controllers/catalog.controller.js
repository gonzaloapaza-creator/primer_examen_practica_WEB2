'use strict';

const catalogService = require('../services/catalog.service');
const { success } = require('../utils/respond');

async function getCustomers(req, res) {
  const { q, limit, offset } = req.validatedQuery;
  const result = await catalogService.listCustomers({ q, limit, offset });
  return success(res, 200, 'Clientes obtenidos correctamente', result.data, { meta: result.meta });
}

async function getEmployees(req, res) {
  const { q, limit, offset } = req.validatedQuery;
  const result = await catalogService.listEmployees({ q, limit, offset });
  return success(res, 200, 'Empleados obtenidos correctamente', result.data, { meta: result.meta });
}

async function getProducts(req, res) {
  const { q, limit, offset, include_unavailable: includeUnavailable } = req.validatedQuery;
  const result = await catalogService.listProducts({ q, limit, offset, includeUnavailable });
  return success(res, 200, 'Productos obtenidos correctamente', result.data, { meta: result.meta });
}

async function getShippers(req, res) {
  const { limit, offset } = req.validatedQuery;
  const result = await catalogService.listShippers({ limit, offset });
  return success(res, 200, 'Transportistas obtenidos correctamente', result.data, {
    meta: result.meta
  });
}

module.exports = { getCustomers, getEmployees, getProducts, getShippers };
