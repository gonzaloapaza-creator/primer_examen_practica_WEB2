'use strict';

/** Pruebas unitarias de la politica de importes (no requieren base de datos). */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { computeLineAmounts, computeOrderTotals } = require('../src/utils/money');

describe('Politica de importes', () => {
  test('calcula bruto, descuento y total de linea', () => {
    const line = computeLineAmounts({ unit_price: 18, quantity: 2, discount: 0.1 });
    assert.equal(line.json.line_gross_amount, 36);
    assert.equal(line.json.line_discount_amount, 3.6);
    assert.equal(line.json.line_total, 32.4);
  });

  test('evita los errores de la aritmetica binaria de JavaScript', () => {
    // 0.1 * 3 === 0.30000000000000004 en JS puro.
    const line = computeLineAmounts({ unit_price: 0.1, quantity: 3, discount: 0 });
    assert.equal(line.json.line_gross_amount, 0.3);

    const line2 = computeLineAmounts({ unit_price: 1.005, quantity: 1, discount: 0 });
    assert.equal(line2.json.line_gross_amount, 1.01, 'redondeo half-up a 2 decimales');
  });

  test('trata valores nulos como cero sin lanzar', () => {
    const line = computeLineAmounts({ unit_price: null, quantity: 5, discount: null });
    assert.equal(line.json.line_gross_amount, 0);
    assert.equal(line.json.line_total, 0);
  });

  test('totaliza la orden y suma el flete', () => {
    const lines = [
      computeLineAmounts({ unit_price: 18, quantity: 2, discount: 0 }),
      computeLineAmounts({ unit_price: 10, quantity: 1, discount: 0.1 })
    ];
    const totals = computeOrderTotals(lines, 5.5);
    assert.deepEqual(totals, {
      subtotal: 46,
      discount_total: 1,
      products_total: 45,
      freight: 5.5,
      total: 50.5,
      currency: null
    });
  });

  test('flete NULL cuenta como 0', () => {
    const lines = [computeLineAmounts({ unit_price: 22, quantity: 3, discount: 0 })];
    const totals = computeOrderTotals(lines, null);
    assert.equal(totals.freight, 0);
    assert.equal(totals.total, 66);
  });

  test('un descuento de 1 anula el total de la linea', () => {
    const line = computeLineAmounts({ unit_price: 25.5, quantity: 4, discount: 1 });
    assert.equal(line.json.line_gross_amount, 102);
    assert.equal(line.json.line_discount_amount, 102);
    assert.equal(line.json.line_total, 0);
  });
});
