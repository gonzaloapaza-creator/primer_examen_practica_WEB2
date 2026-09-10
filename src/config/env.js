'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const nodeEnv = process.env.NODE_ENV || 'development';
const envFileName = nodeEnv === 'test' ? '.env.test' : '.env';
const envFilePath = path.resolve(process.cwd(), envFileName);

if (fs.existsSync(envFilePath)) {
  dotenv.config({ path: envFilePath });
}

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(
      `Falta la variable de entorno obligatoria ${name}. ` +
        `Copie ${envFileName === '.env' ? '.env.example' : '.env.test.example'} como ${envFileName} y complete los valores.`
    );
  }
  return String(value);
}

function optional(name, fallback) {
  const value = process.env[name];
  if (value === undefined || String(value).trim() === '') return fallback;
  return String(value);
}

function toInt(name, fallback) {
  const raw = optional(name, null);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`La variable ${name} debe ser un entero valido. Valor recibido: ${raw}`);
  }
  return parsed;
}

function toBool(name, fallback) {
  const raw = optional(name, null);
  if (raw === null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

const corsOriginRaw = optional('CORS_ORIGIN', 'http://localhost:5173');
const corsOrigin =
  corsOriginRaw === '*'
    ? '*'
    : corsOriginRaw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

const config = {
  nodeEnv,
  isTest: nodeEnv === 'test',
  isProduction: nodeEnv === 'production',
  port: toInt('PORT', 3000),
  corsOrigin,
  jsonBodyLimit: optional('JSON_BODY_LIMIT', '100kb'),
  db: {
    host: required('DB_HOST'),
    port: toInt('DB_PORT', 5432),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    max: toInt('DB_POOL_MAX', 10),
    idleTimeoutMillis: toInt('DB_IDLE_TIMEOUT_MS', 30000),
    connectionTimeoutMillis: toInt('DB_CONNECTION_TIMEOUT_MS', 10000),
    ssl: toBool('DB_SSL', false),
    sslCaPath: optional('DB_SSL_CA', null)
  },
  maintenanceDatabase: optional('MAINTENANCE_DB', 'postgres')
};

if (config.isTest && !/_test$/i.test(config.db.database)) {
  throw new Error(
    `Proteccion de datos: con NODE_ENV=test la base debe terminar en "_test". Valor actual: ${config.db.database}`
  );
}

module.exports = config;
