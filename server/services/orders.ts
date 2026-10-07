// Pedidos: alta/edición, estados y automatizaciones (tareas, stock, producción).
import { z } from 'zod';
import { all, get, insert, run, tx, update } from '../db/db.js';
import { addDays, nowIso, nowLocal, today } from '../lib/clock.js';
import { badRequest, notFound, parseJson, round2 } from '../lib/util.js';
import { getSettings, nextNumber } from './settings.js';
import { resolveCustomer } from './customers.js';
import {
  Catalog,
  describeRequirements,
  productAllergens,
  productCost,
  requirementsForLines,
  servingsPerUnit,
  type LineLike,
} from './catalog.js';
import { computeTotal, linesTotal, lineSchema, loadLines, normalizeLines, saveLines } from './lines.js';
import {
  ALLERGEN_LABELS,
  ORDER_STATUSES,
  STATUS_RANK,
  STAGES,
  type Allergen,
  type OrderStatus,
  type Stage,
} from '../../shared/constants.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida');
const timeStr = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Hora no válida')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));
const optText = z
  .string()
  .trim()
  .max(5000)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const orderSchema = z.object({
  customer_id: z.number().int().positive().nullable().optional(),
  customer_name: z.string().trim().min(1, 'Falta el nombre del cliente').max(200),
  customer_phone: optText,
  save_customer: z.boolean().default(true),
  order_date: dateStr.optional(),
  delivery_date: dateStr,
  delivery_time: timeStr,
  production_date: dateStr.nullable().optional().or(z.literal('').transform(() => null)),
  delivery_type: z.enum(['pickup', 'delivery']).default('pickup'),
  delivery_address: optText,
  delivery_fee: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  payment_method: optText,
  status: z.enum(ORDER_STATUSES).optional(),
  allergens: z.array(z.string()).default([]),
  notes: optText,
  items: z.array(lineSchema).min(1, 'Añade al menos un producto'),
  image_ids: z.array(z.number().int().positive()).default([]),
  deposit: z
    .object({ amount: z.number().min(0), method: z.string().min(1) })
    .nullable()
    .optional(),
  quote_id: z.number().int().positive().nullable().optional(),
});
export type OrderInput = z.input<typeof orderSchema>;

export const paymentSchema = z.object({
  kind: z.enum(['deposit', 'payment', 'refund']).default('payment'),
  amount: z.number().positive('El importe debe ser mayor que 0'),
  method: z.string().min(1).default('efectivo'),
  description: optText,
  paid_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/)
    .optional(),
});

// ---------------------------------------------------------------------------
// Utilidades de consulta
// ---------------------------------------------------------------------------

/** Expresión SQL de la fecha efectiva de producción (si no se fijó a mano). */
export function prodDateSql(alias = 'o') {
  const lead = Math.max(0, Math.floor(Number(getSettings().production_lead_days) || 0));
  return `COALESCE(${alias}.production_date, date(${alias}.delivery_date, '-${lead} days'))`;
}

export function effectiveProductionDate(o: { production_date: string | null; delivery_date: string }) {
  if (o.production_date) return o.production_date;
  return addDays(o.delivery_date, -Math.max(0, Math.floor(Number(getSettings().production_lead_days) || 0)));
}

/** Total cobrado de un pedido (señales + cobros − devoluciones). */
export function paidAmount(orderId: number): number {
  const r = get<{ paid: number }>(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END), 0) AS paid
       FROM payments WHERE order_id = ?`,
    [orderId],
  );
  return round2(r?.paid ?? 0);
}

/** Subconsulta SQL con lo cobrado de cada pedido. */
export const PAID_SQL = `(SELECT COALESCE(SUM(CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END), 0)
                            FROM payments p WHERE p.order_id = o.id)`;

/** Lista resumida de pedidos (para listados, calendario y panel). */
export function listOrders(where: string, params: unknown[] = [], orderBy = 'o.delivery_date, o.delivery_time') {
  const rows = all(
    `SELECT o.id, o.number, o.customer_id, o.customer_name, o.customer_phone, o.delivery_date, o.delivery_time,
            o.delivery_type, o.delivery_address, o.status, o.total, o.allergens, o.notes, o.order_date,
            ${prodDateSql('o')} AS production_day,
            ${PAID_SQL} AS paid,
            (SELECT GROUP_CONCAT(CASE WHEN oi.quantity = 1 THEN oi.product_name
                                      ELSE CAST(oi.quantity AS TEXT) || ' × ' || oi.product_name END, ' · ')
               FROM order_items oi WHERE oi.order_id = o.id) AS summary,
            (SELECT COUNT(*) FROM production_tasks t WHERE t.order_id = o.id) AS tasks_total,
            (SELECT COUNT(*) FROM production_tasks t WHERE t.order_id = o.id AND t.done = 1) AS tasks_done,
            (SELECT oi2.image_id FROM order_images oi2 WHERE oi2.order_id = o.id ORDER BY oi2.sort LIMIT 1) AS image_id
       FROM orders o
      WHERE ${where}
      ORDER BY ${orderBy}`,
    params,
  );
  return rows.map((r) => ({
    ...r,
    summary: (r.summary || '').replace(/(\d+)\.0 ×/g, '$1 ×'),
    allergens: parseJson<string[]>(r.allergens, []),
    paid: round2(r.paid),
    pending: round2(Math.max(0, r.total - r.paid)),
  }));
}

// ---------------------------------------------------------------------------
// Alta y edición
// ---------------------------------------------------------------------------

export function createOrder(raw: unknown, userId: number | null) {
  const input = orderSchema.parse(raw);
  return tx(() => {
    const cat = new Catalog();
    const lines = normalizeLines(input.items, cat);
    const total = computeTotal(linesTotal(lines), input.delivery_type, input.delivery_fee, input.discount);
    const customerId = resolveCustomer({
      customer_id: input.customer_id,
      name: input.customer_name,
      phone: input.customer_phone,
      address: input.delivery_type === 'delivery' ? input.delivery_address : null,
      save: input.save_customer,
    });
    const status: OrderStatus = input.status ?? 'nuevo';
    const id = insert('orders', {
      number: nextNumber('orders'),
      customer_id: customerId,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone ?? null,
      order_date: input.order_date ?? today(),
      delivery_date: input.delivery_date,
      delivery_time: input.delivery_time ?? null,
      production_date: input.production_date ?? null,
      delivery_type: input.delivery_type,
      delivery_address: input.delivery_type === 'delivery' ? (input.delivery_address ?? null) : null,
      delivery_fee: input.delivery_type === 'delivery' ? input.delivery_fee : 0,
      discount: input.discount,
      total,
      payment_method: input.payment_method ?? null,
      status: 'nuevo',
      allergens: JSON.stringify(input.allergens),
      notes: input.notes ?? null,
      quote_id: input.quote_id ?? null,
      created_by: userId,
    });
    saveLines('order_items', id, lines);
    setImages(id, input.image_ids);
    if (input.deposit && input.deposit.amount > 0) {
      insert('payments', {
        order_id: id,
        kind: 'deposit',
        amount: round2(input.deposit.amount),
        method: input.deposit.method,
        description: 'Señal al hacer el pedido',
        paid_at: nowLocal(),
        user_id: userId,
      });
    }
    if (status !== 'nuevo') applyStatus(id, status, userId, { fromTasks: false });
    afterOrderChange(id);
    return id;
  });
}

export function updateOrder(id: number, raw: unknown, userId: number | null) {
  const input = orderSchema.parse(raw);
  return tx(() => {
    const order = get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) throw notFound('Pedido');
    const cat = new Catalog();
    const lines = normalizeLines(input.items, cat);
    const total = computeTotal(linesTotal(lines), input.delivery_type, input.delivery_fee, input.discount);
    const customerId = resolveCustomer({
      customer_id: input.customer_id,
      name: input.customer_name,
      phone: input.customer_phone,
      address: input.delivery_type === 'delivery' ? input.delivery_address : null,
      save: input.save_customer,
    });
    // Si el stock ya se descontó, se devuelve y se vuelve a descontar con las líneas nuevas.
    const wasConsumed = !!order.stock_consumed_at;
    if (wasConsumed) restoreStock(id);
    update('orders', id, {
      customer_id: customerId,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone ?? null,
      order_date: input.order_date ?? order.order_date,
      delivery_date: input.delivery_date,
      delivery_time: input.delivery_time ?? null,
      production_date: input.production_date ?? null,
      delivery_type: input.delivery_type,
      delivery_address: input.delivery_type === 'delivery' ? (input.delivery_address ?? null) : null,
      delivery_fee: input.delivery_type === 'delivery' ? input.delivery_fee : 0,
      discount: input.discount,
      total,
      payment_method: input.payment_method ?? null,
      allergens: JSON.stringify(input.allergens),
      notes: input.notes ?? null,
      updated_at: nowIso(),
    });
    saveLines('order_items', id, lines);
    setImages(id, input.image_ids);
    if (wasConsumed) consumeStock(id, userId);
    if (input.status && input.status !== order.status) applyStatus(id, input.status, userId, { fromTasks: false });
    afterOrderChange(id);
    return id;
  });
}

function setImages(orderId: number, imageIds: number[]) {
  run('DELETE FROM order_images WHERE order_id = ?', [orderId]);
  imageIds.forEach((imageId, i) => {
    if (get('SELECT id FROM images WHERE id = ?', [imageId])) {
      insert('order_images', { order_id: orderId, image_id: imageId, sort: i });
    }
  });
}

export function duplicateOrder(id: number, userId: number | null, deliveryDate?: string) {
  const order = get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) throw notFound('Pedido');
  const items = loadLines('order_items', id).map(({ id: _id, sort: _s, line_total: _t, size_name: _sn, ...l }) => l);
  return createOrder(
    {
      customer_id: order.customer_id,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      delivery_date: deliveryDate ?? addDays(today(), 1),
      delivery_time: order.delivery_time,
      delivery_type: order.delivery_type,
      delivery_address: order.delivery_address,
      delivery_fee: order.delivery_fee,
      discount: 0,
      payment_method: order.payment_method,
      allergens: parseJson<string[]>(order.allergens, []),
      notes: order.notes,
      items,
    },
    userId,
  );
}

export function deleteOrder(id: number) {
  tx(() => {
    const order = get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) throw notFound('Pedido');
    // Devolver al inventario lo que no se llegó a entregar.
    if (order.stock_consumed_at && order.status !== 'entregado') restoreStock(id);
    run('UPDATE quotes SET order_id = NULL, status = ? WHERE order_id = ?', ['pending', id]);
    run('DELETE FROM orders WHERE id = ?', [id]);
  });
}

// ---------------------------------------------------------------------------
// Estados y automatizaciones
// ---------------------------------------------------------------------------

/**
 * Cambia el estado de un pedido aplicando todas las reglas:
 *  - tareas de producción (se crean / marcan / desmarcan),
 *  - descuento o devolución de ingredientes,
 *  - fechas de confirmación, entrega y cancelación.
 */
export function applyStatus(id: number, status: OrderStatus, userId: number | null, opts = { fromTasks: false }) {
  const order = get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) throw notFound('Pedido');
  const rank = STATUS_RANK[status];
  const patch: Record<string, unknown> = { status, updated_at: nowIso() };
  if (rank >= 1 && !order.confirmed_at) patch.confirmed_at = nowLocal();
  if (status === 'nuevo') patch.confirmed_at = null;
  if (status === 'entregado') patch.delivered_at = order.delivered_at && order.status === 'entregado' ? order.delivered_at : nowLocal();
  else patch.delivered_at = null;
  patch.cancelled_at = status === 'cancelado' ? (order.cancelled_at ?? nowLocal()) : null;
  update('orders', id, patch);

  if (status === 'nuevo') {
    run('DELETE FROM production_tasks WHERE order_id = ?', [id]);
  } else if (status !== 'cancelado') {
    syncTasks(id);
  }

  if (!opts.fromTasks && status !== 'cancelado') {
    const stamp = nowLocal();
    if (rank >= STATUS_RANK.terminado) {
      run(
        `UPDATE production_tasks SET done = 1, done_at = COALESCE(done_at, ?), done_by = COALESCE(done_by, ?)
          WHERE order_id = ? AND stage <> 'entregar'`,
        [stamp, userId, id],
      );
    }
    if (status === 'entregado') {
      run(
        `UPDATE production_tasks SET done = 1, done_at = COALESCE(done_at, ?), done_by = COALESCE(done_by, ?)
          WHERE order_id = ? AND stage = 'entregar'`,
        [stamp, userId, id],
      );
    } else {
      run(`UPDATE production_tasks SET done = 0, done_at = NULL, done_by = NULL WHERE order_id = ? AND stage = 'entregar'`, [id]);
    }
    if (rank <= STATUS_RANK.pendiente) {
      run('UPDATE production_tasks SET done = 0, done_at = NULL, done_by = NULL WHERE order_id = ?', [id]);
    }
  }
  ensureStockState(id, userId);
}

export function setStatus(id: number, status: OrderStatus, userId: number | null) {
  tx(() => applyStatus(id, status, userId, { fromTasks: false }));
}

/** El stock se descuenta cuando el pedido entra en preparación y se devuelve si vuelve atrás. */
function ensureStockState(id: number, userId: number | null) {
  const o = get('SELECT status, stock_consumed_at FROM orders WHERE id = ?', [id]);
  if (!o) return;
  const rank = STATUS_RANK[o.status as OrderStatus];
  if (o.status === 'cancelado') return;
  if (rank >= STATUS_RANK.en_preparacion && !o.stock_consumed_at) consumeStock(id, userId);
  if (rank <= STATUS_RANK.pendiente && o.stock_consumed_at) restoreStock(id);
}

export function consumeStock(id: number, userId: number | null) {
  const lines = all<LineLike>('SELECT product_id, size_id, quantity, servings FROM order_items WHERE order_id = ?', [id]);
  const req = requirementsForLines(lines);
  const stamp = nowIso();
  for (const [itemId, qty] of req) {
    if (!qty) continue;
    const item = get('SELECT cost_per_unit FROM inventory_items WHERE id = ?', [itemId]);
    insert('inventory_movements', {
      item_id: itemId,
      type: 'consumption',
      quantity: -qty,
      unit_cost: item?.cost_per_unit ?? null,
      order_id: id,
      note: null,
      user_id: userId,
      created_at: stamp,
    });
    run('UPDATE inventory_items SET quantity = quantity - ?, updated_at = ? WHERE id = ?', [qty, stamp, itemId]);
  }
  run('UPDATE orders SET stock_consumed_at = ? WHERE id = ?', [stamp, id]);
}

export function restoreStock(id: number) {
  const moves = all("SELECT * FROM inventory_movements WHERE order_id = ? AND type = 'consumption'", [id]);
  const stamp = nowIso();
  for (const m of moves) {
    run('UPDATE inventory_items SET quantity = quantity - ?, updated_at = ? WHERE id = ?', [m.quantity, stamp, m.item_id]);
  }
  run("DELETE FROM inventory_movements WHERE order_id = ? AND type = 'consumption'", [id]);
  run('UPDATE orders SET stock_consumed_at = NULL WHERE id = ?', [id]);
}

/** Genera/actualiza las tareas de producción a partir de las líneas del pedido. */
export function syncTasks(orderId: number) {
  const order = get('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order || order.status === 'nuevo') return;
  const cat = new Catalog();
  const lines = loadLines('order_items', orderId);
  const desired: { order_item_id: number | null; stage: Stage; title: string; sort: number }[] = [];
  for (const line of lines) {
    const product = line.product_id ? cat.product(line.product_id) : null;
    const stages = product?.stages ?? ['preparar', 'empaquetar'];
    const qty = Number.isInteger(line.quantity) ? String(line.quantity) : String(line.quantity).replace('.', ',');
    const title = `${qty} × ${line.product_name}${line.size_name ? ` (${line.size_name})` : ''}`;
    for (const stage of stages) {
      if (stage === 'entregar') continue;
      desired.push({ order_item_id: line.id, stage, title, sort: STAGES.indexOf(stage) * 100 + line.sort });
    }
  }
  const how = order.delivery_type === 'delivery' ? 'Entrega a domicilio' : 'Recogida';
  desired.push({
    order_item_id: null,
    stage: 'entregar',
    title: `${how} · Pedido #${order.number} · ${order.customer_name}`,
    sort: 999,
  });

  const existing = all('SELECT * FROM production_tasks WHERE order_id = ?', [orderId]);
  const key = (t: { order_item_id: number | null; stage: string }) => `${t.order_item_id ?? 'o'}:${t.stage}`;
  const byKey = new Map(existing.map((t) => [key(t), t]));
  const keep = new Set<number>();
  for (const d of desired) {
    const ex = byKey.get(key(d));
    if (ex) {
      keep.add(ex.id);
      if (ex.title !== d.title || ex.sort !== d.sort) update('production_tasks', ex.id, { title: d.title, sort: d.sort });
    } else {
      keep.add(insert('production_tasks', { order_id: orderId, ...d }));
    }
  }
  for (const t of existing) if (!keep.has(t.id)) run('DELETE FROM production_tasks WHERE id = ?', [t.id]);
}

/** Marca una tarea y deduce el estado del pedido. */
export function toggleTask(taskId: number, done: boolean, userId: number | null) {
  return tx(() => {
    const task = get('SELECT * FROM production_tasks WHERE id = ?', [taskId]);
    if (!task) throw notFound('Tarea');
    const order = get('SELECT * FROM orders WHERE id = ?', [task.order_id]);
    if (!order || order.status === 'cancelado' || order.status === 'nuevo') {
      throw badRequest('Este pedido no está en producción');
    }
    const stamp = nowLocal();
    run('UPDATE production_tasks SET done = ?, done_at = ?, done_by = ? WHERE id = ?', [
      done ? 1 : 0,
      done ? stamp : null,
      done ? userId : null,
      taskId,
    ]);
    if (task.stage === 'entregar' && done) {
      // Entregado implica que todo lo demás está hecho.
      run(
        `UPDATE production_tasks SET done = 1, done_at = COALESCE(done_at, ?), done_by = COALESCE(done_by, ?)
          WHERE order_id = ? AND stage <> 'entregar'`,
        [stamp, userId, order.id],
      );
    }
    const tasks = all('SELECT stage, done FROM production_tasks WHERE order_id = ?', [order.id]);
    const prod = tasks.filter((t) => t.stage !== 'entregar');
    const deliver = tasks.find((t) => t.stage === 'entregar');
    let target: OrderStatus = order.status;
    if (deliver?.done) target = 'entregado';
    else if (prod.length && prod.every((t) => t.done)) target = 'terminado';
    else if (prod.some((t) => t.done)) target = 'en_preparacion';
    else if (STATUS_RANK[order.status as OrderStatus] > STATUS_RANK.pendiente) target = 'pendiente';
    if (target !== order.status) applyStatus(order.id, target, userId, { fromTasks: true });
    return { order_id: order.id, status: target };
  });
}

/** Tras cualquier cambio: regenerar tareas y pasar a "pendiente" si llega su día. */
export function afterOrderChange(id: number) {
  const o = get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!o) return;
  if (o.status !== 'nuevo' && o.status !== 'cancelado') syncTasks(id);
  if (o.status === 'confirmado' && effectiveProductionDate(o) <= today()) {
    applyStatus(id, 'pendiente', null, { fromTasks: true });
  }
}

/** Automatización periódica: los pedidos confirmados entran en producción cuando llega su día. */
export function runAutomations() {
  const due = all<{ id: number }>(
    `SELECT o.id FROM orders o WHERE o.status = 'confirmado' AND ${prodDateSql('o')} <= ?`,
    [today()],
  );
  if (due.length) tx(() => due.forEach((o) => applyStatus(o.id, 'pendiente', null, { fromTasks: true })));
  return due.length;
}

// ---------------------------------------------------------------------------
// Pagos
// ---------------------------------------------------------------------------

export function addPayment(orderId: number, raw: unknown, userId: number | null) {
  const input = paymentSchema.parse(raw);
  const order = get('SELECT id FROM orders WHERE id = ?', [orderId]);
  if (!order) throw notFound('Pedido');
  return insert('payments', {
    order_id: orderId,
    kind: input.kind,
    amount: round2(input.amount),
    method: input.method,
    description: input.description ?? null,
    paid_at: input.paid_at ? (input.paid_at.length === 10 ? `${input.paid_at}T12:00` : input.paid_at) : nowLocal(),
    user_id: userId,
  });
}

// ---------------------------------------------------------------------------
// Ficha completa
// ---------------------------------------------------------------------------

export function getOrderFull(id: number, opts: { costs: boolean }) {
  const order = get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) throw notFound('Pedido');
  const cat = new Catalog();
  const items = loadLines('order_items', id).map((l) => ({
    ...l,
    product_photo_id: l.product_id ? (cat.product(l.product_id)?.photo_id ?? null) : null,
    contains: l.product_id ? productAllergens(cat, l.product_id) : [],
  }));
  const payments = all('SELECT * FROM payments WHERE order_id = ? ORDER BY paid_at, id', [id]);
  const paid = paidAmount(id);
  const images = all<{ image_id: number }>('SELECT image_id FROM order_images WHERE order_id = ? ORDER BY sort', [id]).map(
    (r) => r.image_id,
  );
  const tasks = all(
    `SELECT t.*, u.name AS done_by_name FROM production_tasks t LEFT JOIN users u ON u.id = t.done_by
      WHERE t.order_id = ? ORDER BY t.sort, t.id`,
    [id],
  );
  const req = requirementsForLines(items, cat);
  let requirements = describeRequirements(req, cat);
  if (!opts.costs) requirements = requirements.map(({ cost: _c, ...r }) => ({ ...r, cost: 0 }));
  const allergens = parseJson<string[]>(order.allergens, []);
  const warnings: string[] = [];
  for (const it of items) {
    const clash = it.contains.filter((a) => allergens.includes(a));
    if (clash.length) {
      warnings.push(
        `${it.product_name} contiene ${clash.map((a) => ALLERGEN_LABELS[a as Allergen] ?? a).join(', ').toLowerCase()}`,
      );
    }
  }
  const customer = order.customer_id ? get('SELECT id, name, phone, email, address FROM customers WHERE id = ?', [order.customer_id]) : null;
  const quote = order.quote_id ? get('SELECT id, number FROM quotes WHERE id = ?', [order.quote_id]) : null;
  return {
    ...order,
    allergens,
    production_day: effectiveProductionDate(order),
    items,
    payments,
    paid,
    pending: round2(Math.max(0, order.total - paid)),
    images,
    tasks,
    requirements,
    allergen_warnings: warnings,
    customer,
    quote,
    estimated_cost: opts.costs ? estimateCost(cat, items) : null,
  };
}

/** Coste estimado de producción del pedido (ingredientes, materiales, mano de obra y gastos generales). */
export function estimateCost(cat: Catalog, items: LineLike[]) {
  let total = 0;
  for (const it of items) {
    const product = it.product_id ? cat.product(it.product_id) : null;
    if (!product) continue;
    const c = productCost(cat, product, { sizeId: it.size_id, servings: servingsPerUnit(product, it), price: 0 });
    total += c.total * it.quantity;
  }
  return round2(total);
}
