// Panel principal y recordatorios automáticos.
import { all, get } from '../db/db.js';
import { addDays, diffDays, monthRange, nowLocal, startOfWeek, today } from '../lib/clock.js';
import { eur, round2 } from '../lib/util.js';
import { listOrders, prodDateSql, PAID_SQL } from './orders.js';
import { getShoppingList, lowStockItems } from './inventory.js';
import { expensesBetween, pendingToCollect, revenueBetween } from './finance.js';
import { STAGE_LABELS, type Stage } from '../../shared/constants.js';

const OPEN = `o.status NOT IN ('entregado','cancelado')`;

function fmtQty(q: number, unit: string) {
  if (unit === 'g' && Math.abs(q) >= 1000) return `${(q / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg`;
  if (unit === 'ml' && Math.abs(q) >= 1000) return `${(q / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} l`;
  const n = q.toLocaleString('es-ES', { maximumFractionDigits: unit === 'ud' ? 0 : 2 });
  return unit === 'ud' ? n : `${n} ${unit}`;
}

/** Plural sencillo de la primera palabra ("caja tarta grande" → "cajas tarta grande"). */
function pluralize(name: string) {
  const [first, ...rest] = name.split(' ');
  if (/s$/i.test(first)) return name;
  const plural = /[aeiouáéó]$/i.test(first) ? `${first}s` : `${first}es`;
  return [plural, ...rest].join(' ');
}

export function stockWarning(i: { name: string; quantity: number; unit: string }) {
  const name = i.name.toLowerCase();
  if (i.quantity <= 0) return `Se ha acabado: ${name}.`;
  if (i.unit === 'ud') {
    const n = i.quantity.toLocaleString('es-ES', { maximumFractionDigits: 1 });
    return i.quantity === 1 ? `Solo queda 1 ${name}.` : `Solo quedan ${n} ${pluralize(name)}.`;
  }
  return `Solo quedan ${fmtQty(i.quantity, i.unit)} de ${name}.`;
}

export async function getDashboard(opts: { finances: boolean }) {
  const t = today();
  const tomorrow = addDays(t, 1);
  const weekStart = startOfWeek(t);
  const weekEnd = addDays(weekStart, 6);
  const nowTime = nowLocal().slice(11, 16);

  const [todayOrders, tomorrowOrders, weekCount] = await Promise.all([
    listOrders(`o.delivery_date = ? AND o.status <> 'cancelado'`, [t]),
    listOrders(`o.delivery_date = ? AND o.status <> 'cancelado'`, [tomorrow]),
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM orders o WHERE o.delivery_date BETWEEN ? AND ? AND o.status <> 'cancelado'`, [
      weekStart,
      weekEnd,
    ]),
  ]);
  const overdue = await listOrders(
    `${OPEN} AND (o.delivery_date < ? OR (o.delivery_date = ? AND o.delivery_time IS NOT NULL AND o.delivery_time < ?))`,
    [t, t, nowTime],
  );
  const next = (await listOrders(
    `${OPEN} AND (o.delivery_date > ? OR (o.delivery_date = ? AND (o.delivery_time IS NULL OR o.delivery_time >= ?)))`,
    [t, t, nowTime],
    `o.delivery_date, COALESCE(o.delivery_time, '23:59') LIMIT 1`,
  ))[0];

  const low = (await lowStockItems()).map((i) => ({
    id: i.id,
    name: i.name,
    kind: i.kind,
    quantity: i.quantity,
    unit: i.unit,
    min_stock: i.min_stock,
    message: stockWarning(i),
  }));

  let money = null;
  if (opts.finances) {
    const { from, to } = monthRange(t.slice(0, 7));
    const [revenue, expenses, pending] = await Promise.all([revenueBetween(from, to), expensesBetween(from, to), pendingToCollect()]);
    money = {
      revenue: revenue.total,
      pending: pending.total,
      pending_orders: pending.orders,
      expenses,
      profit: round2(revenue.total - expenses),
    };
  }

  return {
    today: t,
    tomorrow,
    week: { from: weekStart, to: weekEnd },
    counts: {
      today: todayOrders.length,
      tomorrow: tomorrowOrders.length,
      week: weekCount!.n,
      overdue: overdue.length,
    },
    today_orders: todayOrders,
    tomorrow_orders: tomorrowOrders,
    overdue_orders: overdue,
    next_delivery: next ?? null,
    money,
    low_stock: low,
    reminders: (await getReminders()).slice(0, 5),
  };
}

export interface Reminder {
  id: string;
  type: 'start' | 'delivery' | 'payment' | 'stock' | 'shopping' | 'unconfirmed' | 'overdue' | 'birthday' | 'quote' | 'manual';
  severity: 'urgent' | 'warning' | 'info';
  text: string;
  link?: string;
  date?: string | null;
  manual_id?: number;
}

function dayWord(date: string) {
  const d = diffDays(date, today());
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  const dt = new Date(`${date}T12:00:00Z`);
  const wd = dt.toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'UTC' });
  if (d > 1 && d < 7) return `el ${wd}`;
  return `el ${dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`;
}

function at(time: string | null) {
  return time ? ` a las ${time}` : '';
}

/** Recordatorios calculados a partir de los datos + recordatorios manuales. */
export async function getReminders(): Promise<Reminder[]> {
  const t = today();
  const out: Reminder[] = [];
  const pd = prodDateSql('o');

  // Atrasados
  for (const o of await all(
    `SELECT o.* FROM orders o WHERE ${OPEN} AND o.delivery_date < ? ORDER BY o.delivery_date`,
    [t],
  )) {
    out.push({
      id: `overdue-${o.id}`,
      type: 'overdue',
      severity: 'urgent',
      text: `El pedido #${o.number} de ${o.customer_name} era para ${dayWord(o.delivery_date)} y no está entregado.`,
      link: `/pedidos/${o.id}`,
      date: o.delivery_date,
    });
  }

  // Entregas de hoy y mañana con lo que falta por hacer
  const soon = await all(
    `SELECT o.*, ${PAID_SQL} AS paid FROM orders o
      WHERE o.status NOT IN ('nuevo','entregado','cancelado') AND o.delivery_date BETWEEN ? AND ?
      ORDER BY o.delivery_date, o.delivery_time`,
    [t, addDays(t, 1)],
  );
  for (const o of soon) {
    const pendingStages = (
      await all<{ stage: Stage }>(
        `SELECT stage FROM production_tasks WHERE order_id = ? AND done = 0 AND stage <> 'entregar' GROUP BY stage ORDER BY MIN(sort)`,
        [o.id],
      )
    ).map((r) => STAGE_LABELS[r.stage].toLowerCase());
    const missing = pendingStages.length
      ? ` Falta: ${pendingStages.join(', ')}.`
      : ' Está listo para entregar.';
    out.push({
      id: `delivery-${o.id}`,
      type: 'delivery',
      severity: o.delivery_date === t ? 'urgent' : 'warning',
      text: `Pedido de ${o.customer_name} ${dayWord(o.delivery_date)}${at(o.delivery_time)}.${missing}`,
      link: `/pedidos/${o.id}`,
      date: o.delivery_date,
    });
    const pending = round2(o.total - o.paid);
    if (pending > 0.005) {
      out.push({
        id: `collect-${o.id}`,
        type: 'payment',
        severity: 'info',
        text: `Cobrar ${eur(pending)} a ${o.customer_name} en la entrega (pedido #${o.number}).`,
        link: `/pedidos/${o.id}`,
        date: o.delivery_date,
      });
    }
  }

  // Pedidos que hay que empezar a preparar
  for (const o of await all(
    `SELECT o.* FROM orders o WHERE o.status IN ('confirmado','pendiente') AND ${pd} <= ? AND o.delivery_date > ?
      ORDER BY o.delivery_date`,
    [t, addDays(t, 1)],
  )) {
    out.push({
      id: `start-${o.id}`,
      type: 'start',
      severity: 'warning',
      text: `Hay que empezar a preparar el pedido #${o.number} de ${o.customer_name} (entrega ${dayWord(o.delivery_date)}${at(o.delivery_time)}).`,
      link: `/produccion`,
      date: o.delivery_date,
    });
  }

  // Pedidos sin confirmar con fecha cercana
  for (const o of await all(
    `SELECT o.* FROM orders o WHERE o.status = 'nuevo' AND o.delivery_date BETWEEN ? AND ? ORDER BY o.delivery_date`,
    [t, addDays(t, 3)],
  )) {
    out.push({
      id: `unconfirmed-${o.id}`,
      type: 'unconfirmed',
      severity: 'warning',
      text: `El pedido #${o.number} de ${o.customer_name} para ${dayWord(o.delivery_date)} sigue sin confirmar.`,
      link: `/pedidos/${o.id}`,
      date: o.delivery_date,
    });
  }

  // Pagos pendientes de pedidos ya entregados
  for (const o of await all(
    `SELECT o.*, ${PAID_SQL} AS paid FROM orders o WHERE o.status = 'entregado' AND o.total - ${PAID_SQL} > 0.005
      ORDER BY o.delivery_date DESC LIMIT 20`,
  )) {
    out.push({
      id: `debt-${o.id}`,
      type: 'payment',
      severity: 'warning',
      text: `${o.customer_name} tiene pendiente de pagar ${eur(o.total - o.paid)} del pedido #${o.number}.`,
      link: `/pedidos/${o.id}`,
      date: o.delivery_date,
    });
  }

  // Stock bajo
  for (const i of await lowStockItems()) {
    out.push({
      id: `stock-${i.id}`,
      type: 'stock',
      severity: i.quantity <= 0 ? 'urgent' : 'warning',
      text: stockWarning(i),
      link: `/inventario/${i.id}`,
    });
  }

  // Compras necesarias para los pedidos
  const shopping = await getShoppingList();
  const forOrders = shopping.items.filter((i) => i.reason === 'orders');
  if (forOrders.length) {
    out.push({
      id: 'shopping',
      type: 'shopping',
      severity: 'warning',
      text: `Tienes ${forOrders.length} ${forOrders.length === 1 ? 'producto' : 'productos'} por comprar para los próximos pedidos: ${forOrders
        .slice(0, 4)
        .map((i) => i.name.toLowerCase())
        .join(', ')}${forOrders.length > 4 ? '…' : '.'}`,
      link: '/compras',
    });
  }

  // Cumpleaños de clientes (próximos 7 días)
  for (const c of await all("SELECT id, name, birthday FROM customers WHERE birthday IS NOT NULL AND birthday <> ''")) {
    const md = String(c.birthday).slice(-5);
    for (let d = 0; d <= 7; d++) {
      const day = addDays(t, d);
      if (day.slice(5) === md) {
        out.push({
          id: `birthday-${c.id}`,
          type: 'birthday',
          severity: 'info',
          text: `Cumpleaños de ${c.name} ${dayWord(day)}. ¡Buen momento para escribirle!`,
          link: `/clientes/${c.id}`,
          date: day,
        });
        break;
      }
    }
  }

  // Presupuestos pendientes a punto de caducar
  for (const q of await all(
    `SELECT * FROM quotes WHERE status = 'pending' AND valid_until BETWEEN ? AND ? ORDER BY valid_until`,
    [t, addDays(t, 3)],
  )) {
    out.push({
      id: `quote-${q.id}`,
      type: 'quote',
      severity: 'info',
      text: `El presupuesto #${q.number} de ${q.customer_name} caduca ${dayWord(q.valid_until)}.`,
      link: `/presupuestos/${q.id}`,
      date: q.valid_until,
    });
  }

  // Manuales
  for (const r of await all(
    `SELECT * FROM reminders WHERE done = 0 AND (due_date IS NULL OR due_date <= ?) ORDER BY due_date`,
    [addDays(t, 1)],
  )) {
    out.push({
      id: `manual-${r.id}`,
      manual_id: r.id,
      type: 'manual',
      severity: r.due_date && r.due_date <= t ? 'warning' : 'info',
      text: r.text,
      link: r.order_id ? `/pedidos/${r.order_id}` : undefined,
      date: r.due_date,
    });
  }

  const sev = { urgent: 0, warning: 1, info: 2 };
  return out.sort((a, b) => sev[a.severity] - sev[b.severity] || String(a.date ?? '9').localeCompare(String(b.date ?? '9')));
}

/** Buscador global. */
export async function search(q: string) {
  const term = q.trim();
  if (!term) return { orders: [], customers: [], products: [], recipes: [], items: [] };
  const norm = term.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const like = `%${norm}%`;
  const digits = term.replace(/\D/g, '');

  // Fecha: 12/10, 12/10/2026, 12-10-26 o 2026-10-12
  let date: string | null = null;
  const m1 = term.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  const m2 = term.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) date = term;
  else if (m1) {
    const y = m1[3] ? (m1[3].length === 2 ? `20${m1[3]}` : m1[3]) : today().slice(0, 4);
    date = `${y}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  }

  const orderNum = term.match(/^#?(\d{1,6})$/)?.[1];
  const conds: string[] = [
    'norm(o.customer_name) LIKE ?',
    `EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND (norm(oi.product_name) LIKE ? OR norm(oi.flavor) LIKE ? OR norm(oi.custom_text) LIKE ?))`,
  ];
  const params: unknown[] = [like, like, like, like];
  if (orderNum) {
    conds.push('o.number = ?');
    params.push(Number(orderNum));
  }
  if (digits.length >= 6) {
    conds.push(`digits(o.customer_phone) LIKE ?`);
    params.push(`%${digits}%`);
  }
  if (date) {
    conds.push('o.delivery_date = ?');
    params.push(date);
  }
  const orders = await listOrders(`(${conds.join(' OR ')})`, params, 'o.delivery_date DESC LIMIT 25');

  const customers = await all(
    `SELECT c.id, c.name, c.phone, c.email,
            (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'cancelado') AS orders_count
       FROM customers c
      WHERE norm(c.name) LIKE ? OR norm(c.email) LIKE ? ${digits.length >= 3 ? 'OR digits(c.phone) LIKE ?' : ''}
      ORDER BY c.name LIMIT 15`,
    digits.length >= 3 ? [like, like, `%${digits}%`] : [like, like],
  );
  const products = await all(
    `SELECT id, name, category, photo_id, base_price FROM products WHERE active = 1 AND (norm(name) LIKE ? OR norm(description) LIKE ?) ORDER BY name LIMIT 10`,
    [like, like],
  );
  const recipes = await all(`SELECT id, name, photo_id, servings FROM recipes WHERE norm(name) LIKE ? ORDER BY name LIMIT 10`, [like]);
  const items = await all(
    `SELECT id, name, kind, quantity, unit FROM inventory_items WHERE active = 1 AND norm(name) LIKE ? ORDER BY name LIMIT 10`,
    [like],
  );
  return { orders, customers, products, recipes, items, date };
}

