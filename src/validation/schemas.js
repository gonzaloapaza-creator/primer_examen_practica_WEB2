'use strict';

const { z } = require('zod');

const SMALLINT_MAX = 32767;

/** Verifica que una cadena YYYY-MM-DD sea una fecha real (rechaza 2026-02-30). */
function isRealCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const isoDate = z
  .string({ invalid_type_error: 'Debe ser una cadena con formato YYYY-MM-DD' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'El formato debe ser YYYY-MM-DD')
  .refine(isRealCalendarDate, 'La fecha no existe en el calendario');

const smallintId = (fieldName) =>
  z
    .number({ invalid_type_error: `${fieldName} debe ser un numero (no una cadena)` })
    .int(`${fieldName} debe ser un entero`)
    .min(1, `${fieldName} debe ser mayor o igual a 1`)
    .max(SMALLINT_MAX, `${fieldName} excede el maximo del esquema (${SMALLINT_MAX})`);

const optionalText = (max, fieldName) =>
  z
    .string({ invalid_type_error: `${fieldName} debe ser una cadena` })
    .max(max, `${fieldName} admite como maximo ${max} caracteres`)
    .nullish();

const orderItemSchema = z
  .object({
    product_id: smallintId('product_id'),
    quantity: z
      .number({ invalid_type_error: 'quantity debe ser un numero (no una cadena)' })
      .int('quantity debe ser un entero, no se truncan decimales')
      .min(1, 'quantity debe ser al menos 1')
      .max(SMALLINT_MAX, `quantity excede el maximo del esquema (${SMALLINT_MAX})`),
    discount: z
      .number({ invalid_type_error: 'discount debe ser un numero (no una cadena)' })
      .finite('discount debe ser finito')
      .min(0, 'discount debe ser mayor o igual a 0')
      .max(1, 'discount debe ser menor o igual a 1')
      .default(0)
  })
  .strict();

const createOrderSchema = z
  .object({
    customer_id: z
      .string({ invalid_type_error: 'customer_id debe ser una cadena' })
      .trim()
      .min(1, 'customer_id no puede estar vacio')
      .max(5, 'customer_id admite como maximo 5 caracteres'),
    employee_id: smallintId('employee_id'),
    order_date: isoDate,
    required_date: isoDate.nullish(),
    ship_via: smallintId('ship_via').nullish(),
    freight: z
      .number({ invalid_type_error: 'freight debe ser un numero (no una cadena)' })
      .finite('freight debe ser finito')
      .min(0, 'freight no puede ser negativo')
      .nullish(),
    ship_name: optionalText(40, 'ship_name'),
    ship_address: optionalText(60, 'ship_address'),
    ship_city: optionalText(15, 'ship_city'),
    ship_region: optionalText(15, 'ship_region'),
    ship_postal_code: optionalText(10, 'ship_postal_code'),
    ship_country: optionalText(15, 'ship_country'),
    items: z
      .array(orderItemSchema, { invalid_type_error: 'items debe ser un arreglo de objetos' })
      .min(1, 'items no puede estar vacio')
      .max(200, 'items admite como maximo 200 lineas por orden')
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.required_date && value.required_date < value.order_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['required_date'],
        message: 'required_date debe ser igual o posterior a order_date'
      });
    }
  });

const listQuerySchema = z
  .object({
    q: z.string().trim().max(100, 'q admite como maximo 100 caracteres').optional(),
    limit: z.coerce
      .number({ invalid_type_error: 'limit debe ser numerico' })
      .int('limit debe ser entero')
      .min(1, 'limit debe ser al menos 1')
      .max(100, 'limit no puede exceder 100')
      .default(20),
    offset: z.coerce
      .number({ invalid_type_error: 'offset debe ser numerico' })
      .int('offset debe ser entero')
      .min(0, 'offset no puede ser negativo')
      .max(1000000, 'offset demasiado grande')
      .default(0)
  })
  .strict();

const productsQuerySchema = listQuerySchema.extend({
  // Filtro documentado: incluye productos descontinuados, sin stock o sin precio.
  // Esos productos NO pueden venderse por POST /orders.
  include_unavailable: z
    .enum(['true', 'false'], { invalid_type_error: 'include_unavailable debe ser true o false' })
    .default('false')
    .transform((v) => v === 'true')
});

const orderIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'El identificador de orden debe ser un entero positivo')
    .transform(Number)
    .refine((n) => n >= 1 && n <= SMALLINT_MAX, `El identificador debe estar entre 1 y ${SMALLINT_MAX}`)
});

module.exports = {
  SMALLINT_MAX,
  isRealCalendarDate,
  createOrderSchema,
  orderItemSchema,
  listQuerySchema,
  productsQuerySchema,
  orderIdParamSchema
};
