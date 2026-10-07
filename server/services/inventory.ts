// Inventario: stock, movimientos, compras y lista de la compra inteligente.
import { z } from 'zod';
import { all, get, insert, run, tx, update } from '../db/db.js';
import { addDays, nowIso, today } from '../lib/clock.js';
import { badRequest, notFound, round2 } from '../lib/util.js';
import { getSettings } from './settings.js';
import { Catalog, mapItem, requirementsForOrders, type InventoryItem } from './catalog.js';
import { UNITS } from '../../shared/constants.js';

const optText = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const itemSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  kind: z.enum(['ingredient', 'material']),
  category: optText,
  unit: z.enum(UNITS),
  quantity: z.number().default(0),
  min_stock: z.number().min(0).default(0),
  cost_per_unit: z.number().min(0).default(0),
  pack_size: z.number().positive().nullable().optional(),
  supplier: optText,
  allergens: z.array(z.string()).default([]),
  notes: optText,
});

export async function listItems(kind?: string) {
  const rows = await all(
    `SELECT * FROM inventory_items WHERE active = 1 ${kind ? 'AND kind = ?' : ''} ORDER BY lower(name)`,
    kind ? [kind] : [],
  );
  return rows.map(mapItem).map((i) => ({ ...i, low: isLow(i) }));
}

export function isLow(i: Pick<InventoryItem, 'quantity' | 'min_stock'>) {
  return i.quantity < 0 || (i.min_stock > 0 && i.quantity <= i.min_stock);
}

export async function lowStockItems() {
  return (await listItems()).filter((i) => i.low);
}

export async function createItem(raw: unknown, userId: number | null) {
  const input = itemSchema.parse(raw);
  return tx(async () => {
    const id = await insert('inventory_items', {
      ...input,
      quantity: 0,
      pack_size: input.pack_size ?? null,
      allergens: JSON.stringify(input.allergens),
    });
    if (input.quantity) {
      await insert('inventory_movements', {
        item_id: id,
        type: 'adjustment',
        quantity: input.quantity,
        unit_cost: input.cost_per_unit,
        note: 'Stock inicial',
        user_id: userId,
      });
      await run('UPDATE inventory_items SET quantity = ? WHERE id = ?', [input.quantity, id]);
    }
    return id;
  });
}

export async function updateItem(id: number, raw: unknown, userId: number | null) {
  const input = itemSchema.parse(raw);
  return tx(async () => {
    const item = await get('SELECT * FROM inventory_items WHERE id = ?', [id]);
    if (!item) throw notFound('Artículo');
    const { quantity, ...rest } = input;
    await update('inventory_items', id, {
      ...rest,
      pack_size: input.pack_size ?? null,
      allergens: JSON.stringify(input.allergens),
      updated_at: nowIso(),
    });
    if (Math.abs(quantity - item.quantity) > 1e-9) await adjustStock(id, { set: quantity, note: 'Corrección manual' }, userId);
  });
}

export async function deleteItem(id: number) {
  const used =
    (await get('SELECT COUNT(*) AS n FROM recipe_ingredients WHERE item_id = ?', [id]))!.n +
    (await get('SELECT COUNT(*) AS n FROM product_components WHERE item_id = ?', [id]))!.n;
  if (used) {
    // Se usa en recetas: se archiva para no romper los escandallos.
    await run('UPDATE inventory_items SET active = 0 WHERE id = ?', [id]);
    return { archived: true };
  }
  await run('DELETE FROM inventory_items WHERE id = ?', [id]);
  return { archived: false };
}

export const adjustSchema = z.object({
  set: z.number().optional(),
  delta: z.number().optional(),
  type: z.enum(['adjustment', 'waste', 'purchase']).default('adjustment'),
  note: optText,
});

/** Ajuste de stock: fijar una cantidad, sumar o restar (merma). */
export async function adjustStock(id: number, raw: unknown, userId: number | null) {
  const input = adjustSchema.parse(raw);
  return tx(async () => {
    const item = await get('SELECT * FROM inventory_items WHERE id = ?', [id]);
    if (!item) throw notFound('Artículo');
    let delta = input.delta ?? 0;
    if (input.set !== undefined) delta = input.set - item.quantity;
    if (input.type === 'waste') delta = -Math.abs(delta);
    if (!delta) return item.quantity;
    await insert('inventory_movements', {
      item_id: id,
      type: input.type,
      quantity: delta,
      unit_cost: item.cost_per_unit,
      note: input.note ?? null,
      user_id: userId,
    });
    await run('UPDATE inventory_items SET quantity = quantity + ?, updated_at = ? WHERE id = ?', [delta, nowIso(), id]);
    return item.quantity + delta;
  });
}

export function itemMovements(id: number, limit = 50) {
  return all(
    `SELECT m.*, o.number AS order_number, u.name AS user_name
       FROM inventory_movements m
       LEFT JOIN orders o ON o.id = m.order_id
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.item_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
    [id, limit],
  );
}

/** Dónde se usa un artículo (recetas y productos). */
export async function itemUsage(id: number) {
  return {
    recipes: await all(
      `SELECT DISTINCT r.id, r.name FROM recipe_ingredients ri JOIN recipes r ON r.id = ri.recipe_id WHERE ri.item_id = ? ORDER BY r.name`,
      [id],
    ),
    products: await all(
      `SELECT DISTINCT p.id, p.name FROM product_components pc JOIN products p ON p.id = pc.product_id WHERE pc.item_id = ? ORDER BY p.name`,
      [id],
    ),
  };
}

// ---------------------------------------------------------------------------
// Lista de la compra
// ---------------------------------------------------------------------------

/** Redondea la cantidad a comprar a algo razonable (envase o cifra redonda). */
export function roundPurchase(qty: number, unit: string, pack: number | null) {
  if (qty <= 0) return 0;
  if (pack && pack > 0) return Math.ceil(qty / pack - 1e-9) * pack;
  const step = unit === 'ud' ? 1 : unit === 'g' || unit === 'ml' ? 100 : 0.5;
  return round2(Math.ceil(qty / step - 1e-9) * step);
}

/** Pedidos cuyas necesidades todavía no se han descontado del inventario. */
export function upcomingOrdersForShopping(days: number, includeNew: boolean) {
  const statuses = includeNew ? `'nuevo','confirmado','pendiente'` : `'confirmado','pendiente'`;
  return all<{ id: number; number: number; customer_name: string; delivery_date: string }>(
    `SELECT id, number, customer_name, delivery_date FROM orders
      WHERE status IN (${statuses}) AND stock_consumed_at IS NULL AND delivery_date <= ?
      ORDER BY delivery_date`,
    [addDays(today(), days)],
  );
}

export async function getShoppingList(opts: { days?: number; includeNew?: boolean } = {}) {
  const s = getSettings();
  const days = opts.days ?? s.shopping_horizon_days;
  const includeNew = opts.includeNew ?? false;
  const orders = await upcomingOrdersForShopping(days, includeNew);
  const cat = await Catalog.load();
  const { req, byItemOrders } = await requirementsForOrders(
    orders.map((o) => o.id),
    cat,
  );
  const orderNumber = new Map(orders.map((o) => [o.id, o.number]));
  const checks = new Set((await all<{ item_id: number }>('SELECT item_id FROM shopping_checks')).map((r) => r.item_id));

  const items = [];
  const allItems = cat.allItems().filter((i) => i.active);
  for (const item of allItems) {
    const needed = req.get(item.id) || 0;
    const shortfall = needed + item.min_stock - item.quantity;
    if (shortfall <= 1e-9) continue;
    // Si no lo pide ningún pedido y está por encima del mínimo, no hace falta.
    if (!needed && !isLow(item)) continue;
    const suggested = roundPurchase(shortfall, item.unit, item.pack_size);
    items.push({
      item_id: item.id,
      name: item.name,
      kind: item.kind,
      unit: item.unit,
      stock: item.quantity,
      min_stock: item.min_stock,
      needed,
      shortfall,
      suggested,
      pack_size: item.pack_size,
      cost_per_unit: item.cost_per_unit,
      est_cost: round2(suggested * item.cost_per_unit),
      supplier: item.supplier,
      checked: checks.has(item.id),
      reason: needed ? 'orders' : 'min_stock',
      orders: [...(byItemOrders.get(item.id) ?? [])].map((id) => orderNumber.get(id)),
    });
  }
  items.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name, 'es') : a.kind === 'ingredient' ? -1 : 1,
  );
  const extras = await all('SELECT * FROM shopping_extras WHERE done = 0 OR done_at >= ? ORDER BY done, id', [
    addDays(today(), -1),
  ]);
  const recent = await all(
    `SELECT e.*, (SELECT COUNT(*) FROM inventory_movements m WHERE m.expense_id = e.id) AS lines
       FROM expenses e
      WHERE e.date >= ? AND EXISTS (SELECT 1 FROM inventory_movements m WHERE m.expense_id = e.id)
      ORDER BY e.date DESC, e.id DESC LIMIT 20`,
    [addDays(today(), -14)],
  );
  return {
    days,
    include_new: includeNew,
    until: addDays(today(), days),
    orders,
    items,
    extras,
    recent,
    total_est: round2(items.reduce((s, i) => s + i.est_cost, 0)),
  };
}

export const purchaseSchema = z.object({
  lines: z
    .array(
      z.object({
        item_id: z.number().int().positive(),
        quantity: z.number().positive('La cantidad debe ser mayor que 0'),
        total_cost: z.number().min(0).default(0),
      }),
    )
    .default([]),
  extra_ids: z.array(z.number().int().positive()).default([]),
  supplier: optText,
  payment_method: optText,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  register_expense: z.boolean().default(true),
  update_prices: z.boolean().default(true),
});

/**
 * Registra una compra: suma stock, actualiza el precio de compra y anota el gasto
 * (separado en ingredientes y materiales).
 */
export async function registerPurchase(raw: unknown, userId: number | null) {
  const input = purchaseSchema.parse(raw);
  if (!input.lines.length && !input.extra_ids.length) throw badRequest('No hay nada que registrar');
  return tx(async () => {
    const date = input.date ?? today();
    const groups: Record<'ingredient' | 'material', { names: string[]; total: number; lines: typeof input.lines }> = {
      ingredient: { names: [], total: 0, lines: [] },
      material: { names: [], total: 0, lines: [] },
    };
    for (const l of input.lines) {
      const item = await get('SELECT * FROM inventory_items WHERE id = ?', [l.item_id]);
      if (!item) throw notFound('Artículo');
      const g = groups[item.kind as 'ingredient' | 'material'];
      g.names.push(item.name.toLowerCase());
      g.total += l.total_cost;
      g.lines.push(l);
    }
    const expenseIds: number[] = [];
    for (const kind of ['ingredient', 'material'] as const) {
      const g = groups[kind];
      if (!g.lines.length) continue;
      let expenseId: number | null = null;
      if (input.register_expense && g.total > 0) {
        expenseId = await insert('expenses', {
          date,
          category: kind === 'ingredient' ? 'ingredientes' : 'materiales',
          description: `Compra: ${g.names.slice(0, 6).join(', ')}${g.names.length > 6 ? '…' : ''}`,
          amount: round2(g.total),
          supplier: input.supplier ?? null,
          payment_method: input.payment_method ?? null,
          user_id: userId,
        });
        expenseIds.push(expenseId);
      }
      for (const l of g.lines) {
        const unitCost = l.total_cost > 0 ? l.total_cost / l.quantity : null;
        await insert('inventory_movements', {
          item_id: l.item_id,
          type: 'purchase',
          quantity: l.quantity,
          unit_cost: unitCost,
          expense_id: expenseId,
          note: input.supplier ? `Compra en ${input.supplier}` : 'Compra',
          user_id: userId,
        });
        await run('UPDATE inventory_items SET quantity = quantity + ?, updated_at = ? WHERE id = ?', [
          l.quantity,
          nowIso(),
          l.item_id,
        ]);
        if (unitCost !== null && input.update_prices) {
          await run('UPDATE inventory_items SET cost_per_unit = ? WHERE id = ?', [round2(unitCost * 10000) / 10000, l.item_id]);
        }
        if (input.supplier) {
          await run("UPDATE inventory_items SET supplier = ? WHERE id = ? AND (supplier IS NULL OR supplier = '')", [
            input.supplier,
            l.item_id,
          ]);
        }
        await run('DELETE FROM shopping_checks WHERE item_id = ?', [l.item_id]);
      }
    }
    for (const id of input.extra_ids) {
      await run('UPDATE shopping_extras SET done = 1, done_at = ? WHERE id = ?', [today(), id]);
    }
    return { expense_ids: expenseIds };
  });
}

/** Borra un gasto; si era una compra, también quita del inventario lo que sumó. */
export async function deleteExpense(id: number) {
  await tx(async () => {
    const e = await get('SELECT * FROM expenses WHERE id = ?', [id]);
    if (!e) throw notFound('Gasto');
    const moves = await all('SELECT * FROM inventory_movements WHERE expense_id = ?', [id]);
    for (const m of moves) {
      await run('UPDATE inventory_items SET quantity = quantity - ?, updated_at = ? WHERE id = ?', [m.quantity, nowIso(), m.item_id]);
    }
    await run('DELETE FROM inventory_movements WHERE expense_id = ?', [id]);
    await run('DELETE FROM expenses WHERE id = ?', [id]);
  });
}
