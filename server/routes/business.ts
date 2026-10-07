import { Router } from 'express';
import { z } from 'zod';
import { all, get, insert, run, update } from '../db/db.js';
import { can, h, requirePerm } from '../http.js';
import { today } from '../lib/clock.js';
import { badRequest, notFound, toId } from '../lib/util.js';
import {
  createCustomer,
  customerSchema,
  customerStats,
  mapCustomer,
  updateCustomer,
} from '../services/customers.js';
import { listOrders } from '../services/orders.js';
import {
  deleteProduct,
  deleteRecipe,
  getRecipe,
  listProducts,
  listRecipes,
  productCosting,
  productView,
  saveProduct,
  saveRecipe,
} from '../services/catalogCrud.js';
import { Catalog, suggestedUnitPrice } from '../services/catalog.js';
import {
  adjustStock,
  createItem,
  deleteExpense,
  deleteItem,
  getShoppingList,
  itemMovements,
  itemUsage,
  listItems,
  registerPurchase,
  updateItem,
} from '../services/inventory.js';
import { mapItem } from '../services/catalog.js';
import {
  expenseSchema,
  history,
  monthSummary,
  movements,
  registerDirectSale,
} from '../services/finance.js';

export const businessRouter = Router();

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

businessRouter.get(
  '/customers',
  h(async (req) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const norm = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const digits = q.replace(/\D/g, '');
    const where = q
      ? `WHERE norm(c.name) LIKE ? OR norm(c.email) LIKE ? ${digits.length >= 3 ? 'OR digits(c.phone) LIKE ?' : ''}`
      : '';
    const params = q ? [`%${norm}%`, `%${norm}%`, ...(digits.length >= 3 ? [`%${digits}%`] : [])] : [];
    return (await all(
      `SELECT c.*,
              (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'cancelado') AS orders_count,
              (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.customer_id = c.id AND o.status = 'entregado') AS total_spent,
              (SELECT MAX(o.delivery_date) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'cancelado') AS last_order_date
         FROM customers c ${where}
        ORDER BY lower(c.name) LIMIT ${q ? 30 : 1000}`,
      params,
    )).map(mapCustomer);
  }),
);

businessRouter.get(
  '/customers/:id',
  h(async (req) => {
    const id = toId(req.params.id);
    const c = mapCustomer(await get('SELECT * FROM customers WHERE id = ?', [id]));
    if (!c) throw notFound('Cliente');
    const orders = await listOrders('o.customer_id = ?', [id], 'o.delivery_date DESC, o.id DESC LIMIT 100');
    const favorites = await all(
      `SELECT oi.product_name AS name, oi.flavor, COUNT(*) AS times, SUM(oi.quantity) AS quantity
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.customer_id = ? AND o.status <> 'cancelado'
        GROUP BY oi.product_name, oi.flavor ORDER BY times DESC LIMIT 5`,
      [id],
    );
    const quotes = await all('SELECT id, number, date, total, status FROM quotes WHERE customer_id = ? ORDER BY date DESC LIMIT 20', [id]);
    const pending = orders.reduce((s, o) => s + (o.status !== 'cancelado' ? o.pending : 0), 0);
    return { ...c, ...(await customerStats(id)), pending, orders, favorites, quotes };
  }),
);

businessRouter.post(
  '/customers',
  h(async (req) => {
    const input = customerSchema.parse(req.body);
    return { id: await createCustomer(input) };
  }),
);

businessRouter.put(
  '/customers/:id',
  h(async (req) => {
    const id = toId(req.params.id);
    if (!(await get('SELECT id FROM customers WHERE id = ?', [id]))) throw notFound('Cliente');
    await updateCustomer(id, customerSchema.parse(req.body));
    return { id };
  }),
);

businessRouter.delete(
  '/customers/:id',
  requirePerm('perm_delete'),
  h(async (req) => {
    await run('DELETE FROM customers WHERE id = ?', [toId(req.params.id)]);
  }),
);

// ---------------------------------------------------------------------------
// Catálogo (productos)
// ---------------------------------------------------------------------------

businessRouter.get(
  '/products',
  h((req) =>
    listProducts({ costs: can(req, 'perm_costs'), includeInactive: req.query.all === '1' }),
  ),
);

businessRouter.get(
  '/products/:id',
  h(async (req) => productView(await Catalog.load(), toId(req.params.id), can(req, 'perm_costs'))),
);

businessRouter.get(
  '/products/:id/costing',
  requirePerm('perm_costs'),
  h((req) => {
    const sizeId = req.query.size_id ? toId(req.query.size_id) : null;
    const servings = req.query.servings ? Number(req.query.servings) : null;
    return productCosting(toId(req.params.id), sizeId, servings && servings > 0 ? servings : null);
  }),
);

businessRouter.get(
  '/products/:id/price',
  h(async (req) => {
    const p = (await Catalog.load()).product(toId(req.params.id));
    if (!p) throw notFound('Producto');
    const sizeId = req.query.size_id ? toId(req.query.size_id) : null;
    const servings = req.query.servings ? Number(req.query.servings) : null;
    return { unit_price: suggestedUnitPrice(p, sizeId, servings) };
  }),
);

businessRouter.post(
  '/products',
  requirePerm('perm_catalog'),
  h(async (req) => ({ id: await saveProduct(req.body) })),
);

businessRouter.put(
  '/products/:id',
  requirePerm('perm_catalog'),
  h(async (req) => ({ id: await saveProduct(req.body, toId(req.params.id)) })),
);

/** Cambios rápidos desde el escandallo: precio de un tamaño / producto, mano de obra, otros costes. */
businessRouter.patch(
  '/products/:id/pricing',
  requirePerm('perm_catalog'),
  h(async (req) => {
    const id = toId(req.params.id);
    const input = z
      .object({
        size_id: z.number().int().positive().nullable().optional(),
        price: z.number().min(0).optional(),
        labor_minutes: z.number().min(0).optional(),
        other_costs: z.number().min(0).optional(),
      })
      .parse(req.body);
    if (!(await get('SELECT id FROM products WHERE id = ?', [id]))) throw notFound('Producto');
    if (input.price !== undefined) {
      if (input.size_id) await run('UPDATE product_sizes SET price = ? WHERE id = ? AND product_id = ?', [input.price, input.size_id, id]);
      else await run('UPDATE products SET base_price = ? WHERE id = ?', [input.price, id]);
    }
    const patch: Record<string, unknown> = {};
    if (input.labor_minutes !== undefined) patch.labor_minutes = input.labor_minutes;
    if (input.other_costs !== undefined) patch.other_costs = input.other_costs;
    await update('products', id, patch);
    return productCosting(id, input.size_id ?? null, null);
  }),
);

/** Cambiar la cantidad de un componente del escandallo. */
businessRouter.patch(
  '/product-components/:id',
  requirePerm('perm_catalog'),
  h(async (req) => {
    const { quantity } = z.object({ quantity: z.number().positive() }).parse(req.body);
    await run('UPDATE product_components SET quantity = ? WHERE id = ?', [quantity, toId(req.params.id)]);
  }),
);

businessRouter.delete(
  '/products/:id',
  requirePerm('perm_catalog'),
  h((req) => deleteProduct(toId(req.params.id))),
);

// ---------------------------------------------------------------------------
// Recetas
// ---------------------------------------------------------------------------

businessRouter.get('/recipes', h((req) => listRecipes(can(req, 'perm_costs'))));

businessRouter.get(
  '/recipes/:id',
  h((req) => {
    const servings = req.query.servings ? Number(req.query.servings) : null;
    return getRecipe(toId(req.params.id), servings, can(req, 'perm_costs'));
  }),
);

businessRouter.post('/recipes', requirePerm('perm_catalog'), h(async (req) => ({ id: await saveRecipe(req.body) })));
businessRouter.put(
  '/recipes/:id',
  requirePerm('perm_catalog'),
  h(async (req) => ({ id: await saveRecipe(req.body, toId(req.params.id)) })),
);
businessRouter.delete(
  '/recipes/:id',
  requirePerm('perm_catalog'),
  h((req) => deleteRecipe(toId(req.params.id))),
);

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------

function hideCost<T extends { cost_per_unit?: number }>(req: Parameters<typeof can>[0], rows: T[]) {
  return can(req, 'perm_costs') || can(req, 'perm_inventory') ? rows : rows.map((r) => ({ ...r, cost_per_unit: null }));
}

businessRouter.get(
  '/inventory',
  h(async (req) => {
    const kind = req.query.kind === 'ingredient' || req.query.kind === 'material' ? req.query.kind : undefined;
    return hideCost(req, await listItems(kind));
  }),
);

businessRouter.get(
  '/inventory/:id',
  h(async (req) => {
    const id = toId(req.params.id);
    const r = await get('SELECT * FROM inventory_items WHERE id = ?', [id]);
    if (!r) throw notFound('Artículo');
    const [item] = hideCost(req, [mapItem(r)]);
    return { ...item, movements: await itemMovements(id), usage: await itemUsage(id) };
  }),
);

businessRouter.post(
  '/inventory',
  requirePerm('perm_inventory'),
  h(async (req) => ({ id: await createItem(req.body, req.user!.id) })),
);

businessRouter.put(
  '/inventory/:id',
  requirePerm('perm_inventory'),
  h(async (req) => {
    await updateItem(toId(req.params.id), req.body, req.user!.id);
  }),
);

businessRouter.post(
  '/inventory/:id/adjust',
  requirePerm('perm_inventory'),
  h(async (req) => ({ quantity: await adjustStock(toId(req.params.id), req.body, req.user!.id) })),
);

businessRouter.delete(
  '/inventory/:id',
  requirePerm('perm_inventory'),
  h((req) => deleteItem(toId(req.params.id))),
);

// ---------------------------------------------------------------------------
// Lista de la compra
// ---------------------------------------------------------------------------

businessRouter.get(
  '/shopping',
  h((req) => {
    const days = req.query.days ? Math.min(Math.max(Number(req.query.days) || 7, 1), 60) : undefined;
    return getShoppingList({ days, includeNew: req.query.include_new === '1' });
  }),
);

businessRouter.post(
  '/shopping/checks',
  h(async (req) => {
    const { item_id, checked } = z.object({ item_id: z.number().int().positive(), checked: z.boolean() }).parse(req.body);
    if (checked) await run('INSERT INTO shopping_checks (item_id) VALUES (?) ON CONFLICT DO NOTHING', [item_id]);
    else await run('DELETE FROM shopping_checks WHERE item_id = ?', [item_id]);
  }),
);

businessRouter.post(
  '/shopping/extras',
  h(async (req) => {
    const input = z
      .object({
        name: z.string().trim().min(1, 'Escribe qué hay que comprar').max(200),
        quantity: z.string().trim().max(100).nullable().optional(),
        item_id: z.number().int().positive().nullable().optional(),
      })
      .parse(req.body);
    return { id: await insert('shopping_extras', { name: input.name, quantity: input.quantity || null, item_id: input.item_id ?? null }) };
  }),
);

businessRouter.patch(
  '/shopping/extras/:id',
  h(async (req) => {
    const { done } = z.object({ done: z.boolean() }).parse(req.body);
    await run('UPDATE shopping_extras SET done = ?, done_at = ? WHERE id = ?', [done ? 1 : 0, done ? today() : null, toId(req.params.id)]);
  }),
);

businessRouter.delete(
  '/shopping/extras/:id',
  h(async (req) => {
    await run('DELETE FROM shopping_extras WHERE id = ?', [toId(req.params.id)]);
  }),
);

businessRouter.post(
  '/shopping/purchase',
  requirePerm('perm_inventory'),
  h((req) => registerPurchase(req.body, req.user!.id)),
);

// ---------------------------------------------------------------------------
// Finanzas
// ---------------------------------------------------------------------------

const monthRe = /^\d{4}-\d{2}$/;
const monthOf = (v: unknown) => (typeof v === 'string' && monthRe.test(v) ? v : today().slice(0, 7));

businessRouter.get('/finance/summary', requirePerm('perm_finances'), h((req) => monthSummary(monthOf(req.query.month))));
businessRouter.get(
  '/finance/history',
  requirePerm('perm_finances'),
  h((req) => history(Math.min(Math.max(Number(req.query.months) || 12, 1), 36), monthOf(req.query.month))),
);
businessRouter.get('/finance/movements', requirePerm('perm_finances'), h((req) => movements(monthOf(req.query.month))));

businessRouter.post(
  '/finance/sales',
  h(async (req) => ({ id: await registerDirectSale(req.body, req.user!.id) })),
);

businessRouter.delete(
  '/finance/sales/:id',
  requirePerm('perm_finances'),
  h(async (req) => {
    await run("DELETE FROM payments WHERE id = ? AND kind = 'direct_sale'", [toId(req.params.id)]);
  }),
);

businessRouter.get(
  '/expenses',
  requirePerm('perm_finances'),
  h((req) => {
    const month = monthOf(req.query.month);
    return all(
      `SELECT e.*, (SELECT COUNT(*) FROM inventory_movements m WHERE m.expense_id = e.id) AS stock_lines
         FROM expenses e WHERE substr(e.date, 1, 7) = ? ORDER BY e.date DESC, e.id DESC`,
      [month],
    );
  }),
);

businessRouter.post(
  '/expenses',
  requirePerm('perm_finances'),
  h(async (req) => {
    const input = expenseSchema.parse(req.body);
    return { id: await insert('expenses', { ...input, user_id: req.user!.id }) };
  }),
);

businessRouter.put(
  '/expenses/:id',
  requirePerm('perm_finances'),
  h(async (req) => {
    const id = toId(req.params.id);
    const input = expenseSchema.parse(req.body);
    if (!(await get('SELECT id FROM expenses WHERE id = ?', [id]))) throw notFound('Gasto');
    await update('expenses', id, input);
  }),
);

businessRouter.delete(
  '/expenses/:id',
  h(async (req) => {
    // Deshacer una compra (lista de la compra) también lo puede hacer quien gestiona inventario.
    const id = toId(req.params.id);
    const isPurchase = (await get('SELECT COUNT(*) AS n FROM inventory_movements WHERE expense_id = ?', [id]))!.n > 0;
    if (!can(req, 'perm_finances') && !(isPurchase && can(req, 'perm_inventory'))) {
      throw badRequest('No tienes permiso para borrar gastos');
    }
    await deleteExpense(id);
  }),
);
