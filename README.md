# 🧁 Obrador — gestión para tu pastelería

Aplicación completa para llevar una pequeña repostería o pastelería desde el móvil
(y también desde el ordenador): **pedidos, calendario, producción diaria, recetas,
inventario, lista de la compra inteligente, clientes, escandallos, presupuestos,
caja y finanzas**, con usuarios y permisos.

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

### Usuarios y permisos

- **Administrador**: puede todo.
- **Empleados**: ven y actualizan pedidos, calendario, producción, clientes y la lista de la compra.
  El administrador decide en *Configuración* si además pueden ver las finanzas, ver costes y márgenes,
  tocar el inventario, editar el catálogo y las recetas, o borrar datos.

### Copias de seguridad

- Copia automática diaria (se guardan las 30 últimas) en `data/backups/`.
- Desde *Configuración* puedes descargar una copia, guardar una en el servidor o restaurar cualquiera.
- Todo (incluidas las fotos) está en un único archivo, `data/obrador.db`.

---

## Ponerla en marcha

Necesitas [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm run build
npm start
```

Abre `http://localhost:3000`. La primera vez te pedirá el nombre del negocio y crear
tu usuario de administrador (puedes cargar **datos de ejemplo** para probarla).
En la consola verás también la dirección para abrirla **desde el móvil** si está en la misma wifi.

### Con Docker

```bash
docker compose up -d --build
```

Los datos se guardan en la carpeta `./data` del servidor.

### En internet (para usarla desde cualquier sitio)

Sirve cualquier servidor que ejecute Node.js o Docker **con disco persistente** (por ejemplo un
VPS, Railway, Render o Fly.io con un volumen montado en `/data`). Recomendaciones:

- Pon la aplicación detrás de **HTTPS** (la mayoría de estos servicios lo hacen solos).
- Variables de entorno: `PORT` (puerto, por defecto 3000), `DATA_DIR` (carpeta de datos, por
  defecto `./data`), `TRUST_PROXY` (si está detrás de un proxy que no sea local).
- Descarga una copia de seguridad de vez en cuando y guárdala fuera del servidor.

### Instalarla en el móvil

Abre la dirección en el navegador del móvil y elige **«Añadir a pantalla de inicio»**
(Safari: botón Compartir; Chrome: menú ⋮). Se abrirá como una app a pantalla completa.

---

## Para desarrolladores

```bash
npm run dev        # servidor (http://localhost:3000) + web con recarga (http://localhost:5173)
npm test           # pruebas del servidor (reglas de negocio y automatizaciones)
npm run typecheck  # comprobación de tipos de servidor y web
```

- **Servidor**: Node.js + Express + SQLite (`better-sqlite3`), validación con `zod`, sesiones con cookie `httpOnly`.
- **Web**: React + TypeScript + Vite + Tailwind CSS + TanStack Query. Es una PWA.
- **Estructura**:
  - `server/db` — esquema, migraciones y datos de ejemplo
  - `server/services` — reglas de negocio (pedidos, costes, producción, compras, finanzas…)
  - `server/routes` — API REST (`/api/...`)
  - `shared/constants.ts` — estados, unidades, alérgenos y configuración comunes
  - `web/src` — aplicación web
- El modelo de datos y las relaciones están explicados en [`docs/modelo-de-datos.md`](docs/modelo-de-datos.md).
