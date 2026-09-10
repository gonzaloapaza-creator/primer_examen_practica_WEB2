'use strict';

function success(res, statusCode, message, data, extra = null) {
  const body = { success: true, message, data };
  if (extra && typeof extra === 'object') Object.assign(body, extra);
  return res.status(statusCode).json(body);
}

function failure(res, statusCode, message, code, details = null) {
  const error = { code };
  if (details !== null && details !== undefined) error.details = details;
  return res.status(statusCode).json({ success: false, message, error });
}

/** Envuelve handlers async para que los rechazos lleguen al middleware de errores. */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = { success, failure, asyncHandler };
