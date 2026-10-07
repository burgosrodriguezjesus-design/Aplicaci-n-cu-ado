import { describe, expect, it } from 'vitest';
import { all, get } from '../db/db.js';
import { setNow } from '../lib/clock.js';
import { freshApp, newBakery } from './helpers.js';

async function catalogBasics(admin: any) {
  // Ingredientes y una receta de 10 raciones + un producto con tamaños.
  const inv = (await admin.get('/api/inventory')).body as any[];
  const id = (n: string) => inv.find((i) => i.name === n).id;
  await admin.put(`/api/inventory/${id('Harina de trigo')}`).send({ ...inv.find((i) => i.name === 'Harina de trigo'), quantity: 5, min_stock: 1, cost_per_unit: 1 }).expect(200);
  await admin.put(`/api/inventory/${id('Huevos')}`).send({ ...inv.find((i) => i.name === 'Huevos'), quantity: 30, min_stock: 12, cost_per_unit: 0.25 }).expect(200);
  await admin.put(`/api/inventory/${id('Caja tarta grande')}`).send({ ...inv.find((i) => i.name === 'Caja tarta grande'), quantity: 4, cost_per_unit: 1.5 }).expect(200);
  const recipe = await admin
    .post('/api/recipes')
    .send({
      name: 'Bizcocho base',
      servings: 10,
      prep_minutes: 30,
      bake_minutes: 40,
      temperature: 180,
      steps: ['Mezclar', 'Hornear'],
      ingredients: [
        { item_id: id('Harina de trigo'), quantity: 400, unit: 'g' },
        { item_id: id('Huevos'), quantity: 4, unit: 'ud' },
      ],
    })
    .expect(200);
  const product = await admin
    .post('/api/products')
    .send({
      name: 'Tarta base',
      category: 'tartas',
      servings: 10,
      labor_minutes: 30,
      other_costs: 1,
      sizes: [
        { name: 'Mediana', servings: 10, price: 30 },
        { name: 'Grande', servings: 20, price: 50 },
      ],
      components: [
        { recipe_id: recipe.body.id, quantity: 1 },
        { item_id: id('Caja tarta grande'), quantity: 1, unit: 'ud' },
      ],
    })
    .expect(200);
  const p = (await admin.get(`/api/products/${product.body.id}`)).body;
  return { id, recipeId: recipe.body.id, productId: p.id, sizes: p.sizes };
}

describe('recetas y escandallos', () => {
  it('escala las cantidades de una receta a otras raciones', async () => {
    const { admin } = await freshApp();
    const { recipeId } = await catalogBasics(admin);
    const r = (await admin.get(`/api/recipes/${recipeId}?servings=25`)).body;
    const harina = r.scaled.ingredients.find((i: any) => i.name === 'Harina de trigo');
    const huevos = r.scaled.ingredients.find((i: any) => i.name === 'Huevos');
    expect(harina.quantity).toBeCloseTo(1000); // 400 g × 2,5
    expect(huevos.quantity).toBeCloseTo(10);
  });

  it('calcula coste, beneficio y margen del producto', async () => {
    const { admin } = await freshApp();
    const { productId, sizes } = await catalogBasics(admin);
    await admin.put('/api/settings').send({ labor_cost_per_hour: 12, overhead_percent: 10 }).expect(200);
    const c = (await admin.get(`/api/products/${productId}/costing?size_id=${sizes[1].id}`)).body;
    // Grande = 20 raciones → 2 recetas: 800 g harina (0,80 €) + 8 huevos (2 €) + caja 1,5 €
    expect(c.ingredients).toBeCloseTo(2.8);
    expect(c.materials).toBeCloseTo(1.5);
    expect(c.labor).toBeCloseTo(12); // 30 min por 10 raciones → 60 min
    expect(c.overhead).toBeCloseTo(0.43);
    expect(c.total).toBeCloseTo(2.8 + 1.5 + 12 + 1 + 0.43, 1);
    expect(c.price).toBe(50);
    expect(c.profit).toBeCloseTo(50 - c.total, 2);
    expect(c.margin).toBeCloseTo((50 - c.total) / 50, 4);
  });
});

describe('ciclo de vida de un pedido', () => {
  it('automatiza tareas, stock, cobros y venta', async () => {
    const { admin } = await freshApp();
    const { id, productId, sizes } = await catalogBasics(admin);
    const stock = async (name: string) => (await get('SELECT quantity FROM inventory_items WHERE id = ?', [id(name)])).quantity;

    // Crear pedido con señal
    const created = await admin
      .post('/api/orders')
      .send({
        customer_name: 'Marta',
        customer_phone: '612 345 678',
        delivery_date: '2026-10-10',
        delivery_time: '17:00',
        allergens: ['huevo'],
        items: [{ product_id: productId, size_id: sizes[1].id, quantity: 1, custom_text: 'Felicidades' }],
        deposit: { amount: 15, method: 'bizum' },
      })
      .expect(200);
    const o = created.body;
    expect(o.number).toBe(1);
    expect(o.status).toBe('nuevo');
    expect(o.total).toBe(50);
    expect(o.paid).toBe(15);
    expect(o.pending).toBe(35);
    expect(o.tasks).toHaveLength(0);
    expect(o.customer_id).toBeTruthy(); // cliente creado automáticamente
    expect(o.allergen_warnings[0]).toMatch(/huevo/);
    // Ingredientes calculados: 20 raciones → 800 g de harina = 0,8 kg
    expect(o.requirements.find((r: any) => r.name === 'Harina de trigo').needed).toBeCloseTo(0.8);

    // En el calendario aparece por su fecha de entrega
    const cal = (await admin.get('/api/orders?from=2026-10-01&to=2026-10-31')).body;
    expect(cal.map((x: any) => x.id)).toContain(o.id);

    // Confirmar → tareas de producción y entra en la lista de la compra
    const conf = (await admin.patch(`/api/orders/${o.id}/status`).send({ status: 'confirmado' }).expect(200)).body;
    expect(conf.tasks.map((t: any) => t.stage)).toEqual(['preparar', 'hornear', 'rellenar', 'decorar', 'empaquetar', 'entregar']);
    const shop = (await admin.get('/api/shopping')).body;
    const huevos = shop.items.find((i: any) => i.name === 'Huevos');
    // necesita 8 huevos, tiene 30 y mínimo 12 → no hace falta comprar
    expect(huevos).toBeUndefined();

    // Al acercarse la fecha pasa solo a "pendiente de preparar"
    setNow(new Date('2026-10-09T08:00:00Z'));
    const auto = (await admin.get(`/api/orders/${o.id}`)).body;
    expect(auto.status).toBe('pendiente');
    const prod = (await admin.get('/api/production?date=2026-10-09')).body;
    expect(prod.summary[0]).toMatchObject({ product_name: 'Tarta base', quantity: 1 });

    // Marcar la primera tarea → en preparación y descuenta stock
    const harinaAntes = await stock('Harina de trigo');
    const prep = auto.tasks.find((t: any) => t.stage === 'preparar');
    expect((await admin.patch(`/api/production/tasks/${prep.id}`).send({ done: true }).expect(200)).body.status).toBe('en_preparacion');
    expect(await stock('Harina de trigo')).toBeCloseTo(harinaAntes - 0.8);
    expect(await stock('Huevos')).toBeCloseTo(22);
    expect(await stock('Caja tarta grande')).toBeCloseTo(3);

    // Volver atrás devuelve los ingredientes
    await admin.patch(`/api/orders/${o.id}/status`).send({ status: 'pendiente' }).expect(200);
    expect(await stock('Harina de trigo')).toBeCloseTo(harinaAntes);

    // Completar todas las tareas de producción → terminado
    const tasks = (await admin.get(`/api/orders/${o.id}`)).body.tasks;
    for (const t of tasks.filter((t: any) => t.stage !== 'entregar')) {
      await admin.patch(`/api/production/tasks/${t.id}`).send({ done: true }).expect(200);
    }
    expect((await admin.get(`/api/orders/${o.id}`)).body.status).toBe('terminado');
    expect(await stock('Huevos')).toBeCloseTo(22);

    // Cobro del resto y entrega → venta registrada
    await admin.post(`/api/orders/${o.id}/payments`).send({ amount: 35, method: 'efectivo' }).expect(200);
    const entregar = tasks.find((t: any) => t.stage === 'entregar');
    expect((await admin.patch(`/api/production/tasks/${entregar.id}`).send({ done: true })).body.status).toBe('entregado');
    const fin = (await admin.get('/api/finance/summary?month=2026-10')).body;
    expect(fin.revenue.orders).toBe(50);
    expect(fin.pending.total).toBe(0);
    const customer = (await admin.get(`/api/customers/${o.customer_id}`)).body;
    expect(customer.orders_count).toBe(1);
    expect(customer.total_spent).toBe(50);
  });

  it('edita un pedido en preparación recalculando el stock descontado', async () => {
    const { admin } = await freshApp();
    const { id, productId, sizes } = await catalogBasics(admin);
    const stock = async (name: string) => (await get('SELECT quantity FROM inventory_items WHERE id = ?', [id(name)])).quantity;
    const body = {
      customer_name: 'Javi',
      delivery_date: '2026-10-08',
      status: 'en_preparacion',
      items: [{ product_id: productId, size_id: sizes[0].id, quantity: 1 }],
    };
    const o = (await admin.post('/api/orders').send(body).expect(200)).body;
    expect(await stock('Huevos')).toBeCloseTo(26);
    await admin
      .put(`/api/orders/${o.id}`)
      .send({ ...body, items: [{ id: o.items[0].id, product_id: productId, size_id: sizes[0].id, quantity: 2 }] })
      .expect(200);
    expect(await stock('Huevos')).toBeCloseTo(22);
    const again = (await admin.get(`/api/orders/${o.id}`)).body;
    expect(again.total).toBe(60);
    // Las tareas conservan su identidad (no se pierden las marcadas)
    expect(again.tasks.filter((t: any) => t.stage === 'preparar')).toHaveLength(1);
  });
});

describe('lista de la compra', () => {
  it('propone comprar lo que falta y la compra suma stock y anota el gasto', async () => {
    const { admin } = await freshApp();
    const { id, productId, sizes } = await catalogBasics(admin);
    // 3 tartas grandes = 24 huevos; hay 30 y el mínimo es 12 → faltan 6 → se redondea a la docena
    await admin
      .post('/api/orders')
      .send({
        customer_name: 'Restaurante',
        delivery_date: '2026-10-09',
        status: 'confirmado',
        items: [{ product_id: productId, size_id: sizes[1].id, quantity: 3 }],
      })
      .expect(200);
    const list = (await admin.get('/api/shopping')).body;
    const huevos = list.items.find((i: any) => i.name === 'Huevos');
    expect(huevos.needed).toBeCloseTo(24);
    expect(huevos.shortfall).toBeCloseTo(6);
    expect(huevos.suggested).toBe(12);
    // Cajas: hacen falta 3 y hay 4 → no aparece en la lista
    expect(list.items.find((i: any) => i.name === 'Caja tarta grande')).toBeUndefined();
    const purchase = await admin
      .post('/api/shopping/purchase')
      .send({ lines: [{ item_id: id('Huevos'), quantity: 12, total_cost: 3.6 }], supplier: 'Granja' })
      .expect(200);
    expect((await get('SELECT quantity FROM inventory_items WHERE id = ?', [id('Huevos')])).quantity).toBeCloseTo(42);
    expect((await get('SELECT cost_per_unit FROM inventory_items WHERE id = ?', [id('Huevos')])).cost_per_unit).toBeCloseTo(0.3);
    const exp = await get('SELECT * FROM expenses WHERE id = ?', [purchase.body.expense_ids[0]]);
    expect(exp).toMatchObject({ category: 'ingredientes', amount: 3.6 });
    expect((await admin.get('/api/shopping')).body.items.find((i: any) => i.name === 'Huevos')).toBeUndefined();
    // Deshacer la compra quita también el stock
    await admin.delete(`/api/expenses/${exp.id}`).expect(200);
    expect((await get('SELECT quantity FROM inventory_items WHERE id = ?', [id('Huevos')])).quantity).toBeCloseTo(30);
  });
});

describe('presupuestos', () => {
  it('convierte un presupuesto aceptado en pedido con un botón', async () => {
    const { admin } = await freshApp();
    const { productId, sizes } = await catalogBasics(admin);
    const q = (
      await admin
        .post('/api/quotes')
        .send({
          customer_name: 'Elena',
          delivery_date: '2026-10-20',
          discount: 5,
          items: [{ product_id: productId, size_id: sizes[0].id, quantity: 2, extras: [{ name: 'Topper', price: 6 }] }],
        })
        .expect(200)
    ).body;
    expect(q.total).toBe(61);
    expect(q.valid_until).toBe('2026-10-22');
    const { order_id } = (await admin.post(`/api/quotes/${q.id}/convert`).send({}).expect(200)).body;
    const o = (await admin.get(`/api/orders/${order_id}`)).body;
    expect(o).toMatchObject({ status: 'confirmado', total: 61, delivery_date: '2026-10-20', customer_name: 'Elena' });
    expect(o.quote.number).toBe(q.number);
    expect((await admin.get(`/api/quotes/${q.id}`)).body.status).toBe('accepted');
  });
});

describe('pastelerías separadas, sin usuario ni contraseña', () => {
  it('cada dispositivo ve solo su pastelería y puede abrirla en otro con su enlace', async () => {
    const { app, admin } = await freshApp();
    const request = (await import('supertest')).default;
    // Sin pastelería no se puede usar la API
    await request(app).get('/api/orders').expect(401);
    expect((await request(app).get('/api/auth/status').expect(200)).body.has_bakery).toBe(false);

    await admin.post('/api/customers').send({ name: 'Cliente de Ana' }).expect(200);
    const other = await newBakery(app, { name: 'Otra pastelería' });
    expect((await other.get('/api/auth/status')).body.business_name).toBe('Otra pastelería');
    // Empieza vacía: sin clientes, pedidos ni inventario de ejemplo
    expect((await other.get('/api/customers').expect(200)).body).toHaveLength(0);
    expect((await other.get('/api/inventory').expect(200)).body).toHaveLength(0);
    expect((await other.get('/api/orders?view=upcoming').expect(200)).body).toHaveLength(0);
    await other.post('/api/customers').send({ name: 'Cliente de Luis' }).expect(200);
    expect((await admin.get('/api/customers')).body.map((c: any) => c.name)).toEqual(['Cliente de Ana']);
    // Tiene todo permitido en su pastelería
    expect((await admin.get('/api/auth/me')).body.permissions.finances).toBe(true);
    await admin.get('/api/finance/summary').expect(200);

    // Enlace para otro móvil
    const { key } = (await admin.get('/api/auth/link').expect(200)).body;
    const phone = request.agent(app);
    await phone.post('/api/auth/enter').send({ key: 'enlace-que-no-existe-123' }).expect(400);
    await phone.post('/api/auth/enter').send({ key: `https://ejemplo.com/entrar#${key}` }).expect(200);
    expect((await phone.get('/api/customers')).body.map((c: any) => c.name)).toEqual(['Cliente de Ana']);
    // Salir en ese móvil no borra nada
    await phone.post('/api/auth/leave').expect(200);
    await phone.get('/api/customers').expect(401);
    expect((await admin.get('/api/customers')).body).toHaveLength(1);
  });
});

describe('panel, recordatorios y buscador (datos de ejemplo)', () => {
  it('muestra el resumen del día y avisos útiles', async () => {
    const { admin } = await freshApp({ demo: true });
    const d = (await admin.get('/api/dashboard').expect(200)).body;
    expect(d.counts.today).toBe(2);
    expect(d.counts.tomorrow).toBe(2);
    expect(d.counts.overdue).toBe(1);
    expect(d.low_stock.map((l: any) => l.message)).toContain('⚠️ Solo quedan 12 huevos.');
    expect(d.low_stock.map((l: any) => l.message)).toContain('⚠️ Solo quedan 2 cajas tarta grande.');
    const reminders = (await admin.get('/api/reminders')).body.map((r: any) => r.text);
    expect(reminders).toContain('Pedido de Marta García mañana a las 17:00. Falta: decorar, empaquetar.');
    expect(d.money.revenue).toBeGreaterThan(0);
  });

  it('busca por nombre, teléfono, número de pedido y fecha', async () => {
    const { admin } = await freshApp({ demo: true });
    expect((await admin.get('/api/search?q=marta')).body.customers[0].name).toBe('Marta García');
    expect((await admin.get('/api/search?q=612345678')).body.customers[0].name).toBe('Marta García');
    expect((await admin.get('/api/search?q=lucia')).body.customers[0].name).toBe('Lucía Gómez'); // sin tilde
    const n = (await all('SELECT number FROM orders ORDER BY number DESC LIMIT 1'))[0].number;
    expect((await admin.get(`/api/search?q=%23${n}`)).body.orders.some((o: any) => o.number === n)).toBe(true);
    const byDate = (await admin.get('/api/search?q=8/10')).body.orders;
    expect(byDate.length).toBe(2);
    expect((await admin.get('/api/search?q=red velvet')).body.products[0].name).toBe('Tarta Red Velvet');
  });
});

describe('empezar de cero', () => {
  it('borra todo, deja la pastelería vacía (sin ejemplos) y una copia restaurable', async () => {
    const { admin } = await freshApp({ demo: true });
    await admin.post('/api/reset').send({ confirm: 'NO' }).expect(400);
    await admin.post('/api/reset').send({ confirm: 'BORRAR' }).expect(200);
    const status = (await admin.get('/api/auth/status').expect(200)).body;
    expect(status.has_bakery).toBe(true);
    expect(status.business_name).toBe('Dulce Test');
    expect((await admin.get('/api/inventory').expect(200)).body).toHaveLength(0);
    expect((await all('SELECT kind FROM backups')).map((b) => b.kind)).toEqual(['antes-de-borrar']);
    expect((await all('SELECT COUNT(*) AS n FROM orders'))[0].n).toBe(0);
  });
});

describe('copias de seguridad', () => {
  it('crea, lista y restaura una copia', async () => {
    const { admin } = await freshApp();
    await admin.post('/api/customers').send({ name: 'Antes' }).expect(200);
    const { id } = (await admin.post('/api/backups').expect(200)).body;
    await admin.post('/api/customers').send({ name: 'Después' }).expect(200);
    expect((await admin.get('/api/customers')).body).toHaveLength(2);
    expect((await admin.get('/api/backups')).body.map((b: any) => b.id)).toContain(id);
    await admin.post(`/api/backups/restore/${id}`).expect(200);
    const names = (await admin.get('/api/customers').expect(200)).body.map((c: any) => c.name);
    expect(names).toEqual(['Antes']);
    // Y también desde un archivo descargado
    const file = await admin.get('/api/backups/download/current').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    await admin.post('/api/customers').send({ name: 'Otro más' }).expect(200);
    await admin.post('/api/backups/restore').set('Content-Type', 'application/gzip').send(file.body).expect(200);
    expect((await admin.get('/api/customers')).body.map((c: any) => c.name)).toEqual(['Antes']);
  });
});

describe('instalación anterior (con usuario y contraseña)', () => {
  it('pasa sus datos a su propia pastelería y quien tenía sesión sigue entrando', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const crypto = await import('node:crypto');
    const { openDb, closeDb, run: dbRun, exec } = await import('../db/db.js');
    const { MIGRATIONS } = await import('../db/schema.js');
    const { createApp } = await import('../app.js');
    const request = (await import('supertest')).default;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obrador-legacy-'));
    // Base de datos como la de antes: todas las tablas en el esquema base.
    await openDb({ url: null, dataDir: dir });
    await dbRun('DROP TABLE tenant_keys');
    await dbRun('DROP TABLE tenants');
    await exec('CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at text NOT NULL)');
    for (const [i, m] of MIGRATIONS.entries()) {
      await exec(m);
      await dbRun("INSERT INTO schema_migrations VALUES (?, 'antes')", [i + 1]);
    }
    await dbRun("INSERT INTO users (name, username, password_hash, role) VALUES ('Jesús', 'jesus', 'x', 'admin')");
    await dbRun(`INSERT INTO settings (key, value) VALUES ('business_name', '"Obrador antiguo"')`);
    await dbRun("INSERT INTO customers (name) VALUES ('Cliente antiguo')");
    const token = 'sesion-antigua-123';
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await dbRun("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, 1, '2099-01-01')", [hash]);
    await closeDb();

    await openDb({ url: null, dataDir: dir });
    const app = createApp();
    const old = request.agent(app);
    const status = (await old.get('/api/auth/status').set('Cookie', `obrador_sid=${token}`).expect(200)).body;
    expect(status.has_bakery).toBe(true);
    expect(status.business_name).toBe('Obrador antiguo');
    // Ya entra con la cookie nueva
    expect((await old.get('/api/customers').expect(200)).body.map((c: any) => c.name)).toEqual(['Cliente antiguo']);
    // Otro dispositivo sin sesión no ve nada
    expect((await request(app).get('/api/auth/status')).body.has_bakery).toBe(false);
    await request(app).get('/api/customers').set('Cookie', 'obrador_sid=otra').expect(401);
    await closeDb();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('quitar los datos de ejemplo (migración 3)', () => {
  it('vacía las pastelerías que solo tienen ejemplos y no toca las que tienen algo suyo', async () => {
    const { exec } = await import('../db/db.js');
    const { MIGRATIONS } = await import('../db/schema.js');
    // Solo ejemplos → se vacía (y sus copias), conservando nombre y persona
    const demo = await freshApp({ demo: true });
    await demo.admin.post('/api/backups').expect(200);
    await exec(MIGRATIONS[2]);
    expect((await all('SELECT COUNT(*) AS n FROM orders'))[0].n).toBe(0);
    expect((await all('SELECT COUNT(*) AS n FROM customers'))[0].n).toBe(0);
    expect((await all('SELECT COUNT(*) AS n FROM inventory_items'))[0].n).toBe(0);
    expect((await all('SELECT COUNT(*) AS n FROM backups'))[0].n).toBe(0);
    expect((await demo.admin.get('/api/auth/status')).body.business_name).toBe('Dulce Test');
    await demo.admin.get('/api/dashboard').expect(200);

    // Ejemplos + un cliente propio añadido más tarde → no se toca nada
    const mixed = await freshApp({ demo: true });
    await mixed.admin.post('/api/customers').send({ name: 'Cliente de verdad' }).expect(200);
    // (añadido una hora después de crear la pastelería)
    const { run: dbRun } = await import('../db/db.js');
    await dbRun("UPDATE customers SET created_at = to_char(now() AT TIME ZONE 'UTC' + interval '1 hour', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') WHERE name = 'Cliente de verdad'");
    const before = (await all('SELECT COUNT(*) AS n FROM orders'))[0].n;
    await exec(MIGRATIONS[2]);
    expect((await all('SELECT COUNT(*) AS n FROM orders'))[0].n).toBe(before);
    expect(before).toBeGreaterThan(0);
  });
});
