'use strict';

const { test, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  api,
  resetDatabase,
  closePool,
  getStock,
  countRows,
  validOrder,
  assertErrorShape
} = require('./helpers/testContext');

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await closePool();
});

describe('POST /orders - creacion exitosa', () => {
  test('crea cabecera y varios detalles, calcula importes y responde 201 con Location', async () => {
    const stockBefore = { p1: await getStock(1), p3: await getStock(3) };

    const response = await api()
      .post('/orders')
      .set('Content-Type', 'application/json')
      .send(validOrder())
      .expect(201);

    assert.equal(response.body.success, true);
    assert.equal(response.body.message, 'Orden creada correctamente');

    const order = response.body.data;
    assert.ok(Number.isInteger(order.order_id), 'order_id debe ser entero');
    assert.equal(response.headers.location, `/orders/${order.order_id}`);

    // Cabecera
    assert.equal(order.customer.customer_id, 'ALFKI');
    assert.equal(order.customer.company_name, 'Alfreds Futterkiste');
    assert.equal(order.employee.employee_id, 5);
    assert.equal(order.employee.first_name, 'Steven');
    assert.equal(order.order_date, '2026-09-09');
    assert.equal(order.required_date, '2026-09-16');
    assert.equal(order.shipped_date, null, 'shipped_date debe quedar NULL al crear');
    assert.equal(order.shipper.shipper_id, 2);

    // Detalles: precios tomados de PostgreSQL, no del cliente
    assert.equal(order.items.length, 2);
    const chai = order.items.find((i) => i.product_id === 1);
    const anis = order.items.find((i) => i.product_id === 3);
    assert.equal(chai.unit_price, 18);
    assert.equal(chai.quantity, 2);
    assert.equal(chai.line_gross_amount, 36);
    assert.equal(chai.line_discount_amount, 0);
    assert.equal(chai.line_total, 36);
    assert.equal(anis.unit_price, 10);
    assert.equal(anis.line_gross_amount, 10);
    assert.equal(anis.line_discount_amount, 1);
    assert.equal(anis.line_total, 9);

    // Totales
    assert.deepEqual(order.amounts, {
      subtotal: 46,
      discount_total: 1,
      products_total: 45,
      freight: 5.5,
      total: 50.5,
      currency: null
    });

    // El trigger descuenta el stock exactamente una vez
    assert.equal(await getStock(1), stockBefore.p1 - 2);
    assert.equal(await getStock(3), stockBefore.p3 - 1);
  });

  test('el order_id se genera en PostgreSQL y no colisiona con datos existentes', async () => {
    const response = await api().post('/orders').send(validOrder()).expect(201);
    assert.ok(response.body.data.order_id > 10248, 'debe continuar despues del MAX(order_id) previo');
  });

  test('ignora cualquier order_id, unit_price o total enviado por el cliente', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ order_id: 1, total: 999 }))
      .expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });

  test('discount es opcional y por defecto 0', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ items: [{ product_id: 1, quantity: 1 }] }))
      .expect(201);
    assert.equal(response.body.data.items[0].discount, 0);
    assert.equal(response.body.data.items[0].line_total, 18);
  });

  test('los campos opcionales pueden omitirse', async () => {
    const response = await api()
      .post('/orders')
      .send({
        customer_id: 'ANATR',
        employee_id: 1,
        order_date: '2026-09-10',
        items: [{ product_id: 4, quantity: 3 }]
      })
      .expect(201);
    const order = response.body.data;
    assert.equal(order.required_date, null);
    assert.equal(order.shipper, null);
    assert.equal(order.amounts.freight, 0);
    assert.equal(order.amounts.total, 66);
  });
});

describe('POST /orders - validaciones de estructura', () => {
  test('rechaza cuerpo vacio', async () => {
    const response = await api().post('/orders').send({}).expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });

  test('rechaza un arreglo en lugar de un objeto', async () => {
    const response = await api().post('/orders').send([]).expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });

  test('rechaza campos desconocidos', async () => {
    const response = await api().post('/orders').send(validOrder({ campo_raro: 1 })).expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
    assert.ok(response.body.error.details.some((d) => d.issue === 'unrecognized_keys'));
  });

  test('rechaza campos desconocidos dentro de items', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ items: [{ product_id: 1, quantity: 1, precio: 5 }] }))
      .expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });

  test('rechaza items vacio', async () => {
    const response = await api().post('/orders').send(validOrder({ items: [] })).expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });

  test('rechaza items que no son objetos', async () => {
    const response = await api().post('/orders').send(validOrder({ items: [3] })).expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });

  test('rechaza customer_id vacio', async () => {
    const response = await api().post('/orders').send(validOrder({ customer_id: '' })).expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });

  test('rechaza customer_id de mas de 5 caracteres', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ customer_id: 'ALFKIX' }))
      .expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });

  test('rechaza employee_id no entero, negativo o fuera del rango smallint', async () => {
    for (const employeeId of [0, -1, 2.5, 40000]) {
      const response = await api()
        .post('/orders')
        .send(validOrder({ employee_id: employeeId }))
        .expect(400);
      assertErrorShape(response.body, 'VALIDATION_ERROR');
    }
  });

  test('rechaza cadenas numericas donde el contrato exige numeros', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ employee_id: '5' }))
      .expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });

  test('rechaza fechas con formato invalido o inexistentes', async () => {
    for (const orderDate of ['09-09-2026', '2026/09/09', '2026-02-30', '2026-13-01', 'hoy']) {
      const response = await api()
        .post('/orders')
        .send(validOrder({ order_date: orderDate, required_date: null }))
        .expect(400);
      assertErrorShape(response.body, 'VALIDATION_ERROR');
    }
  });

  test('rechaza required_date anterior a order_date', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ order_date: '2026-09-09', required_date: '2026-09-08' }))
      .expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
    assert.ok(response.body.error.details.some((d) => d.field === 'required_date'));
  });

  test('acepta required_date igual a order_date', async () => {
    await api()
      .post('/orders')
      .send(validOrder({ order_date: '2026-09-09', required_date: '2026-09-09' }))
      .expect(201);
  });

  test('rechaza cantidad cero, negativa, decimal o fuera de rango', async () => {
    for (const quantity of [0, -3, 1.5, 32768]) {
      const response = await api()
        .post('/orders')
        .send(validOrder({ items: [{ product_id: 1, quantity, discount: 0 }] }))
        .expect(400);
      assertErrorShape(response.body, 'VALIDATION_ERROR');
    }
    assert.equal(await countRows('orders'), 1, 'ninguna orden debio crearse');
  });

  test('rechaza descuento fuera del rango 0..1 y no finito', async () => {
    for (const discount of [-0.1, 1.1, 2]) {
      const response = await api()
        .post('/orders')
        .send(validOrder({ items: [{ product_id: 1, quantity: 1, discount }] }))
        .expect(400);
      assertErrorShape(response.body, 'VALIDATION_ERROR');
    }
  });

  test('acepta descuento en los limites 0 y 1', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ items: [{ product_id: 1, quantity: 1, discount: 1 }] }))
      .expect(201);
    assert.equal(response.body.data.items[0].line_total, 0);
  });

  test('rechaza freight negativo', async () => {
    const response = await api().post('/orders').send(validOrder({ freight: -1 })).expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });

  test('rechaza campos de envio demasiado largos', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ ship_city: 'x'.repeat(16) }))
      .expect(400);
    assertErrorShape(response.body, 'VALIDATION_ERROR');
  });

  test('rechaza productos repetidos con mensaje claro', async () => {
    const response = await api()
      .post('/orders')
      .send(
        validOrder({
          items: [
            { product_id: 1, quantity: 1, discount: 0 },
            { product_id: 1, quantity: 2, discount: 0 }
          ]
        })
      )
      .expect(400);
    assertErrorShape(response.body, 'DUPLICATE_PRODUCT');
    assert.deepEqual(response.body.error.details, [{ product_id: 1 }]);
    assert.match(response.body.message, /una sola vez/i);
    assert.equal(await countRows('orders'), 1);
  });
});

describe('POST /orders - entidades y disponibilidad', () => {
  test('404 si el cliente no existe', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ customer_id: 'ZZZZZ' }))
      .expect(404);
    assertErrorShape(response.body, 'CUSTOMER_NOT_FOUND');
  });

  test('404 si el empleado no existe', async () => {
    const response = await api().post('/orders').send(validOrder({ employee_id: 999 })).expect(404);
    assertErrorShape(response.body, 'EMPLOYEE_NOT_FOUND');
  });

  test('404 si el transportista no existe', async () => {
    const response = await api().post('/orders').send(validOrder({ ship_via: 99 })).expect(404);
    assertErrorShape(response.body, 'SHIPPER_NOT_FOUND');
  });

  test('404 si el producto no existe', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ items: [{ product_id: 9999, quantity: 1 }] }))
      .expect(404);
    assertErrorShape(response.body, 'PRODUCT_NOT_FOUND');
    assert.deepEqual(response.body.error.details, [{ product_id: 9999 }]);
  });

  test('409 si el producto esta descontinuado', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ items: [{ product_id: 5, quantity: 1 }] }))
      .expect(409);
    assertErrorShape(response.body, 'PRODUCT_DISCONTINUED');
    assert.equal(await getStock(5), 20, 'el stock del descontinuado no debe cambiar');
  });

  test('409 si el precio del producto es NULL', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ items: [{ product_id: 6, quantity: 1 }] }))
      .expect(409);
    assertErrorShape(response.body, 'PRODUCT_PRICE_UNAVAILABLE');
  });

  test('409 si el stock es NULL (NULL no es disponibilidad)', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ items: [{ product_id: 7, quantity: 1 }] }))
      .expect(409);
    assertErrorShape(response.body, 'INSUFFICIENT_STOCK');
    assert.deepEqual(response.body.error.details, [
      { product_id: 7, requested: 1, available: null }
    ]);
    assert.equal(await getStock(7), null, 'el stock NULL debe permanecer NULL');
  });

  test('409 con detalle de disponibilidad si el stock es insuficiente', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ items: [{ product_id: 3, quantity: 20, discount: 0 }] }))
      .expect(409);
    assertErrorShape(response.body, 'INSUFFICIENT_STOCK');
    assert.deepEqual(response.body.error.details, [
      { product_id: 3, requested: 20, available: 13 }
    ]);
    assert.equal(await getStock(3), 13, 'no debe descontarse stock');
    assert.equal(await countRows('orders'), 1, 'no debe crearse la cabecera');
  });

  test('un producto invalido cancela toda la orden (nada parcial)', async () => {
    const detailsBefore = await countRows('order_details');
    const response = await api()
      .post('/orders')
      .send(
        validOrder({
          items: [
            { product_id: 1, quantity: 1, discount: 0 },
            { product_id: 3, quantity: 500, discount: 0 }
          ]
        })
      )
      .expect(409);
    assertErrorShape(response.body, 'INSUFFICIENT_STOCK');
    assert.equal(await getStock(1), 39, 'el producto valido tampoco debe descontarse');
    assert.equal(await countRows('order_details'), detailsBefore);
    assert.equal(await countRows('orders'), 1);
  });

  test('permite vender exactamente todo el stock disponible', async () => {
    const response = await api()
      .post('/orders')
      .send(validOrder({ items: [{ product_id: 8, quantity: 2, discount: 0 }] }))
      .expect(201);
    assert.equal(response.body.data.items[0].line_total, 51);
    assert.equal(await getStock(8), 0);
  });
});
