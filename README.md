# API REST de Órdenes de Venta — Northwind (PostgreSQL)

API REST en **Node.js + Express.js** que consulta clientes, empleados y productos de la base
**Northwind** en **PostgreSQL**, y genera órdenes de venta (cabecera + múltiples productos) de forma
**transaccional**, validando stock con bloqueo de filas y respetando el trigger de inventario ya
existente en la base.

---

## 1. Requisitos

| Componente | Versión | Verificación |
| --- | --- | --- |
| Node.js | >= 20.11.0 | `node --version` |
| npm | >= 10 | `npm --version` |
| PostgreSQL | 13+ | `psql --version` o pgAdmin |
| Base de datos | `northwind` con esquema `public` cargado | ver sección 4 |

## 2. Instalación

```powershell
npm install
```

## 3. Configuración de `.env`

```powershell
Copy-Item .env.example .env
```

Editar `.env` y colocar la contraseña real de PostgreSQL:

```dotenv
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=northwind
DB_USER=postgres
DB_PASSWORD=tu_password
CORS_ORIGIN=http://localhost:5173
JSON_BODY_LIMIT=100kb
DB_SSL=false
```

`.env` está en `.gitignore` y nunca se sube al repositorio. `CORS_ORIGIN` acepta varios orígenes
separados por coma, o `*` para pruebas locales (CORS no reemplaza autenticación).

## 4. Preparación de la base

Con la base `northwind` ya cargada, verificar el estado (solo lectura: conexión, tablas esperadas,
configuración de `orders.order_id` y estado del trigger de inventario):

```powershell
npm run db:check
```

Si reporta que falta la secuencia de `order_id`, aplicar la migración (idempotente, no borra datos):

```powershell
npm run db:migrate
```

### Base de pruebas (obligatoria para `npm test`)

Las pruebas automatizadas nunca corren contra la base real. Usan una base aislada `*_test`:

```powershell
Copy-Item .env.test.example .env.test
# editar .env.test y poner la contraseña; DB_NAME debe terminar en _test
npm run test:db:setup
```

`test:db:setup` crea la base si no existe y aplica el esquema y los datos semilla de
`migrations/testdb/`. Se niega a ejecutarse si `DB_NAME` no termina en `_test`.

## 5. Ejecución

```powershell
npm run dev     # desarrollo, con recarga automática
npm start       # ejecución normal
```

Comprobación rápida:

```powershell
curl http://localhost:3000/health
```

`Ctrl + C` cierra el servidor de forma ordenada (deja de aceptar conexiones y cierra el pool de
PostgreSQL).

## 6. Pruebas

```powershell
npm test
```

Ejecutar un solo archivo:

```powershell
npm run test:one -- tests/orders.concurrency.test.js
```

## 7. Endpoints

Todas las respuestas son JSON con la misma envoltura: éxito
`{ success: true, message, data, meta }`, error `{ success: false, message, error: { code, details } }`.

| Endpoint | Descripción |
| --- | --- |
| `GET /health` | Estado del servicio y de la conexión a la base |
| `GET /customers` | Clientes (`q`, `limit`, `offset`) |
| `GET /employees` | Empleados: solo `employee_id`, `first_name`, `last_name` |
| `GET /products` | Productos vendibles por defecto; `include_unavailable=true` incluye descontinuados/sin stock/sin precio |
| `GET /shippers` | Transportistas, para elegir `ship_via` |
| `POST /orders` | Crea una orden (cabecera + detalles) en una sola transacción |
| `GET /orders/:id` | Consulta una orden ya creada, con los mismos cálculos que al crearla |

### Crear una orden

```json
POST /orders
Content-Type: application/json

{
  "customer_id": "ALFKI",
  "employee_id": 5,
  "order_date": "2026-09-09",
  "ship_via": 2,
  "freight": 12.5,
  "items": [
    { "product_id": 1, "quantity": 2, "discount": 0 },
    { "product_id": 3, "quantity": 1, "discount": 0.1 }
  ]
}
```

* Obligatorios: `customer_id`, `employee_id`, `order_date`, `items` (cada ítem: `product_id`, `quantity`).
* No se envían `order_id`, precios ni totales: se leen de `products` y se rechazan como campos desconocidos.
* Responde `201 Created` con cabecera `Location: /orders/{order_id}`.

Ejemplo en PowerShell:

```powershell
$body = @'
{ "customer_id": "ALFKI", "employee_id": 5, "order_date": "2026-09-09",
  "items": [ { "product_id": 1, "quantity": 2 } ] }
'@
$r = Invoke-RestMethod -Uri http://localhost:3000/orders -Method Post -ContentType 'application/json' -Body $body
Invoke-RestMethod -Uri "http://localhost:3000/orders/$($r.data.order_id)"
```

---

## 8. Códigos de error principales

| HTTP | `error.code` | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Estructura o valores inválidos |
| 400 | `DUPLICATE_PRODUCT` | `product_id` repetido en `items` |
| 404 | `CUSTOMER_NOT_FOUND` / `EMPLOYEE_NOT_FOUND` / `SHIPPER_NOT_FOUND` / `PRODUCT_NOT_FOUND` / `ORDER_NOT_FOUND` | Entidad referenciada inexistente |
| 409 | `PRODUCT_DISCONTINUED` / `PRODUCT_PRICE_UNAVAILABLE` / `INSUFFICIENT_STOCK` | Producto no vendible o sin stock |
| 409 | `ORDER_ID_LIMIT_REACHED` | Se agotó el rango `smallint` de `order_id` |
| 413 | `PAYLOAD_TOO_LARGE` | Cuerpo JSON mayor a `JSON_BODY_LIMIT` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Falta `Content-Type: application/json` |
| 500 | `ORDER_ID_SEQUENCE_MISSING` | Falta ejecutar `npm run db:migrate` |

---

## 9. Colección de Postman

`postman/northwind-orders.postman_collection.json` (Collection v2.1, también importable en Thunder
Client). Incluye carpetas de salud, consultas base, creación/consulta de orden y casos de error, con
tests automáticos por petición.

---

## 10. Solución de problemas habituales

| Síntoma | Solución |
| --- | --- |
| `Falta la variable de entorno obligatoria DB_HOST` | `Copy-Item .env.example .env` y completar |
| `password authentication failed` | Corregir `DB_PASSWORD` en `.env` |
| `ECONNREFUSED 127.0.0.1:5432` | Iniciar el servicio de PostgreSQL; revisar `DB_PORT` |
| `database "northwind" does not exist` | Ajustar `DB_NAME` |
| `500 ORDER_ID_SEQUENCE_MISSING` | `npm run db:migrate` |
| `409 ORDER_ID_LIMIT_REACHED` | Rango `smallint` agotado (ver limitación en sección 11) |
| El stock no baja al crear órdenes | `npm run db:check`: revisar el trigger `trg_descontar_stock` |
| `npm test` falla con `ECONNREFUSED` o tablas inexistentes | `npm run test:db:setup` |
| `415 UNSUPPORTED_MEDIA_TYPE` | Añadir cabecera `Content-Type: application/json` |
| Error de CORS en el navegador | Agregar el origen a `CORS_ORIGIN` en `.env` y reiniciar |

---

## 11. Limitaciones conocidas

* `orders.order_id` es `smallint` (máximo 32767 órdenes en total).
* `unit_price`, `discount` y `freight` son `real`, con precisión limitada (~7 dígitos).
* Sin autenticación/autorización ni control de tasa.
* No hay edición ni eliminación de órdenes, ni CRUD de categorías/proveedores/territorios.

---

## 12. Estructura del proyecto

```
src/
├── config/        # env, pool de PostgreSQL
├── routes/        # definición de rutas por recurso
├── controllers/   # catalog, orders
├── services/      # lógica de negocio y transacciones
├── repositories/  # acceso a datos por entidad
├── validation/    # esquemas zod y middlewares
├── middlewares/   # content-type, 404, manejo de errores
└── utils/         # ApiError, money, respond
migrations/        # migración de order_id + esquema/seed de pruebas
scripts/           # check-db, migrate, setup-test-db
tests/             # suite node:test contra PostgreSQL real
postman/           # colección manual de peticiones
```

---

## 13. Seguridad aplicada

* Consultas 100% parametrizadas (sin interpolación de SQL).
* `helmet` para cabeceras de seguridad; `x-powered-by` deshabilitado.
* Límite de tamaño del cuerpo JSON (`JSON_BODY_LIMIT`) y validación estricta de esquemas (`zod`).
* Las respuestas de error nunca exponen contraseñas, SQL ni stack traces.
* `.env` y `.env.test` están en `.gitignore`; solo se versionan los `*.example`.
* TLS opcional hacia PostgreSQL con verificación de certificado activa.
