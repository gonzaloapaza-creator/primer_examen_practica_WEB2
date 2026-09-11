'use strict';

/**
 * Prueba critica de rollback REAL.
 *
 * No basta con rechazar la solicitud antes de la transaccion. Aqui se provoca un
 * fallo dentro de la base de datos DESPUES de que la cabecera y el primer detalle
 * ya fueron insertados (y despues de que trg_descontar_stock ya descontó stock),
 * instalando temporalmente un trigger AFTER INSERT que lanza una excepcion para
 * un producto concreto. Se comprueba que:
 *   - la API responde 500 con la envoltura de error estandar,
 *   - no queda cabecera ni detalle parcial,
 *   - el inventario vuelve exactamente a su valor previo.
 *
 * El trigger auxiliar existe solo durante esta prueba y solo en northwind_test.
 */

const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  api,
  pool,
  resetDatabase,
  closePool,
  getStock,
  countRows,
  validOrder,
  assertErrorShape
} = require('./helpers/testContext');

const FAILING_PRODUCT_ID = 3;

async function installFailingTrigger() {
  await pool.query(`
    CREATE OR REPLACE FUNCTION public.test_fallo_simulado()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        IF NEW.product_id = ${FAILING_PRODUCT_ID} THEN
            RAISE EXCEPTION 'fallo simulado despues de insertar el detalle';
        END IF;
        RETURN NEW;
    END;
    $$;`);
  await pool.query('DROP TRIGGER IF EXISTS trg_test_fallo ON public.order_details');
  // Se crea DESPUES de trg_descontar_stock (orden alfabetico: descontar < test),
  // por lo que el descuento de stock ya ocurrio cuando este trigger falla.
  await pool.query(`
    CREATE TRIGGER trg_test_fallo
    AFTER INSERT ON public.order_details
    FOR EACH ROW EXECUTE FUNCTION public.test_fallo_simulado()`);
}

async function removeFailingTrigger() {
  await pool.query('DROP TRIGGER IF EXISTS trg_test_fallo ON public.order_details');
  await pool.query('DROP FUNCTION IF EXISTS public.test_fallo_simulado()');
}

before(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await removeFailingTrigger();
  await closePool();
});

describe('POST /orders - rollback ante fallo real dentro de la transaccion', () => {
  test('un fallo posterior a los INSERT no deja registros parciales ni descuenta stock', async () => {
    const stockBefore = { p1: await getStock(1), p3: await getStock(FAILING_PRODUCT_ID) };
    const ordersBefore = await countRows('orders');
    const detailsBefore = await countRows('order_details');

    await installFailingTrigger();
    let response;
    try {
      response = await api()
        .post('/orders')
        .send(
          validOrder({
            items: [
              { product_id: 1, quantity: 2, discount: 0 },
              { product_id: FAILING_PRODUCT_ID, quantity: 1, discount: 0 }
            ]
          })
        );
    } finally {
      await removeFailingTrigger();
    }

    assert.equal(response.status, 500);
    assertErrorShape(response.body, 'INTERNAL_ERROR');
    assert.ok(
      !JSON.stringify(response.body).includes('fallo simulado'),
      'el mensaje interno de PostgreSQL no debe filtrarse al cliente'
    );

    // Nada parcial: ni cabecera, ni detalles, ni descuento de inventario.
    assert.equal(await countRows('orders'), ordersBefore, 'no debe quedar la cabecera');
    assert.equal(await countRows('order_details'), detailsBefore, 'no debe quedar ningun detalle');
    assert.equal(await getStock(1), stockBefore.p1, 'el descuento del trigger debe revertirse');
    assert.equal(await getStock(FAILING_PRODUCT_ID), stockBefore.p3);
  });

  test('la conexion del pool queda utilizable despues del rollback', async () => {
    await installFailingTrigger();
    try {
      for (let i = 0; i < 3; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await api()
          .post('/orders')
          .send(validOrder({ items: [{ product_id: FAILING_PRODUCT_ID, quantity: 1 }] }))
          .expect(500);
      }
    } finally {
      await removeFailingTrigger();
    }

    // La API sigue operativa y puede crear una orden correcta.
    const ok = await api()
      .post('/orders')
      .send(validOrder({ items: [{ product_id: 1, quantity: 1 }] }))
      .expect(201);
    assert.ok(ok.body.data.order_id);
    assert.equal(await getStock(1), 38);
  });
});
