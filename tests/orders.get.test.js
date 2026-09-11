'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  api,
  pool,
  resetDatabase,
  closePool,
  validOrder,
  assertErrorShape
} = require('./helpers/testContext');

let createdOrder;

before(async () => {
  await resetDatabase();
  const response = await api().post('/orders').send(validOrder()).expect(201);
  createdOrder = response.body.data;
});

after(async () => {
  await closePool();
});

describe('GET /orders/:id', () => {
  test('devuelve la orden creada con los mismos datos e importes', async () => {
    const response = await api().get(`/orders/${createdOrder.order_id}`).expect(200);
    assert.equal(response.body.success, true);
    assert.deepEqual(response.body.data, createdOrder);
  });

  test('incluye cabecera, cliente, empleado, transportista, detalles e importes', async () => {
    const { body } = await api().get(`/orders/${createdOrder.order_id}`).expect(200);
    const data = body.data;
    assert.equal(data.customer.company_name, 'Alfreds Futterkiste');
    assert.equal(data.employee.last_name, 'Buchanan');
    assert.equal(data.shipper.company_name, 'United Package');
    assert.equal(data.items.length, 2);
    assert.equal(data.amounts.total, 50.5);
    assert.equal(data.shipping.ship_city, 'Berlin');
  });

  test('usa los precios guardados en order_details, no los del catalogo actual', async () => {
    // Se cambia el precio de catalogo despues de crear la orden.
    await pool.query('UPDATE public.products SET unit_price = 99.99 WHERE product_id = 1');
    try {
      const response = await api().get(`/orders/${createdOrder.order_id}`).expect(200);
      const chai = response.body.data.items.find((i) => i.product_id === 1);
      assert.equal(chai.unit_price, 18, 'debe conservar el precio historico');
      assert.equal(response.body.data.amounts.total, 50.5);
    } finally {
      await pool.query('UPDATE public.products SET unit_price = 18 WHERE product_id = 1');
    }
  });

  test('devuelve 404 si la orden no existe', async () => {
    const response = await api().get('/orders/32000').expect(404);
    assertErrorShape(response.body, 'ORDER_NOT_FOUND');
  });

  test('devuelve 400 si el identificador tiene formato invalido', async () => {
    for (const id of ['abc', '1.5', '-3', '0', '99999', ' ']) {
      const response = await api().get(`/orders/${encodeURIComponent(id)}`).expect(400);
      assertErrorShape(response.body, 'VALIDATION_ERROR');
    }
  });

  test('lee tambien ordenes historicas cargadas directamente en la base', async () => {
    const response = await api().get('/orders/10248').expect(200);
    assert.equal(response.body.data.order_id, 10248);
    assert.equal(response.body.data.order_date, '2025-01-15');
    assert.equal(response.body.data.items.length, 1);
    assert.equal(response.body.data.amounts.subtotal, 110);
    assert.equal(response.body.data.amounts.total, 142.38);
  });
});
