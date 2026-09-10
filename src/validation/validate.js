'use strict';

const ApiError = require('../utils/ApiError');

/** Traduce los issues de zod a detalles estables y sin informacion interna. */
function formatIssues(zodError) {
  return zodError.issues.map((issue) => ({
    field: issue.path.length ? issue.path.join('.') : '(raiz)',
    issue: issue.code,
    message: issue.message
  }));
}

function parseOrThrow(schema, value, message) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw ApiError.badRequest('VALIDATION_ERROR', message, formatIssues(result.error));
  }
  return result.data;
}

function validateBody(schema) {
  return (req, res, next) => {
    if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return next(
        ApiError.badRequest('VALIDATION_ERROR', 'El cuerpo de la solicitud debe ser un objeto JSON', [
          { field: '(raiz)', issue: 'invalid_type', message: 'Se esperaba un objeto JSON' }
        ])
      );
    }
    try {
      req.validatedBody = parseOrThrow(schema, req.body, 'La solicitud contiene datos invalidos');
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.validatedQuery = parseOrThrow(schema, req.query, 'Parametros de consulta invalidos');
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function validateParams(schema) {
  return (req, res, next) => {
    try {
      req.validatedParams = parseOrThrow(schema, req.params, 'Parametros de ruta invalidos');
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { validateBody, validateQuery, validateParams, parseOrThrow, formatIssues };
