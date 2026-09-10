'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config/env');
const routes = require('./routes');
const notFoundHandler = require('./middlewares/notFoundHandler');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', false);

// Cabeceras de seguridad. La API no sirve HTML, por eso se desactiva CSP de documentos.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// CORS configurado por variable de entorno.
// Importante: CORS solo limita a los navegadores; NO es autenticacion.
app.use(
  cors({
    origin(origin, callback) {
      if (config.corsOrigin === '*') return callback(null, true);
      if (!origin) return callback(null, true); // curl, Postman, pruebas
      if (config.corsOrigin.includes(origin)) return callback(null, true);
      return callback(new Error('CORS_ORIGIN_NOT_ALLOWED'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600
  })
);

app.use(express.json({ limit: config.jsonBodyLimit, strict: true }));

app.use(routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
