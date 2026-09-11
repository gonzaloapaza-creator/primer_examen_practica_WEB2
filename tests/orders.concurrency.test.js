'use strict';

/**
 * Pruebas de concurrencia real: varias solicitudes HTTP simultaneas contra
 * PostgreSQL. Verifican que el bloqueo SELECT ... FOR UPDATE evita sobreventa e
 * inventario negativo, y que la secuencia entrega identificadores distintos.
 */

const { test, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  api,
  resetDatabase,
  closePool,
  getStock,
  countRows,
  validOrder
} = require('./helpers/testContext');

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await closePool();
});

describe('POST /orders - concurrencia', () => {
  test('dos solicitudes simultaneas que juntas superan el stock: solo una se confirma', async () => {
    // product_id 8 tiene units_in_stock = 2; cada solicitud pide 2.
    const payload = validOrder({ items: [{ product_id: 8, quantity: 2, discount: 0 }] });
    const ordersBefore = await countRows('orders');

    const responses = await Promise.all([
      api().post('/orders').send(payload),
      api().post('/orders').send(payload)
    ]);

    const created = responses.filter((r) => r.status === 201);
    const rejected = responses.filter((r) => r.status === 409);

    assert.equal(created.length, 1, `se esperaba 1 orden creada, estados: ${responses.map((r) => r.status)}`);
    assert.equal(rejected.length, 1, 'la otra debe rechazarse con 409');
    assert.equal(rejected[0].body.error.code, 'INSUFFICIENT_STOCK');

    const stock = await getStock(8);
    assert.equal(stock, 0, 'el stock debe quedar en 0, nunca negativo');
    assert.ok(stock >= 0, 'no puede haber inventario negativo');
    assert.equal(await countRows('orders'), ordersBefore + 1);
  });

  test('tres solicitudes simultaneas de 1 unidad sobre stock 2: exactamente 2 se confirman', async () => {
    const payload = validOrder({ items: [{ product_id: 8, quantity: 1, discount: 0 }] });

    const responses = await Promise.all([
      api().post('/orders').send(payload),
      api().post('/orders').send(payload),
      api().post('/orders').send(payload)
    ]);

    const created = responses.filter((r) => r.status === 201);
    assert.equal(created.length, 2, `estados obtenidos: ${responses.map((r) => r.status)}`);
    assert.equal(await getStock(8), 0);
  });

  test('solicitudes simultaneas reciben order_id distintos', async () => {
    const payload = validOrder({ items: [{ product_id: 4, quantity: 1, discount: 0 }] });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => api().post('/orders').send(payload))
    );

    for (const response of responses) assert.equal(response.status, 201);
    const ids = responses.map((r) => r.body.data.order_id);
    assert.equal(new Set(ids).size, ids.length, `order_id repetidos: ${ids}`);
    assert.equal(await getStock(4), 53 - 5, 'el stock debe descontarse una vez por orden');
  });
});
