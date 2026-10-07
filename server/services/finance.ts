// Caja y finanzas: facturación, cobros, gastos y beneficio.
import { z } from 'zod';
import { all, get, insert } from '../db/db.js';
import { addMonths, monthRange, nowLocal, today } from '../lib/clock.js';
import { round2 } from '../lib/util.js';
import { PAID_SQL } from './orders.js';
import { EXPENSE_CATEGORIES } from '../../shared/constants.js';

const optText = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const expenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida'),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(1, 'Escribe una descripción').max(500),
  amount: z.number().positive('El importe debe ser mayor que 0'),
  supplier: optText,
  payment_method: optText,
});

export const directSaleSchema = z.object({
  description: z.string().trim().min(1, 'Escribe qué has vendido').max(500),
  amount: z.number().positive('El importe debe ser mayor que 0'),
  method: z.string().min(1).default('efectivo'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function registerDirectSale(raw: unknown, userId: number | null) {
  const input = directSaleSchema.parse(raw);
  const stamp = input.date && input.date !== today() ? `${input.date}T12:00` : nowLocal();
  return insert('payments', {
    order_id: null,
    kind: 'direct_sale',
    amount: round2(input.amount),
    method: input.method,
    description: input.description,
    paid_at: stamp,
    user_id: userId,
  });
}

const DELIVERED_DAY = `COALESCE(substr(o.delivered_at, 1, 10), o.delivery_date)`;

/** Facturado en un rango: pedidos entregados + ventas directas + señales retenidas de cancelados. */
export async function revenueBetween(from: string, to: string) {
  const orders = (await get<{ n: number; total: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(o.total), 0) AS total FROM orders o
      WHERE o.status = 'entregado' AND ${DELIVERED_DAY} BETWEEN ? AND ?`,
    [from, to],
  ))!;
  const direct = (await get<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
      WHERE kind = 'direct_sale' AND substr(paid_at, 1, 10) BETWEEN ? AND ?`,
    [from, to],
  ))!;
  const kept = (await get<{ total: number }>(
    `SELECT COALESCE(SUM(CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END), 0) AS total
       FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE o.status = 'cancelado' AND substr(p.paid_at, 1, 10) BETWEEN ? AND ?`,
    [from, to],
  ))!;
  return {
    orders_count: orders.n,
    orders: round2(orders.total),
    direct_sales: round2(direct.total),
    cancelled_kept: round2(kept.total),
    total: round2(orders.total + direct.total + kept.total),
  };
}

export async function expensesBetween(from: string, to: string) {
  const r = await get<{ total: number }>('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date BETWEEN ? AND ?', [from, to]);
  return round2(r!.total);
}

export async function collectedBetween(from: string, to: string) {
  const r = await get<{ total: number }>(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END), 0) AS total
       FROM payments WHERE substr(paid_at, 1, 10) BETWEEN ? AND ?`,
    [from, to],
  );
  return round2(r!.total);
}

/** Dinero pendiente de cobrar de todos los pedidos no cancelados. */
export async function pendingToCollect() {
  const r = (await get<{ total: number; n: number }>(
    `SELECT COALESCE(SUM(GREATEST(o.total - ${PAID_SQL}, 0)), 0) AS total,
            COALESCE(SUM(CASE WHEN o.total - ${PAID_SQL} > 0.005 THEN 1 ELSE 0 END), 0) AS n
       FROM orders o WHERE o.status <> 'cancelado'`,
  ))!;
  return { total: round2(r.total), orders: r.n };
}

export async function monthSummary(month: string) {
  const { from, to } = monthRange(month);
  const revenue = await revenueBetween(from, to);
  const expenses = await expensesBetween(from, to);
  const collected = await collectedBetween(from, to);
  const byCategory = await all(
    `SELECT category, ROUND(SUM(amount)::numeric, 2) AS amount FROM expenses WHERE date BETWEEN ? AND ?
      GROUP BY category ORDER BY amount DESC`,
    [from, to],
  );
  const byMethod = await all(
    `SELECT method, ROUND(SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END)::numeric, 2) AS amount
       FROM payments WHERE substr(paid_at, 1, 10) BETWEEN ? AND ? GROUP BY method ORDER BY amount DESC`,
    [from, to],
  );
  const topProducts = await all(
    `SELECT oi.product_name AS name, SUM(oi.quantity) AS quantity, ROUND(SUM(oi.line_total)::numeric, 2) AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status = 'entregado' AND ${DELIVERED_DAY} BETWEEN ? AND ?
      GROUP BY oi.product_name ORDER BY revenue DESC LIMIT 8`,
    [from, to],
  );
  return {
    month,
    from,
    to,
    revenue,
    expenses,
    collected,
    profit: round2(revenue.total - expenses),
    cash_flow: round2(collected - expenses),
    avg_ticket: revenue.orders_count ? round2(revenue.orders / revenue.orders_count) : 0,
    pending: await pendingToCollect(),
    expenses_by_category: byCategory,
    collected_by_method: byMethod,
    top_products: topProducts,
  };
}

export async function history(months = 12, endMonth = today().slice(0, 7)) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(endMonth, -i);
    const { from, to } = monthRange(m);
    const revenue = (await revenueBetween(from, to)).total;
    const expenses = await expensesBetween(from, to);
    out.push({ month: m, revenue, expenses, profit: round2(revenue - expenses) });
  }
  return out;
}

/** Movimientos de caja del mes: cobros, ventas directas y gastos. */
export async function movements(month: string) {
  const { from, to } = monthRange(month);
  const pays = await all(
    `SELECT p.id, 'payment' AS source, p.kind, p.amount, p.method, p.description, p.paid_at AS date,
            o.id AS order_id, o.number AS order_number, o.customer_name
       FROM payments p LEFT JOIN orders o ON o.id = p.order_id
      WHERE substr(p.paid_at, 1, 10) BETWEEN ? AND ?`,
    [from, to],
  );
  const exps = await all(
    `SELECT e.id, 'expense' AS source, e.category AS kind, e.amount, e.payment_method AS method, e.description,
            e.date, e.supplier,
            (SELECT COUNT(*) FROM inventory_movements m WHERE m.expense_id = e.id) AS stock_lines
       FROM expenses e WHERE e.date BETWEEN ? AND ?`,
    [from, to],
  );
  return [...pays, ...exps].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
}
