'use strict';

const config = require('../config/env');
const { failure } = require('../utils/respond');

/**
 * Manejador central de errores. Nunca expone SQL, stack traces, cadenas de
 * conexion ni detalles internos: solo un codigo estable y detalles seguros.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error && error.isApiError) {
    return failure(res, error.statusCode, error.message, error.code, error.details);
  }

  // Cuerpo JSON mal formado (body-parser).
  if (error && error.type === 'entity.parse.failed') {
    return failure(res, 400, 'El cuerpo de la solicitud no es JSON valido', 'INVALID_JSON');
  }

  // Cuerpo demasiado grande.
  if (error && error.type === 'entity.too.large') {
    return failure(
      res,
      413,
      `El cuerpo de la solicitud excede el limite permitido (${config.jsonBodyLimit})`,
      'PAYLOAD_TOO_LARGE'
    );
  }

  if (error && error.type === 'charset.unsupported') {
    return failure(res, 415, 'Charset no soportado: utilice UTF-8', 'UNSUPPORTED_MEDIA_TYPE');
  }

  if (error && error.message === 'CORS_ORIGIN_NOT_ALLOWED') {
    return failure(res, 403, 'Origen no permitido por la politica CORS', 'CORS_NOT_ALLOWED');
  }

  // Error inesperado: se registra del lado del servidor (sin secretos) y se
  // responde de forma genérica.
  if (!config.isTest) {
    console.error('[error]', {
      method: req.method,
      path: req.originalUrl,
      name: error && error.name,
      pgCode: error && error.code,
      message: error && error.message
    });
    if (error && error.stack) console.error(error.stack);
  }

  return failure(res, 500, 'Error interno del servidor', 'INTERNAL_ERROR');
}

module.exports = errorHandler;
