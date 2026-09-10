'use strict';

/**
 * Error de aplicacion con codigo HTTP, codigo estable de negocio y detalles
 * seguros para exponer al cliente.
 */
class ApiError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isApiError = true;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(code, message, details) {
    return new ApiError(400, code, message, details);
  }

  static notFound(code, message, details) {
    return new ApiError(404, code, message, details);
  }

  static conflict(code, message, details) {
    return new ApiError(409, code, message, details);
  }

  static unsupportedMediaType(message, details) {
    return new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', message, details);
  }
}

module.exports = ApiError;
