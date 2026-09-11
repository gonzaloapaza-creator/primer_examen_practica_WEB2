-- =====================================================================
-- Esquema COMPATIBLE para la base de pruebas aislada (northwind_test)
-- =====================================================================
-- No es una copia de Northwind: es el subconjunto minimo necesario para
-- ejercitar el flujo de ordenes, con los MISMOS nombres, tipos, claves y el
-- MISMO trigger de inventario confirmados en la instalacion del usuario.
--
-- Fuente de los tipos y restricciones: inspeccion del esquema descrito en el
-- enunciado del examen (public.customers, employees, products, orders,
-- order_details, shippers) y de la funcion public.descontar_stock().
--
-- Diferencias conocidas respecto a la base real:
--   * No se incluyen categories, suppliers, region, territories, employee_territories,
--     customer_demographics, customersales ni user_employee_map.
--   * products.supplier_id y products.category_id existen pero sin FK (no hay
--     tablas destino en esta base reducida).
--   * Los datos son de prueba, no los 91/9/80/832/2157/6 registros reales.
-- Todo lo que la API usa (columnas, tipos, PK/FK compuestas, trigger) es identico.
--
-- Este script SOLO debe ejecutarse contra una base cuyo nombre termina en _test.
-- =====================================================================

DROP TABLE IF EXISTS public.order_details CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP TABLE IF EXISTS public.shippers CASCADE;
DROP FUNCTION IF EXISTS public.descontar_stock() CASCADE;

CREATE TABLE public.customers (
    customer_id   varchar(5)  NOT NULL PRIMARY KEY,
    company_name  varchar(40) NOT NULL,
    contact_name  varchar(30),
    contact_title varchar(30),
    address       varchar(60),
    city          varchar(15),
    region        varchar(15),
    postal_code   varchar(10),
    country       varchar(15),
    phone         varchar(24),
    fax           varchar(24)
);

CREATE TABLE public.employees (
    employee_id      smallint    NOT NULL PRIMARY KEY,
    last_name        varchar(20) NOT NULL,
    first_name       varchar(10) NOT NULL,
    title            varchar(30),
    title_of_courtesy varchar(25),
    birth_date       date,
    hire_date        date,
    address          varchar(60),
    city             varchar(15),
    region           varchar(15),
    postal_code      varchar(10),
    country          varchar(15),
    home_phone       varchar(24),
    extension        varchar(4),
    notes            text,
    reports_to       smallint
);

CREATE TABLE public.shippers (
    shipper_id   smallint    NOT NULL PRIMARY KEY,
    company_name varchar(40) NOT NULL,
    phone        varchar(24)
);

CREATE TABLE public.products (
    product_id        smallint    NOT NULL PRIMARY KEY,
    product_name      varchar(40) NOT NULL,
    supplier_id       smallint,
    category_id       smallint,
    quantity_per_unit varchar(20),
    unit_price        real,
    units_in_stock    smallint,
    units_on_order    smallint,
    reorder_level     smallint,
    discontinued      integer     NOT NULL
);

CREATE TABLE public.orders (
    order_id         smallint NOT NULL PRIMARY KEY,
    customer_id      varchar(5) REFERENCES public.customers (customer_id),
    employee_id      smallint   REFERENCES public.employees (employee_id),
    order_date       date,
    required_date    date,
    shipped_date     date,
    ship_via         smallint   REFERENCES public.shippers (shipper_id),
    freight          real,
    ship_name        varchar(40),
    ship_address     varchar(60),
    ship_city        varchar(15),
    ship_region      varchar(15),
    ship_postal_code varchar(10),
    ship_country     varchar(15)
);

CREATE TABLE public.order_details (
    order_id   smallint NOT NULL REFERENCES public.orders (order_id),
    product_id smallint NOT NULL REFERENCES public.products (product_id),
    unit_price real     NOT NULL,
    quantity   smallint NOT NULL,
    discount   real     NOT NULL,
    CONSTRAINT pk_order_details PRIMARY KEY (order_id, product_id)
);

-- ---------------------------------------------------------------------
-- Reproduccion EXACTA del trigger de inventario existente en la base real.
-- Igual que el original, no valida cantidades positivas ni stock suficiente:
-- esa validacion es responsabilidad de la API (con SELECT ... FOR UPDATE).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.descontar_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE products
    SET units_in_stock = units_in_stock - NEW.quantity
    WHERE product_id = NEW.product_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_descontar_stock
AFTER INSERT ON public.order_details
FOR EACH ROW
EXECUTE FUNCTION public.descontar_stock();
