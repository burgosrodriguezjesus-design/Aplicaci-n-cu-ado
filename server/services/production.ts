// Producción diaria: qué hay que hacer cada día, agrupado por fases.
import { all } from '../db/db.js';
import { today } from '../lib/clock.js';
import { parseJson } from '../lib/util.js';
import { Catalog, describeRequirements, requirementsForOrders } from './catalog.js';
import { PAID_SQL, prodDateSql } from './orders.js';
import { STAGES, STAGE_LABELS, type Stage } from '../../shared/constants.js';

export async function getProduction(date: string) {
  const isToday = date === today();
  const pd = prodDateSql('o');

  // Pedidos que se fabrican este día (y, si es hoy, los que se han quedado atrás).
  const prodOrders = await all(
    `SELECT o.*, ${pd} AS production_day FROM orders o
      WHERE o.status NOT IN ('nuevo','cancelado')
        AND (${pd} = ? ${isToday ? `OR (${pd} < ? AND o.status IN ('confirmado','pendiente','en_preparacion'))` : ''})
      ORDER BY o.delivery_date, o.delivery_time`,
    isToday ? [date, date] : [date],
  );
  // Pedidos que se entregan este día (y, si es hoy, los atrasados sin entregar).
  const deliveryOrders = await all(
    `SELECT o.*, ${PAID_SQL} AS paid FROM orders o
      WHERE o.status NOT IN ('nuevo','cancelado')
        AND (o.delivery_date = ? ${isToday ? `OR (o.delivery_date < ? AND o.status <> 'entregado')` : ''})
      ORDER BY o.delivery_date, o.delivery_time`,
    isToday ? [date, date] : [date],
  );
  const prodIds = new Set(prodOrders.map((o) => o.id));
  const delIds = new Set(deliveryOrders.map((o) => o.id));
  const orderMap = new Map([...prodOrders, ...deliveryOrders].map((o) => [o.id, o]));

  const ids = [...orderMap.keys()];
  const tasks = ids.length
    ? await all(
        `SELECT t.*, oi.flavor, oi.filling, oi.coverage, oi.decoration, oi.custom_text, oi.notes AS item_notes,
                oi.servings, oi.quantity, oi.product_name, oi.size_name, u.name AS done_by_name
           FROM production_tasks t
           LEFT JOIN order_items oi ON oi.id = t.order_item_id
           LEFT JOIN users u ON u.id = t.done_by
          WHERE t.order_id IN (${ids.map(() => '?').join(',')})
          ORDER BY t.sort, t.id`,
        ids,
      )
    : [];

  const stages = STAGES.map((stage) => {
    const list = tasks
      .filter((t) => t.stage === stage && (stage === 'entregar' ? delIds.has(t.order_id) : prodIds.has(t.order_id)))
      .map((t) => {
        const o = orderMap.get(t.order_id);
        return {
          ...t,
          done: !!t.done,
          order_number: o.number,
          customer_name: o.customer_name,
          customer_phone: o.customer_phone,
          delivery_date: o.delivery_date,
          delivery_time: o.delivery_time,
          delivery_type: o.delivery_type,
          delivery_address: o.delivery_address,
          order_status: o.status,
          order_notes: o.notes,
          allergens: parseJson<string[]>(o.allergens, []),
          pending: o.paid !== undefined ? Math.max(0, o.total - o.paid) : null,
        };
      })
      .sort((a, b) =>
        (a.delivery_date + (a.delivery_time || '99')).localeCompare(b.delivery_date + (b.delivery_time || '99')),
      );
    return {
      stage: stage as Stage,
      label: STAGE_LABELS[stage],
      tasks: list,
      total: list.length,
      done: list.filter((t) => t.done).length,
    };
  });

  // Resumen "HOY HAY QUE PREPARAR"
  const items = prodIds.size
    ? await all(
        `SELECT oi.product_name, oi.size_name, oi.flavor, oi.quantity, oi.order_id, p.unit_label, p.category
           FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id IN (${[...prodIds].map(() => '?').join(',')})`,
        [...prodIds],
      )
    : [];
  const summaryMap = new Map<string, any>();
  for (const it of items) {
    const key = [it.product_name, it.size_name ?? '', it.flavor ?? ''].join('|');
    const o = orderMap.get(it.order_id);
    const finished = ['terminado', 'entregado'].includes(o.status);
    const cur = summaryMap.get(key) ?? {
      product_name: it.product_name,
      size_name: it.size_name,
      flavor: it.flavor,
      unit_label: it.unit_label,
      category: it.category,
      quantity: 0,
      done_quantity: 0,
      orders: [] as number[],
    };
    cur.quantity += it.quantity;
    if (finished) cur.done_quantity += it.quantity;
    if (!cur.orders.includes(o.number)) cur.orders.push(o.number);
    summaryMap.set(key, cur);
  }
  const summary = [...summaryMap.values()].sort((a, b) => b.quantity - a.quantity);

  // Ingredientes que aún hay que usar (pedidos sin descontar).
  const cat = await Catalog.load();
  const pendingIds = prodOrders.filter((o) => !o.stock_consumed_at).map((o) => o.id);
  const { req } = await requirementsForOrders(pendingIds, cat);
  const requirements = describeRequirements(req, cat).map(({ cost: _c, ...r }) => r);

  const unconfirmed = await all(
    `SELECT id, number, customer_name, delivery_date, delivery_time FROM orders
      WHERE status = 'nuevo' AND delivery_date <= to_char(?::date + 2, 'YYYY-MM-DD') AND delivery_date >= ?
      ORDER BY delivery_date, delivery_time`,
    [date, isToday ? '0000-00-00' : date],
  );

  const all_tasks = stages.reduce((s, x) => s + x.total, 0);
  const done_tasks = stages.reduce((s, x) => s + x.done, 0);
  return {
    date,
    is_today: isToday,
    summary,
    stages,
    orders: [...orderMap.values()].map((o) => ({
      id: o.id,
      number: o.number,
      customer_name: o.customer_name,
      delivery_date: o.delivery_date,
      delivery_time: o.delivery_time,
      status: o.status,
      producing: prodIds.has(o.id),
      delivering: delIds.has(o.id),
    })),
    requirements,
    unconfirmed,
    progress: { done: done_tasks, total: all_tasks },
  };
}
