'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');

const { api, resetDatabase, closePool, assertErrorShape } = require('./helpers/testContext');

before(async () => {
  await resetDatabase();
});

after(async () => {
  await closePool();
});

describe('GET /customers', () => {
  test('devuelve identificador, empresa y contacto con metadatos de paginacion', async () => {
    const response = await api().get('/customers').expect(200);
    assert.equal(response.body.success, true);
    assert.ok(Array.isArray(response.body.data));
    assert.ok(response.body.data.length > 0);
    const customer = response.body.data[0];
    assert.ok('customer_id' in customer);
    assert.ok('company_name' in customer);
    assert.ok('contact_name' in customer);
    assert.equal(typeof response.body.meta.total, 'number');
    assert.equal(response.body.meta.limit, 20);
    assert.equal(response.body.meta.offset, 0);
  });

  test('permite buscar por identificador', async () => {
    const response = await api().get('/customers').query({ q: 'ALFKI' }).expect(200);
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].customer_id, 'ALFKI');
  });

  test('permite buscar por nombre de empresa', async () => {
    const response = await api().get('/customers').query({ q: 'trujillo' }).expect(200);
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].customer_id, 'ANATR');
  });

  test('respeta limit y offset', async () => {
    const first = await api().get('/customers').query({ limit: 1, offset: 0 }).expect(200);
    const second = await api().get('/customers').query({ limit: 1, offset: 1 }).expect(200);
    assert.equal(first.body.data.length, 1);
    assert.equal(second.body.data.length, 1);
    assert.notEqual(first.body.data[0].customer_id, second.body.data[0].customer_id);
  });

  test('rechaza limit fuera de rango', async () => {
    const response = await api().get('/customers').query({ limit: 500 }).expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });

  test('rechaza limit no numerico', async () => {
    const response = await api().get('/customers').query({ limit: 'diez' }).expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });

  test('trata un intento de inyeccion SQL como texto de busqueda', async () => {
    const payload = "ALFKI'; DROP TABLE customers; --";
    const response = await api().get('/customers').query({ q: payload }).expect(200);
    assert.equal(response.body.data.length, 0);
    // La tabla sigue existiendo y respondiendo.
    const after = await api().get('/customers').expect(200);
    assert.ok(after.body.data.length > 0);
  });
});

describe('GET /employees', () => {
  test('devuelve solo identificador, nombre y apellido', async () => {
    const response = await api().get('/employees').expect(200);
    assert.ok(response.body.data.length > 0);
    for (const employee of response.body.data) {
      assert.deepEqual(Object.keys(employee).sort(), ['employee_id', 'first_name', 'last_name']);
    }
  });

  test('no expone datos personales innecesarios', async () => {
    const response = await api().get('/employees').expect(200);
    const serialized = JSON.stringify(response.body);
    for (const field of ['birth_date', 'home_phone', 'address', 'notes', 'photo', 'salary']) {
      assert.ok(!serialized.includes(field), `no debe exponer ${field}`);
    }
  });
});

describe('GET /products', () => {
  test('por defecto devuelve solo productos aptos para vender', async () => {
    const response = await api().get('/products').query({ limit: 100 }).expect(200);
    const ids = response.body.data.map((p) => p.product_id);

    assert.ok(ids.includes(1), 'Chai debe estar disponible');
    assert.ok(!ids.includes(5), 'no debe incluir el producto descontinuado');
    assert.ok(!ids.includes(6), 'no debe incluir el producto con precio NULL');
    assert.ok(!ids.includes(7), 'no debe incluir el producto con stock NULL');
    assert.ok(!ids.includes(9), 'no debe incluir el producto con stock 0');

    for (const product of response.body.data) {
      assert.equal(product.discontinued, false);
      assert.equal(product.available, true);
      assert.ok(product.units_in_stock > 0);
      assert.ok(product.unit_price >= 0);
    }
  });

  test('devuelve identificador, nombre, precio, stock y estado', async () => {
    const response = await api().get('/products').query({ q: 'Chai' }).expect(200);
    const product = response.body.data[0];
    assert.equal(product.product_id, 1);
    assert.equal(product.product_name, 'Chai');
    assert.equal(product.unit_price, 18);
    assert.equal(product.units_in_stock, 39);
    assert.equal(product.discontinued, false);
    assert.equal(product.available, true);
  });

  test('include_unavailable=true incluye descontinuados y sin stock', async () => {
    const response = await api()
      .get('/products')
      .query({ include_unavailable: 'true', limit: 100 })
      .expect(200);
    const ids = response.body.data.map((p) => p.product_id);
    assert.ok(ids.includes(5));
    assert.ok(ids.includes(6));
    assert.ok(ids.includes(7));
    assert.equal(response.body.meta.filter, 'todos los productos');
  });

  test('rechaza include_unavailable con valor invalido', async () => {
    const response = await api().get('/products').query({ include_unavailable: 'si' }).expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });
});

describe('GET /shippers', () => {
  test('devuelve los transportistas disponibles', async () => {
    const response = await api().get('/shippers').expect(200);
    assert.ok(response.body.data.length >= 1);
    assert.ok('shipper_id' in response.body.data[0]);
    assert.ok('company_name' in response.body.data[0]);
  });
});
