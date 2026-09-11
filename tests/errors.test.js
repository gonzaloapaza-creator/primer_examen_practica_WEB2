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

describe('Manejo centralizado de errores', () => {
  test('400 e INVALID_JSON con un cuerpo JSON mal formado', async () => {
    const response = await api()
      .post('/orders')
      .set('Content-Type', 'application/json')
      .send('{"customer_id": "ALFKI", ')
      .expect(400);
    assertErrorShape(response.body, 'INVALID_JSON');
  });

  test('415 cuando el Content-Type no es application/json', async () => {
    const response = await api()
      .post('/orders')
      .set('Content-Type', 'text/plain')
      .send('customer_id=ALFKI')
      .expect(415);
    assertErrorShape(response.body, 'UNSUPPORTED_MEDIA_TYPE');
  });

  test('415 con formularios url-encoded', async () => {
    const response = await api()
      .post('/orders')
      .type('form')
      .send({ customer_id: 'ALFKI' })
      .expect(415);
    assertErrorShape(response.body, 'UNSUPPORTED_MEDIA_TYPE');
  });

  test('404 JSON (no HTML) para rutas inexistentes', async () => {
    const response = await api().get('/no-existe').expect(404);
    assert.match(response.headers['content-type'], /application\/json/);
    assertErrorShape(response.body, 'ROUTE_NOT_FOUND');
  });

  test('404 JSON para metodos no implementados sobre una ruta existente', async () => {
    const response = await api().delete('/orders/1').expect(404);
    assertErrorShape(response.body, 'ROUTE_NOT_FOUND');
  });

  test('las respuestas de error no filtran SQL, stack traces ni credenciales', async () => {
    const response = await api().get('/orders/99999').expect(400);
    const serialized = JSON.stringify(response.body);
    for (const forbidden of ['SELECT', 'INSERT', 'pg_', 'password', 'at Object.', 'node_modules']) {
      assert.ok(!serialized.includes(forbidden), `no debe contener "${forbidden}"`);
    }
  });

  test('incluye cabeceras de seguridad de helmet y oculta x-powered-by', async () => {
    const response = await api().get('/health').expect(200);
    assert.equal(response.headers['x-powered-by'], undefined);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.ok(response.headers['x-frame-options'] || response.headers['content-security-policy']);
  });

  test('GET /health confirma la conexion a la base', async () => {
    const response = await api().get('/health').expect(200);
    assert.equal(response.body.data.database, 'ok');
  });

  test('rechaza un cuerpo JSON que excede el limite configurado', async () => {
    const huge = { customer_id: 'ALFKI', relleno: 'x'.repeat(200 * 1024) };
    const response = await api().post('/orders').send(huge);
    assert.equal(response.status, 413);
    assertErrorShape(response.body, 'PAYLOAD_TOO_LARGE');
  });
});
