# Modelo de datos

Base de datos: **PostgreSQL** (Supabase en internet; PGlite integrado en local).

**Una pastelería = un esquema.** Cada pastelería tiene su propio esquema (`t_<16 hex>`) con todas
las tablas de abajo. En el esquema base (`obrador` en Supabase, `public` en local) solo hay:

| Tabla | Campos | Notas |
|---|---|---|
| `tenants` | schema, name, version, legacy, created_at, last_seen_at | Una fila por pastelería. `version` = migraciones aplicadas a su esquema. |
| `tenant_keys` | token_hash, tenant_id | Llaves de acceso (cookie del dispositivo / enlace para otro dispositivo), guardadas con SHA-256. |

Cada petición abre una transacción con `SET LOCAL search_path` al esquema de su pastelería, así
el código usa nombres de tabla normales y nunca ve datos de otra. Las migraciones de cada esquema
se aplican solas la primera vez que se usa después de una actualización. Todas las fechas "de negocio"
(entrega, gasto, cobro) se guardan como texto local `YYYY-MM-DD` / `HH:MM`
en la zona horaria del negocio; las marcas técnicas (`created_at`) en ISO UTC.

## Diagrama de relaciones

```
                         ┌──────────────┐
                         │   users      │ quien la usa
                         └──────┬───────┘
                                │ crea / registra
 ┌──────────┐  1   N  ┌─────────┴──┐  1   N  ┌──────────────┐  N   1  ┌──────────┐
 │customers ├────────►│  orders    ├────────►│ order_items  ├────────►│ products │
 └────┬─────┘         └─┬──┬──┬──┬─┘         └──────┬───────┘         └─┬───┬────┘
      │                 │  │  │  │                  │ size_id           │   │ 1
      │ 1  N            │  │  │  │ 1 N              ▼                   │   ▼ N
      │      ┌──────────┘  │  │  └──────────►┌──────────────┐   ┌──────┴────────────┐
      ▼      │             │  │              │production_   │   │ product_sizes     │
 ┌────────┐  │ 1 N         │  │ 1 N          │tasks         │   └───────────────────┘
 │ quotes ├──┘ (presupuesto│  ▼              └──────────────┘   ┌───────────────────┐
 │ +items │  convertido)   │ ┌──────────┐                       │product_components │
 └────────┘                │ │ payments │ señal / cobro /       │ (receta × factor  │
                           │ └──────────┘ devolución / venta    │  o artículo × uds)│
                           ▼ 1 N                                └──┬─────────────┬──┘
                    ┌──────────────┐                                │             │
                    │ order_images │──► images (BLOB)               ▼             ▼
                    └──────────────┘                         ┌──────────┐  ┌────────────────┐
                                                             │ recipes  │  │inventory_items │
                    ┌──────────────────────┐  N          1    │          │  │ ingredientes y │
                    │ inventory_movements  ├─────────────────►│          │  │ materiales     │
                    │ compra / consumo /   │                 └────┬─────┘  └───────▲────────┘
                    │ ajuste / merma       │                      │ 1 N            │
                    └───┬───────────┬──────┘                      ▼                │
                        │ order_id  │ expense_id        ┌────────────────────┐     │
                        ▼           ▼                   │ recipe_ingredients ├─────┘
                     orders     ┌──────────┐            └────────────────────┘
                                │ expenses │ gastos (compras, alquiler…)
                                └──────────┘
```

## Tablas

### Persona y configuración
| Tabla | Campos principales | Notas |
|---|---|---|
| `users` | name, role, active | Una persona por pastelería (quien la usa), para «creado por». Ya no hay contraseñas. |
| `sessions` | token_hash, user_id, expires_at | Solo de la versión anterior (con contraseña): sirve para pasar a la nueva sin perder el acceso. |
| `settings` | key, value (JSON) | Datos del negocio, costes y plazos. |

### Clientes
| `customers` | name, phone, email, address, birthday, allergens (JSON), preferences, notes |
|---|---|
Nº de pedidos, dinero gastado y último pedido **se calculan** a partir de `orders` (no se duplican).

### Catálogo, recetas e inventario
| Tabla | Campos | Relación |
|---|---|---|
| `inventory_items` | name, kind (`ingredient`/`material`), unit (`g`,`kg`,`ml`,`l`,`ud`), quantity, min_stock, cost_per_unit (€ por unidad), pack_size, supplier, allergens | Stock actual. |
| `inventory_movements` | item_id, type (`purchase`,`consumption`,`adjustment`,`waste`), quantity (±), unit_cost, order_id, expense_id | Historial: cada cambio de stock queda registrado. |
| `recipes` | name, photo_id, servings (raciones base), prep_minutes, bake_minutes, temperature, steps (JSON), sale_price | |
| `recipe_ingredients` | recipe_id, item_id, quantity, unit | Cantidades para `servings` raciones. Se escalan automáticamente. |
| `products` | name, category, description, photo_id, base_price, pricing (`unit`/`serving`), servings, flavors/fillings/coverings/extras (JSON), labor_minutes, other_costs, stages (JSON) | Lo que se vende (catálogo). |
| `product_sizes` | product_id, name, servings, price | Tamaños: "Mediana · 12 raciones · 35 €". |
| `product_components` | product_id, recipe_id **o** item_id, quantity, unit, per_serving, size_id | Escandallo: recetas (factor por raciones) + envases/decoración (por unidad o por ración, opcionalmente solo para un tamaño). |

### Pedidos y presupuestos
| Tabla | Campos | Notas |
|---|---|---|
| `orders` | number (automático), customer_id + nombre/teléfono, order_date, delivery_date, delivery_time, production_date, delivery_type (`pickup`/`delivery`), delivery_address, delivery_fee, discount, total, payment_method, status, allergens (JSON), notes, stock_consumed_at, delivered_at… | |
| `order_items` | order_id, product_id, size_id, quantity, servings, flavor, filling, coverage, decoration, custom_text, extras (JSON), unit_price, line_total, notes | Un pedido puede llevar varios productos. |
| `order_images` | order_id, image_id | Fotos de referencia. |
| `payments` | order_id, kind (`deposit`,`payment`,`refund`,`direct_sale`), amount, method, paid_at | Señal, cobros y ventas de mostrador. **Pendiente = total − cobrado.** |
| `quotes` / `quote_items` | Igual que pedidos + valid_until, status (`pending`,`accepted`,`rejected`), order_id | Un botón convierte el presupuesto en pedido. |
| `production_tasks` | order_id, order_item_id, stage (`preparar`,`hornear`,`rellenar`,`decorar`,`empaquetar`,`entregar`), done | Se generan solas a partir de los productos del pedido. |

### Compras, gastos y avisos
| Tabla | Campos |
|---|---|
| `expenses` | date, category, description, amount, supplier, payment_method (las compras de la lista generan un gasto + entradas de stock enlazadas) |
| `shopping_extras` | Artículos añadidos a mano a la lista de la compra |
| `shopping_checks` | Artículos marcados "en el carro" de la lista automática |
| `reminders` | Recordatorios manuales (los automáticos se calculan al vuelo) |
| `images` | Fotos comprimidas guardadas dentro de la base de datos |
| `backups` | Copias de seguridad (todos los datos en JSON comprimido): automáticas diarias y manuales |

## Estados del pedido

`nuevo → confirmado → pendiente (de preparar) → en_preparacion → terminado → entregado` · `cancelado`

## Cálculos clave

- **Raciones de una línea** = raciones por unidad (tamaño elegido o personalizado) × cantidad.
- **Escalado de receta** = factor del componente × raciones de la línea ÷ raciones base de la receta.
- **Necesidades de un pedido** = Σ ingredientes de sus recetas escaladas + materiales × unidades (convertidos a la unidad del inventario: g↔kg, ml↔l).
- **Coste de producción** = ingredientes + envases/materiales + mano de obra (minutos de trabajo del producto, ajustados al tamaño, × €/hora) + otros costes + % de gastos generales.
- **Precio recomendado** = coste ÷ (1 − margen objetivo).
- **Margen** = (precio − coste) ÷ precio.
- **Lista de la compra** = necesidades de los pedidos próximos (aún no descontados) + stock mínimo − stock actual, redondeado al tamaño de envase.
- **Facturado del mes** = pedidos entregados ese mes + ventas directas + señales retenidas de pedidos cancelados.
- **Beneficio estimado** = facturado − gastos.

## Automatizaciones

| Evento | Acción automática |
|---|---|
| Crear pedido | Aparece en el calendario (por fecha de entrega) y se vincula/crea el cliente. |
| Confirmar pedido | Se calculan los ingredientes necesarios, se generan las tareas de producción y entra en la lista de la compra. |
| Se acerca el día de producción | Pasa a "Pendiente de preparar" y aparece en Producción. |
| Primera tarea marcada / "En preparación" | Se descuentan los ingredientes y materiales del inventario. |
| Todas las tareas hechas | Pasa a "Terminado". |
| Falta stock | Aparece en la lista de la compra y en los avisos. |
| Registrar señal o cobro | Se actualiza el pendiente de cobro. |
| Entregar | Se registra como venta (y se ofrece cobrar lo pendiente). |
| Comprar desde la lista | Se suma al inventario, se actualiza el precio y se anota el gasto. |
| Volver un pedido atrás | Se devuelven al inventario los ingredientes descontados. |
