'use strict';

const ApiError = require('../utils/ApiError');

/** Cualquier ruta no declarada responde JSON, nunca HTML. */
function notFoundHandler(req, res, next) {
  return next(
    ApiError.notFound('ROUTE_NOT_FOUND', 'El recurso solicitado no existe en esta API', [
      { method: req.method, path: req.originalUrl }
    ])
  );
}

module.exports = notFoundHandler;
