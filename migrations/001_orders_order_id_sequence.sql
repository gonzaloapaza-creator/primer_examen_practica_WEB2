-- =====================================================================
-- Migracion 001: generacion segura de public.orders.order_id
-- Proyecto: API REST de ordenes Northwind (Tecnologias Web II - UCB)
-- =====================================================================
--
-- PROBLEMA
--   En la instalacion analizada, public.orders.order_id es smallint, es clave
--   primaria y NO tiene identidad, NI valor por defecto, NI secuencia asociada.
--   Por lo tanto un INSERT sin order_id falla, y calcular MAX(order_id)+1 en
--   cada solicitud produce duplicados bajo concurrencia.
--
-- SOLUCION
--   Crear la secuencia public.orders_order_id_seq, inicializarla a partir de los
--   datos existentes, usarla como DEFAULT de la columna y asociarla (OWNED BY)
--   para que su ciclo de vida siga a la columna.
--
-- GARANTIAS
--   * No borra, no trunca y no modifica ninguna orden existente.
--   * Es idempotente: puede ejecutarse varias veces sin duplicar ni reiniciar.
--   * Nunca retrocede una secuencia que ya avanzo.
--   * Aborta si encuentra una configuracion inesperada (identidad u otro DEFAULT).
--   * Toma LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE: bloquea inserciones
--     concurrentes mientras se calcula MAX(order_id), pero permite lecturas.
--
-- LIMITACION DOCUMENTADA (smallint)
--   smallint admite como maximo 32767. La secuencia se declara "AS smallint" y
--   NO CYCLE, por lo que al agotarse PostgreSQL emitira el error 2200H y la API
--   respondera 409 ORDER_ID_LIMIT_REACHED en lugar de generar duplicados.
--   Con MAX(order_id)=11080 quedan ~21687 ordenes disponibles. Ampliar la
--   columna a integer implica migrar tambien order_details.order_id y todas las
--   claves foraneas; NO se hace aqui y se documenta como trabajo aparte.
--
-- NOTA SOBRE setval
--   Las secuencias no son transaccionales: si esta transaccion falla despues de
--   setval, el valor de la secuencia queda avanzado. Eso es seguro (solo puede
--   dejar huecos, nunca duplicados).
--
-- EJECUCION
--   pgAdmin  : abrir Query Tool sobre la base "northwind" y ejecutar (F5).
--   Terminal : npm run db:migrate
--              (o) psql -h localhost -U postgres -d northwind -v ON_ERROR_STOP=1 \
--                       -f migrations/001_orders_order_id_sequence.sql
-- =====================================================================

BEGIN;

-- Bloquea escrituras sobre orders durante la preparacion (permite lecturas).
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;

DO $migracion$
DECLARE
    c_sequence   constant text := 'public.orders_order_id_seq';
    c_smallint_max constant bigint := 32767;
    v_data_type  text;
    v_identity   text;
    v_default    text;
    v_seq_exists boolean;
    v_max_id     bigint;
    v_last_value bigint;
    v_trigger_enabled char;
BEGIN
    ------------------------------------------------------------------
    -- 1. Verificar que la columna existe y detectar configuraciones raras
    ------------------------------------------------------------------
    SELECT data_type, is_identity, column_default
      INTO v_data_type, v_identity, v_default
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'orders'
       AND column_name  = 'order_id';

    IF v_data_type IS NULL THEN
        RAISE EXCEPTION
            'No se encontro la columna public.orders.order_id. Verifique que esta conectado a la base northwind.';
    END IF;

    IF v_identity = 'YES' THEN
        RAISE EXCEPTION
            'public.orders.order_id ya es una columna GENERATED AS IDENTITY. La migracion se aborta para no sobrescribir esa configuracion.';
    END IF;

    IF v_default IS NOT NULL AND v_default NOT LIKE '%orders_order_id_seq%' THEN
        RAISE EXCEPTION
            'public.orders.order_id ya tiene un DEFAULT inesperado (%). Reviselo manualmente antes de migrar.', v_default;
    END IF;

    IF v_data_type <> 'smallint' THEN
        RAISE NOTICE
            'AVISO: order_id es de tipo % (se esperaba smallint). La migracion continua; revise los limites del tipo.', v_data_type;
    END IF;

    ------------------------------------------------------------------
    -- 2. Crear la secuencia solo si no existe
    ------------------------------------------------------------------
    SELECT EXISTS (
        SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'S'
           AND n.nspname = 'public'
           AND c.relname = 'orders_order_id_seq'
    ) INTO v_seq_exists;

    IF NOT v_seq_exists THEN
        -- "AS smallint" fija automaticamente MAXVALUE 32767.
        EXECUTE 'CREATE SEQUENCE public.orders_order_id_seq AS smallint '
             || 'INCREMENT BY 1 MINVALUE 1 START WITH 1 NO CYCLE';
        RAISE NOTICE 'Secuencia % creada.', c_sequence;
    ELSE
        RAISE NOTICE 'Secuencia % ya existe: no se recrea.', c_sequence;
    END IF;

    ------------------------------------------------------------------
    -- 3. Inicializar la secuencia sin retroceder nunca
    ------------------------------------------------------------------
    SELECT COALESCE(MAX(order_id), 0) INTO v_max_id FROM public.orders;

    -- last_value es NULL mientras la secuencia no haya sido usada.
    SELECT last_value
      INTO v_last_value
      FROM pg_sequences
     WHERE schemaname = 'public'
       AND sequencename = 'orders_order_id_seq';

    IF v_last_value IS NULL THEN
        IF v_max_id >= 1 THEN
            PERFORM setval(c_sequence::regclass, v_max_id, true);
            RAISE NOTICE 'Secuencia inicializada en % (MAX(order_id) actual).', v_max_id;
        ELSE
            PERFORM setval(c_sequence::regclass, 1, false);
            RAISE NOTICE 'Tabla orders vacia: el proximo order_id sera 1.';
        END IF;
    ELSIF v_max_id > v_last_value THEN
        PERFORM setval(c_sequence::regclass, v_max_id, true);
        RAISE NOTICE 'Secuencia adelantada de % a % para no colisionar con datos existentes.',
                     v_last_value, v_max_id;
    ELSE
        RAISE NOTICE 'Secuencia ya en % (>= MAX(order_id)=%): no se retrocede.',
                     v_last_value, v_max_id;
    END IF;

    ------------------------------------------------------------------
    -- 4. DEFAULT y asociacion de la secuencia a la columna
    ------------------------------------------------------------------
    IF v_default IS NULL THEN
        EXECUTE 'ALTER TABLE public.orders '
             || 'ALTER COLUMN order_id SET DEFAULT nextval(''public.orders_order_id_seq''::regclass)';
        RAISE NOTICE 'DEFAULT nextval(%) aplicado a orders.order_id.', c_sequence;
    ELSE
        RAISE NOTICE 'orders.order_id ya usa la secuencia como DEFAULT: sin cambios.';
    END IF;

    EXECUTE 'ALTER SEQUENCE public.orders_order_id_seq OWNED BY public.orders.order_id';
    EXECUTE 'ALTER TABLE public.orders ALTER COLUMN order_id SET NOT NULL';

    ------------------------------------------------------------------
    -- 5. Informar capacidad restante del tipo smallint
    ------------------------------------------------------------------
    SELECT last_value INTO v_last_value
      FROM pg_sequences
     WHERE schemaname = 'public' AND sequencename = 'orders_order_id_seq';

    RAISE NOTICE 'Capacidad restante de order_id (smallint): % identificadores.',
                 c_smallint_max - COALESCE(v_last_value, 0);

    IF c_smallint_max - COALESCE(v_last_value, 0) < 1000 THEN
        RAISE WARNING 'Quedan menos de 1000 identificadores de orden disponibles (limite smallint).';
    END IF;

    ------------------------------------------------------------------
    -- 6. Verificar el trigger de inventario (solo informativo)
    ------------------------------------------------------------------
    SELECT t.tgenabled
      INTO v_trigger_enabled
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'order_details'
       AND t.tgname  = 'trg_descontar_stock'
       AND NOT t.tgisinternal;

    IF v_trigger_enabled IS NULL THEN
        RAISE WARNING 'No se encontro el trigger trg_descontar_stock en public.order_details: el stock NO se descontara.';
    ELSIF v_trigger_enabled = 'D' THEN
        RAISE WARNING 'El trigger trg_descontar_stock existe pero esta DESHABILITADO.';
    ELSE
        RAISE NOTICE 'Trigger trg_descontar_stock presente y habilitado (tgenabled=%).', v_trigger_enabled;
    END IF;
END
$migracion$;

COMMIT;

-- Verificacion posterior sugerida:
--   SELECT column_default FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='orders' AND column_name='order_id';
--   SELECT last_value, max_value FROM pg_sequences
--    WHERE schemaname='public' AND sequencename='orders_order_id_seq';
