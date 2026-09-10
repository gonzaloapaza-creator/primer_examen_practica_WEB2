'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Exige Content-Type application/json en las solicitudes con cuerpo.
 * Responde 415 cuando el tipo no es soportado.
 */
function requireJsonContentType(req, res, next) {
  if (!req.is('application/json')) {
    return next(
      ApiError.unsupportedMediaType(
        'Content-Type no soportado: utilice application/json',
        [{ received: req.headers['content-type'] || null, expected: 'application/json' }]
      )
    );
  }
  return next();
}

module.exports = requireJsonContentType;
