import { Router } from 'express';
import { z } from 'zod';
import { get, run } from '../db/db.js';
import { can, h, requirePerm } from '../http.js';
import { addDays, today } from '../lib/clock.js';
import { forbidden, notFound, toId } from '../lib/util.js';
import {
  addPayment,
  createOrder,
  deleteOrder,
  duplicateOrder,
  getOrderFull,
  listOrders,
  runAutomations,
  setStatus,
  toggleTask,
  updateOrder,
} from '../services/orders.js';
import { getProduction } from '../services/production.js';
import {
  convertQuote,
  deleteQuote,
  getQuote,
  listQuotes,
  saveQuote,
  setQuoteStatus,
} from '../services/quotes.js';
import { ORDER_STATUSES } from '../../shared/constants.js';

export const ordersRouter = Router();

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

ordersRouter.get(
  '/orders',
  h(async (req) => {
    await runAutomations();
    const q = req.query as Record<string, string | undefined>;
    const where: string[] = [];
    const params: unknown[] = [];
    let orderBy = 'o.delivery_date, o.delivery_time';
    const t = today();
    if (q.from && dateRe.test(q.from)) {
      where.push('o.delivery_date >= ?');
      params.push(q.from);
    }
    if (q.to && dateRe.test(q.to)) {
      where.push('o.delivery_date <= ?');
      params.push(q.to);
    }
    if (q.customer_id) {
      where.push('o.customer_id = ?');
      params.push(toId(q.customer_id));
      orderBy = 'o.delivery_date DESC';
    }
    if (q.status && (ORDER_STATUSES as readonly string[]).includes(q.status)) {
      where.push('o.status = ?');
      params.push(q.status);
    }
    if (q.q) {
      where.push(
        `(norm(o.customer_name) LIKE ? OR digits(o.customer_phone) LIKE ? OR CAST(o.number AS TEXT) = ?
          OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND norm(oi.product_name) LIKE ?))`,
      );
      const norm = q.q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const digits = q.q.replace(/\D/g, '');
      params.push(`%${norm}%`, digits.length >= 3 ? `%${digits}%` : '-', q.q.replace('#', ''), `%${norm}%`);
    }
    switch (q.view) {
      case 'upcoming':
        where.push(`o.status NOT IN ('entregado','cancelado')`);
        break;
      case 'today':
        where.push(`o.delivery_date = ? AND o.status <> 'cancelado'`);
        params.push(t);
        break;
      case 'tomorrow':
        where.push(`o.delivery_date = ? AND o.status <> 'cancelado'`);
        params.push(addDays(t, 1));
        break;
      case 'overdue':
        where.push(`o.status NOT IN ('entregado','cancelado') AND o.delivery_date < ?`);
        params.push(t);
        break;
      case 'unpaid':
        where.push(`o.status <> 'cancelado' AND o.total - (SELECT COALESCE(SUM(CASE WHEN p.kind='refund' THEN -p.amount ELSE p.amount END),0) FROM payments p WHERE p.order_id = o.id) > 0.005`);
        break;
      case 'delivered':
        where.push(`o.status = 'entregado'`);
        orderBy = 'o.delivery_date DESC, o.delivery_time DESC';
        break;
      case 'cancelled':
        where.push(`o.status = 'cancelado'`);
        orderBy = 'o.delivery_date DESC';
        break;
      case 'all':
        orderBy = 'o.delivery_date DESC, o.delivery_time DESC';
        break;
    }
    const limit = Math.min(Number(q.limit) || 300, 1000);
    return listOrders(where.length ? where.join(' AND ') : '1=1', params, `${orderBy} LIMIT ${limit}`);
  }),
);

ordersRouter.get(
  '/orders/:id',
  h(async (req) => {
    await runAutomations();
    return getOrderFull(toId(req.params.id), { costs: can(req, 'perm_costs') });
  }),
);

ordersRouter.post(
  '/orders',
  h(async (req) => {
    const id = await createOrder(req.body, req.user!.id);
    return getOrderFull(id, { costs: can(req, 'perm_costs') });
  }),
);

ordersRouter.put(
  '/orders/:id',
  h(async (req) => {
    const id = toId(req.params.id);
    await updateOrder(id, req.body, req.user!.id);
    return getOrderFull(id, { costs: can(req, 'perm_costs') });
  }),
);

ordersRouter.patch(
  '/orders/:id/status',
  h(async (req) => {
    const id = toId(req.params.id);
    const { status } = z.object({ status: z.enum(ORDER_STATUSES) }).parse(req.body);
    await setStatus(id, status, req.user!.id);
    return getOrderFull(id, { costs: can(req, 'perm_costs') });
  }),
);

ordersRouter.post(
  '/orders/:id/duplicate',
  h(async (req) => {
    const { delivery_date } = z
      .object({ delivery_date: z.string().regex(dateRe).optional() })
      .parse(req.body ?? {});
    return { id: await duplicateOrder(toId(req.params.id), req.user!.id, delivery_date) };
  }),
);

ordersRouter.delete(
  '/orders/:id',
  requirePerm('perm_delete'),
  h((req) => deleteOrder(toId(req.params.id))),
);

ordersRouter.post(
  '/orders/:id/payments',
  h(async (req) => {
    const id = toId(req.params.id);
    await addPayment(id, req.body, req.user!.id);
    return getOrderFull(id, { costs: can(req, 'perm_costs') });
  }),
);

ordersRouter.delete(
  '/payments/:id',
  h(async (req) => {
    const p = await get('SELECT * FROM payments WHERE id = ?', [toId(req.params.id)]);
    if (!p) throw notFound('Pago');
    // Los empleados pueden corregir un cobro del mismo día; el resto, solo con permiso de borrar.
    if (!can(req, 'perm_delete') && !(p.user_id === req.user!.id && p.paid_at.slice(0, 10) === today())) {
      throw forbidden('Solo puedes borrar los cobros que has registrado hoy');
    }
    await run('DELETE FROM payments WHERE id = ?', [p.id]);
  }),
);

// ---------------------------------------------------------------------------
// Producción
// ---------------------------------------------------------------------------

ordersRouter.get(
  '/production',
  h(async (req) => {
    await runAutomations();
    const date = typeof req.query.date === 'string' && dateRe.test(req.query.date) ? req.query.date : today();
    return getProduction(date);
  }),
);

ordersRouter.patch(
  '/production/tasks/:id',
  h((req) => {
    const { done } = z.object({ done: z.boolean() }).parse(req.body);
    return toggleTask(toId(req.params.id), done, req.user!.id);
  }),
);

// ---------------------------------------------------------------------------
// Presupuestos
// ---------------------------------------------------------------------------

ordersRouter.get('/quotes', h(() => listQuotes()));
ordersRouter.get('/quotes/:id', h((req) => getQuote(toId(req.params.id))));
ordersRouter.post('/quotes', h(async (req) => getQuote(await saveQuote(req.body, req.user!.id))));
ordersRouter.put(
  '/quotes/:id',
  h(async (req) => getQuote(await saveQuote(req.body, req.user!.id, toId(req.params.id)))),
);
ordersRouter.patch(
  '/quotes/:id/status',
  h(async (req) => {
    const { status } = z.object({ status: z.enum(['pending', 'accepted', 'rejected']) }).parse(req.body);
    await setQuoteStatus(toId(req.params.id), status);
    return getQuote(toId(req.params.id));
  }),
);
ordersRouter.post(
  '/quotes/:id/convert',
  h(async (req) => ({ order_id: await convertQuote(toId(req.params.id), req.body, req.user!.id) })),
);
ordersRouter.delete(
  '/quotes/:id',
  requirePerm('perm_delete'),
  h((req) => deleteQuote(toId(req.params.id))),
);
