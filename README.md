# 🧁 Obrador — gestión para tu pastelería

Aplicación completa para llevar una pequeña repostería o pastelería desde el móvil
(y también desde el ordenador): **pedidos, calendario, producción diaria, recetas,
inventario, lista de la compra inteligente, clientes, escandallos, presupuestos,
caja y finanzas**. Sin usuario ni contraseña: cada persona tiene su propia pastelería.

Se instala como una app en el móvil (icono en la pantalla de inicio) y todos los
datos se guardan en una base de datos en tu propio servidor.

---

## Qué hace

| Sección | Lo principal |
|---|---|
| **Inicio** | Pedidos de hoy, mañana, esta semana y atrasados · próxima entrega · facturado, pendiente de cobrar, gastos y beneficio del mes · avisos · poco stock · botón grande **+ Nuevo pedido** |
| **Pedidos** | Número automático, cliente (se busca o se crea solo), entrega/recogida con dirección, varios productos por pedido con tamaño, raciones, sabor, relleno, cobertura, decoración, texto de la tarta, extras, alérgenos (avisa si un producto lleva algo que el cliente no puede tomar), fotos de referencia, señal, cobros y pendiente. Estados con colores: Nuevo → Confirmado → Pendiente de preparar → En preparación → Terminado → Entregado / Cancelado. Botones de llamar y WhatsApp con el resumen del pedido, repetir pedido, imprimir |
| **Calendario** | Vista de día, semana y mes; filtros por pendientes, en preparación, terminados y entregados |
| **Producción** | «HOY HAY QUE PREPARAR: 2 tartas de chocolate, 30 galletas…» y tareas por fases (Preparar, Hornear, Rellenar, Decorar, Empaquetar, Entregar) para marcar con el dedo. Ingredientes que se van a usar con aviso si falta stock |
| **Recetas** | Ingredientes, raciones, tiempos, temperatura, pasos, foto, coste, precio recomendado y margen. **Escala las cantidades** a las personas que digas (10 → 25 raciones) |
| **Inventario** | Ingredientes y materiales con cantidad, unidad, precio, proveedor, envase y stock mínimo. Avisos tipo «⚠️ Solo quedan 12 huevos». Historial de movimientos |
| **Compras** | Lista de la compra automática a partir de los pedidos próximos, las recetas y el stock («48 huevos», «3 l de nata»…), redondeada al tamaño del envase. Se marca lo que vas metiendo en el carro y al terminar se registra la compra: suma al inventario, actualiza el precio y anota el gasto |
| **Clientes** | Ficha con contacto, cumpleaños, alergias, preferencias, notas, nº de pedidos, dinero gastado, deuda, «suele pedir…» y pedidos anteriores con botón **Repetir** |
| **Catálogo** | Productos con foto, descripción, tamaños, sabores, rellenos, coberturas, precio y extras |
| **Escandallo** | Coste real por producto y tamaño: ingredientes, envases, mano de obra, otros costes y gastos generales → coste, precio, beneficio y margen. Cambia precios y costes y ve el resultado al momento |
| **Presupuestos** | Se hacen como un pedido, se envían por WhatsApp o se imprimen, y con **un botón** se convierten en pedido |
| **Finanzas** | Ingresos − gastos = beneficio del mes, cobros por forma de pago, gastos por tipo, lo más vendido, evolución de 12 meses, ventas sueltas de mostrador y exportación a Excel |
| **Recordatorios** | Pedidos que hay que empezar, entregas próximas con lo que falta («Pedido de Marta mañana a las 17:00. Falta: decorar, empaquetar.»), cobros pendientes, stock bajo, compras necesarias, pedidos sin confirmar, presupuestos que caducan y cumpleaños de clientes |
| **Buscador** | Por nombre, teléfono, número de pedido (#12), producto o fecha (12/10) |

### Automatizaciones

- Al crear un pedido → aparece en el calendario y se guarda el cliente.
- Al confirmarlo → se calculan los ingredientes, se crean las tareas de producción y entra en la lista de la compra.
- Al llegar su día de producción → pasa a «Pendiente de preparar» y sale en Producción.
- Al empezar a prepararlo → se descuentan ingredientes y envases del inventario (y se devuelven si el pedido vuelve atrás).
- Al terminar todas las tareas → pasa a «Terminado».
- Si falta stock → aparece en la lista de la compra y en los avisos.
- Al registrar una señal o un cobro → se actualiza lo pendiente.
- Al entregar → se registra como venta y, si queda dinero pendiente, se ofrece cobrarlo en ese momento.

### Cada uno su pastelería (sin usuario ni contraseña)

- La primera vez que alguien abre la app, escribe el nombre de su pastelería y empieza a usarla.
  No hay que registrarse ni iniciar sesión.
- Cada persona tiene **sus propios datos**: nadie ve los pedidos, clientes o recetas de otro.
- El móvil recuerda su pastelería. Para abrir **la misma** en otro móvil u ordenador (o si se borran los
  datos del navegador), en *Configuración → Usarla en otro móvil u ordenador* está su **enlace de acceso**:
  se copia o se envía por WhatsApp y se abre en el otro dispositivo. Quien tenga ese enlace puede ver y
  cambiar los datos, así que hay que guardarlo bien.
- *Salir de esta pastelería* la quita solo de ese dispositivo; los datos no se borran.

### Copias de seguridad

- Copia automática cada noche (se guardan las 30 últimas) dentro de la propia base de datos.
- Desde *Configuración* puedes descargar una copia (archivo `.json.gz`), guardar una en la app o restaurar cualquiera.
- Las copias llevan todos los datos del negocio; las fotos se quedan en la base de datos (Supabase hace además sus propias copias).

---

## Dónde está instalada

👉 **https://obrador-pasteleria.vercel.app**

La versión en internet funciona con **Vercel** (la web y la API) y **Supabase** (la base de datos PostgreSQL, en París):

- La web se sirve desde el CDN de Vercel y la API es una función en París (`cdg1`), junto a la base de datos.
- Cada pastelería tiene su propio esquema de Postgres (`t_…`) con todas sus tablas; en el esquema base (`obrador`)
  solo están la lista de pastelerías y sus llaves de acceso (guardadas cifradas con SHA-256). La base de datos
  la usa un usuario propio de la aplicación y no se expone por la API pública de Supabase.
- Una tarea diaria de Vercel (cron) pasa los pedidos a producción, limpia fotos sin usar y hace la copia de seguridad de cada pastelería.
- Cada vez que se sube código a la rama conectada de GitHub, Vercel la vuelve a publicar sola.

Variables de entorno en Vercel:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a Postgres (pooler de Supabase en modo transacción, puerto 6543) |
| `CRON_SECRET` | Protege la tarea diaria |

> Supabase (plan gratuito) pausa los proyectos que pasan una semana sin ningún uso. Con el uso diario
> y la tarea nocturna no debería ocurrir; si alguna vez pasa, se reactiva desde el panel de Supabase.

## Ponerla en marcha en tu propio ordenador o servidor

Necesitas [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm run build
npm start
```

Abre `http://localhost:3000`. Sin `DATABASE_URL` usa una base de datos Postgres local
integrada (PGlite) en la carpeta `data/`, sin instalar nada más. Con `DATABASE_URL` usa
el Postgres que le indiques. La primera vez te pedirá el nombre de tu pastelería.

### Con Docker

```bash
docker compose up -d --build
```

Los datos se guardan en la carpeta `./data` del servidor.

### Instalarla en el móvil

Abre la dirección en el navegador del móvil y elige **«Añadir a pantalla de inicio»**
(Safari: botón Compartir; Chrome: menú ⋮). Se abrirá como una app a pantalla completa.

---

## Para desarrolladores

```bash
npm run dev           # servidor (http://localhost:3000) + web con recarga (http://localhost:5173)
npm test              # pruebas del servidor sobre Postgres en memoria (reglas de negocio y automatizaciones)
npm run typecheck     # comprobación de tipos de servidor y web
npm run build:vercel  # salida para Vercel (.vercel/output)
```

- **Servidor**: Node.js + Express + PostgreSQL (`pg`; PGlite en local y en las pruebas), validación con `zod`, llave de acceso de cada pastelería en una cookie `httpOnly` y un esquema de Postgres por pastelería.
- **Web**: React + TypeScript + Vite + Tailwind CSS + TanStack Query. Es una PWA.
- **Estructura**:
  - `server/db` — conexión, esquema PostgreSQL, migraciones automáticas y datos iniciales (los de ejemplo solo se usan en las pruebas)
  - `server/services` — reglas de negocio (pedidos, costes, producción, compras, finanzas…)
  - `server/routes` — API REST (`/api/...`)
  - `shared/constants.ts` — estados, unidades, alérgenos y configuración comunes
  - `web/src` — aplicación web
- El modelo de datos y las relaciones están explicados en [`docs/modelo-de-datos.md`](docs/modelo-de-datos.md).
