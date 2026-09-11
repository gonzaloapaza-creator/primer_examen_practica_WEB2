-- =====================================================================
-- Datos semilla de la base de pruebas (northwind_test)
-- =====================================================================
-- Incluye a proposito casos borde: producto descontinuado, precio NULL,
-- stock NULL y stock muy bajo, para poder probar cada validacion.
-- =====================================================================

TRUNCATE TABLE public.order_details, public.orders;
DELETE FROM public.products;
DELETE FROM public.customers;
DELETE FROM public.employees;
DELETE FROM public.shippers;

INSERT INTO public.customers (customer_id, company_name, contact_name, contact_title, city, country) VALUES
  ('ALFKI', 'Alfreds Futterkiste',       'Maria Anders',  'Sales Representative', 'Berlin',      'Germany'),
  ('ANATR', 'Ana Trujillo Emparedados',  'Ana Trujillo',  'Owner',                'Mexico D.F.', 'Mexico'),
  ('BLAUS', 'Blauer See Delikatessen',   'Hanna Moos',    'Sales Representative', 'Mannheim',    'Germany');

INSERT INTO public.employees (employee_id, last_name, first_name, title, birth_date, home_phone) VALUES
  (1, 'Davolio',  'Nancy',  'Sales Representative', DATE '1968-12-08', '(206) 555-9857'),
  (2, 'Fuller',   'Andrew', 'Vice President Sales', DATE '1972-02-19', '(206) 555-9482'),
  (5, 'Buchanan', 'Steven', 'Sales Manager',        DATE '1975-03-04', '(71) 555-4848');

INSERT INTO public.shippers (shipper_id, company_name, phone) VALUES
  (1, 'Speedy Express',   '(503) 555-9831'),
  (2, 'United Package',   '(503) 555-3199'),
  (3, 'Federal Shipping', '(503) 555-9931');

INSERT INTO public.products
  (product_id, product_name, quantity_per_unit, unit_price, units_in_stock, units_on_order, reorder_level, discontinued) VALUES
  (1, 'Chai',                  '10 boxes x 20 bags', 18.00, 39,   0, 10, 0),
  (2, 'Chang',                 '24 - 12 oz bottles', 19.00, 17,  40, 25, 0),
  (3, 'Aniseed Syrup',         '12 - 550 ml bottles',10.00, 13,  70, 25, 0),
  (4, 'Chef Anton Cajun',      '48 - 6 oz jars',     22.00, 53,   0,  0, 0),
  (5, 'Producto Descontinuado','36 boxes',           21.35, 20,   0,  0, 1),
  (6, 'Producto Sin Precio',   '12 units',           NULL,  10,   0,  0, 0),
  (7, 'Producto Sin Stock',    '12 units',           15.00, NULL, 0,  0, 0),
  (8, 'Producto Stock Bajo',   '1 unit',             25.50, 2,    0,  0, 0),
  (9, 'Producto Stock Cero',   '1 unit',             30.00, 0,    0,  0, 0);

-- Orden historica para comprobar que la migracion 001 no reinicia la secuencia
-- y que los nuevos identificadores no colisionan con datos previos.
INSERT INTO public.orders (order_id, customer_id, employee_id, order_date, required_date, ship_via, freight)
VALUES (10248, 'ALFKI', 1, DATE '2025-01-15', DATE '2025-01-22', 1, 32.38);

INSERT INTO public.order_details (order_id, product_id, unit_price, quantity, discount)
VALUES (10248, 4, 22.00, 5, 0);

-- El INSERT anterior disparo trg_descontar_stock (53 -> 48). Se restituye para
-- que el estado inicial de las pruebas sea el declarado arriba.
UPDATE public.products SET units_in_stock = 53 WHERE product_id = 4;
