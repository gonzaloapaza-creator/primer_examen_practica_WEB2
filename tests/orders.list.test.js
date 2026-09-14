'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');

const { api, resetDatabase, closePool, validOrder, assertErrorShape } = require('./helpers/testContext');

let primera;
let segunda;

before(async () => {
  await resetDatabase();

  const uno = await api().post('/orders').send(validOrder()).expect(201);
  primera = uno.body.data;

  const dos = await api()
    .post('/orders')
    .send(
      validOrder({
        customer_id: 'ANATR',
        employee_id: 2,
        order_date: '2026-09-11',
        required_date: '2026-09-20',
        items: [{ product_id: 4, quantity: 1, discount: 0 }]
      })
    )
    .expect(201);
  segunda = dos.body.data;
});

after(async () => {
  await closePool();
});

describe('GET /orders', () => {
  test('lista las ordenes mas recientes primero con meta de paginacion', async () => {
    const { body } = await api().get('/orders').expect(200);

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    // 2 creadas por la API + 1 historica de la semilla (10248).
    assert.equal(body.meta.total, 3);
    assert.equal(body.meta.returned, body.data.length);
    assert.equal(body.meta.limit, 20);
    assert.equal(body.meta.offset, 0);

    const ids = body.data.map((order) => order.order_id);
    assert.deepEqual(ids, [...ids].sort((a, b) => b - a), 'debe ordenar por order_id descendente');
    assert.equal(ids[0], segunda.order_id);
  });

  test('el resumen no expone lineas pero si importes consistentes con GET /orders/:id', async () => {
    const { body } = await api().get('/orders').expect(200);
    const resumen = body.data.find((order) => order.order_id === primera.order_id);

    assert.equal(resumen.items, undefined, 'el listado no debe incluir las lineas');
    assert.equal(resumen.items_count, primera.items.length);
    assert.deepEqual(resumen.amounts, primera.amounts);
    assert.equal(resumen.customer.customer_id, 'ALFKI');
    assert.equal(resumen.customer.company_name, 'Alfreds Futterkiste');
    assert.equal(resumen.employee.last_name, 'Buchanan');
  });

  test('calcula importes de ordenes historicas cargadas directamente en la base', async () => {
    const { body } = await api().get('/orders?customer_id=ALFKI&employee_id=1').expect(200);

    assert.equal(body.meta.total, 1);
    assert.equal(body.data[0].order_id, 10248);
    assert.equal(body.data[0].items_count, 1);
    assert.equal(body.data[0].amounts.subtotal, 110);
    assert.equal(body.data[0].amounts.total, 142.38);
  });

  test('filtra por customer_id', async () => {
    const { body } = await api().get('/orders?customer_id=ANATR').expect(200);
    assert.equal(body.meta.total, 1);
    assert.equal(body.data[0].order_id, segunda.order_id);
  });

  test('filtra por employee_id', async () => {
    const { body } = await api().get('/orders?employee_id=5').expect(200);
    assert.equal(body.meta.total, 1);
    assert.equal(body.data[0].order_id, primera.order_id);
  });

  test('filtra por rango de fechas (from/to inclusivos)', async () => {
    const soloSemilla = await api().get('/orders?from=2025-01-01&to=2025-12-31').expect(200);
    assert.deepEqual(
      soloSemilla.body.data.map((o) => o.order_id),
      [10248]
    );

    const unDia = await api().get('/orders?from=2026-09-11&to=2026-09-11').expect(200);
    assert.deepEqual(
      unDia.body.data.map((o) => o.order_id),
      [segunda.order_id]
    );
  });

  test('devuelve una lista vacia (no 404) si ningun filtro coincide', async () => {
    const { body } = await api().get('/orders?customer_id=BLAUS').expect(200);
    assert.deepEqual(body.data, []);
    assert.equal(body.meta.total, 0);
    assert.equal(body.meta.returned, 0);
  });

  test('respeta limit y offset', async () => {
    const pagina1 = await api().get('/orders?limit=1&offset=0').expect(200);
    const pagina2 = await api().get('/orders?limit=1&offset=1').expect(200);

    assert.equal(pagina1.body.data.length, 1);
    assert.equal(pagina2.body.data.length, 1);
    assert.equal(pagina1.body.meta.total, 3);
    assert.notEqual(pagina1.body.data[0].order_id, pagina2.body.data[0].order_id);
  });

  test('rechaza parametros de consulta invalidos', async () => {
    const casos = [
      '/orders?limit=0',
      '/orders?limit=101',
      '/orders?offset=-1',
      '/orders?employee_id=abc',
      '/orders?customer_id=DEMASIADOLARGO',
      '/orders?from=2026-13-01',
      '/orders?from=2026-09-11&to=2026-09-10',
      '/orders?desconocido=1'
    ];

    for (const url of casos) {
      const response = await api().get(url).expect(400);
      assertErrorShape(response.body, 'VALIDATION_ERROR');
    }
  });

  test('trata la busqueda con comillas como dato literal (sin inyeccion SQL)', async () => {
    const { body } = await api()
      .get(`/orders?customer_id=${encodeURIComponent("A'; DROP")}`)
      .expect(400);
    assertErrorShape(body, 'VALIDATION_ERROR');

    const vivo = await api().get('/orders').expect(200);
    assert.equal(vivo.body.meta.total, 3, 'la tabla orders debe seguir intacta');
  });
});
