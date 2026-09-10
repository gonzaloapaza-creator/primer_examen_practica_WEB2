'use strict';

const Decimal = require('decimal.js');

// Politica de redondeo unica para todo el proyecto:
// - 2 decimales,
// - redondeo half-up (0.005 -> 0.01),
// - los calculos intermedios usan Decimal, nunca aritmetica binaria de JS.
//
// Nota sobre precision: las columnas unit_price, discount y freight de Northwind
// son de tipo `real` (float4, ~7 digitos significativos). El valor que devuelve
// PostgreSQL es la representacion decimal mas corta que reconstruye ese float, y
// es esa cadena la que convertimos a Decimal. Para importes grandes o descuentos
// con muchos decimales el tipo `real` puede introducir un error de origen que
// ningun redondeo posterior puede recuperar. No cambiamos los tipos del esquema.
const DECIMAL_PLACES = 2;
const ROUNDING = Decimal.ROUND_HALF_UP;

Decimal.set({ precision: 34, rounding: ROUNDING, toExpNeg: -9e15, toExpPos: 9e15 });

/** Convierte un valor de PostgreSQL (number | string | null) a Decimal exacto. */
function toDecimal(value) {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  return new Decimal(String(value));
}

function round2(decimalValue) {
  return decimalValue.toDecimalPlaces(DECIMAL_PLACES, ROUNDING);
}

/** Numero JS ya redondeado a 2 decimales, apto para serializar en JSON. */
function toAmount(decimalValue) {
  return round2(decimalValue).toNumber();
}

/**
 * Calcula los importes de una linea a partir de los valores almacenados.
 * @param {{unit_price: *, quantity: *, discount: *}} line
 */
function computeLineAmounts(line) {
  const unitPrice = toDecimal(line.unit_price);
  const quantity = toDecimal(line.quantity);
  const discountRate = toDecimal(line.discount);

  const gross = round2(unitPrice.times(quantity));
  const discountAmount = round2(gross.times(discountRate));
  const lineTotal = round2(gross.minus(discountAmount));

  return {
    gross,
    discountAmount,
    lineTotal,
    json: {
      line_gross_amount: toAmount(gross),
      line_discount_amount: toAmount(discountAmount),
      line_total: toAmount(lineTotal)
    }
  };
}

/**
 * Totaliza la orden.
 * @param {Array<{gross: Decimal, discountAmount: Decimal, lineTotal: Decimal}>} lines
 * @param {*} freight valor almacenado en orders.freight (puede ser NULL)
 */
function computeOrderTotals(lines, freight) {
  const zero = new Decimal(0);
  const subtotal = lines.reduce((acc, l) => acc.plus(l.gross), zero);
  const discountTotal = lines.reduce((acc, l) => acc.plus(l.discountAmount), zero);
  const productsTotal = lines.reduce((acc, l) => acc.plus(l.lineTotal), zero);
  const freightDecimal = round2(toDecimal(freight));
  const total = round2(productsTotal.plus(freightDecimal));

  return {
    subtotal: toAmount(subtotal),
    discount_total: toAmount(discountTotal),
    products_total: toAmount(productsTotal),
    freight: toAmount(freightDecimal),
    total: toAmount(total),
    currency: null // El esquema de Northwind no define moneda; no se inventa ninguna.
  };
}

module.exports = {
  DECIMAL_PLACES,
  toDecimal,
  round2,
  toAmount,
  computeLineAmounts,
  computeOrderTotals
};
