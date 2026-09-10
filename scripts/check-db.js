'use strict';

/**
 * Verifica el estado de la base ANTES de usar la API. Solo lee: no modifica nada.
 * Uso: npm run db:check
 *
 * Comprueba:
 *   1. Conexion, base y version de PostgreSQL.
 *   2. Existencia de las tablas usadas por la API.
 *   3. Conteo de registros (informativo, sin valores esperados fijos).
 *   4. Configuracion de orders.order_id (tipo, DEFAULT, secuencia, capacidad).
 *   5. Presencia y estado del trigger trg_descontar_stock.
 */

const { pool, closePool } = require('../src/config/db');
const config = require('../src/config/env');

const REQUIRED_TABLES = [
  'customers',
  'employees',
  'products',
  'orders',
  'order_details',
  'shippers'
];

let problems = 0;

function ok(message) {
  console.log(`  OK    ${message}`);
}
function warn(message) {
  console.log(`  AVISO ${message}`);
}
function fail(message) {
  problems += 1;
  console.log(`  FALLA ${message}`);
}

async function checkConnection() {
  console.log('\n1) Conexion');
  const { rows } = await pool.query(
    'SELECT current_database() AS db, current_user AS usr, version() AS version'
  );
  ok(`base "${rows[0].db}" como usuario "${rows[0].usr}"`);
  ok(rows[0].version.split(',')[0]);
}

async function checkTables() {
  console.log('\n2) Tablas requeridas en el esquema public');
  const { rows } = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [REQUIRED_TABLES]
  );
  const found = new Set(rows.map((r) => r.table_name));
  for (const table of REQUIRED_TABLES) {
    if (found.has(table)) ok(`public.${table}`);
    else fail(`falta public.${table}`);
  }
}

async function checkCounts() {
  console.log('\n3) Registros existentes (informativo)');
  for (const table of REQUIRED_TABLES) {
    try {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS total FROM public.${table}`);
      ok(`${table}: ${rows[0].total}`);
    } catch (error) {
      fail(`${table}: no se pudo contar (${error.message})`);
    }
  }
}

async function checkOrderIdGeneration() {
  console.log('\n4) Generacion de orders.order_id');
  const column = await pool.query(
    `SELECT data_type, is_identity, column_default
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='orders' AND column_name='order_id'`
  );
  if (column.rowCount === 0) {
    fail('no existe la columna orders.order_id');
    return;
  }
  const { data_type: dataType, is_identity: isIdentity, column_default: columnDefault } =
    column.rows[0];
  ok(`tipo: ${dataType}`);

  if (isIdentity === 'YES') {
    ok('la columna es GENERATED AS IDENTITY');
  } else if (columnDefault && columnDefault.includes('nextval')) {
    ok(`DEFAULT: ${columnDefault}`);
  } else {
    fail(
      'orders.order_id no tiene generador. Ejecute la migracion: npm run db:migrate ' +
        '(o migrations/001_orders_order_id_sequence.sql desde pgAdmin)'
    );
  }

  const sequence = await pool.query(
    `SELECT sequencename, data_type, last_value, max_value
       FROM pg_sequences
      WHERE schemaname='public' AND sequencename='orders_order_id_seq'`
  );
  if (sequence.rowCount === 0) {
    warn('no existe la secuencia public.orders_order_id_seq');
  } else {
    const seq = sequence.rows[0];
    ok(`secuencia ${seq.sequencename} (${seq.data_type}), last_value=${seq.last_value ?? 'sin usar'}`);
    const maxOrder = await pool.query('SELECT COALESCE(MAX(order_id),0)::int AS max FROM public.orders');
    if (seq.last_value !== null && Number(seq.last_value) < maxOrder.rows[0].max) {
      fail(
        `la secuencia (${seq.last_value}) esta por debajo de MAX(order_id)=${maxOrder.rows[0].max}: vuelva a ejecutar la migracion`
      );
    } else {
      ok(`MAX(order_id) actual = ${maxOrder.rows[0].max}`);
    }
    const remaining = Number(seq.max_value) - Number(seq.last_value ?? 0);
    if (remaining < 1000) warn(`quedan solo ${remaining} identificadores (limite del tipo)`);
    else ok(`capacidad restante: ${remaining} identificadores`);
  }
}

async function checkTrigger() {
  console.log('\n5) Trigger de inventario');
  const { rows } = await pool.query(
    `SELECT t.tgname, t.tgenabled, p.proname
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE n.nspname='public' AND c.relname='order_details'
        AND NOT t.tgisinternal`
  );
  const trigger = rows.find((r) => r.tgname === 'trg_descontar_stock');
  if (!trigger) {
    fail('no existe trg_descontar_stock en public.order_details: el stock no se descontara');
  } else if (trigger.tgenabled === 'D') {
    fail('trg_descontar_stock existe pero esta DESHABILITADO');
  } else {
    ok(`trg_descontar_stock habilitado (tgenabled=${trigger.tgenabled}) -> ${trigger.proname}()`);
  }
  const others = rows.filter((r) => r.tgname !== 'trg_descontar_stock');
  for (const other of others) {
    warn(`otro trigger presente en order_details: ${other.tgname} -> ${other.proname}()`);
  }
}

async function main() {
  console.log(`Verificacion de la base "${config.db.database}" (entorno ${config.nodeEnv})`);
  await checkConnection();
  await checkTables();
  await checkCounts();
  await checkOrderIdGeneration();
  await checkTrigger();

  console.log('');
  if (problems === 0) {
    console.log('Resultado: la base esta lista para la API.');
  } else {
    console.log(`Resultado: ${problems} problema(s) detectado(s). Revise los mensajes anteriores.`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('\n[check-db] error:', error.message);
    process.exitCode = 1;
  })
  .finally(() => closePool().catch(() => {}));
