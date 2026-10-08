// Análisis automáticos del negocio (sin IA): previsión de ingredientes, rentabilidad de
// productos y plan de producción. Los usa la pantalla del asistente y también el chat
// con IA como herramientas para responder con datos reales.
import { all } from '../db/db.js';
import { addDays, today } from '../lib/clock.js';
import { round2 } from '../lib/util.js';
import { getSettings } from './settings.js';
import {
  addLineRequirements,
  Catalog,
  productCost,
  requirementsForOrders,
  servingsPerUnit,
  type LineLike,
  type Requirements,
} from './catalog.js';
import { isLow, roundPurchase } from './inventory.js';
import { prodDateSql } from './orders.js';

const HISTORY_DAYS = 56; // ventana para calcular el consumo medio (8 semanas)

// ---------------------------------------------------------------------------
// Previsión de ingredientes y materiales
// ---------------------------------------------------------------------------

export interface ForecastRow {
  item_id: number;
  name: string;
  kind: 'ingredient' | 'material';
  unit: string;
  stock: number;
  min_stock: number;
  /** Lo que piden los pedidos ya apuntados para estos días (sin descontar todavía). */
  committed: number;
  /** Parte de lo anterior que viene de pedidos sin confirmar. */
  committed_unconfirmed: number;
  /** Consumo medio diario de las últimas 8 semanas. */
  avg_daily: number;
  /** Previsión para el periodo: lo apuntado o, si suele gastarse más, lo habitual. */
  forecast: number;
  /** Días que dura el stock al ritmo habitual (null si no hay consumo). */
  coverage_days: number | null;
  /** Fecha aproximada en la que se acaba. */
  runs_out: string | null;
  shortfall: number;
  suggested_purchase: number;
  est_cost: number;
  supplier: string | null;
  status: 'falta' | 'justo' | 'ok';
}

export async function ingredientForecast(days = 14) {
  const t = today();
  const until = addDays(t, days);
  const cat = await Catalog.load();
  const pending = await all<{ id: number; status: string }>(
    `SELECT id, status FROM orders
      WHERE status IN ('nuevo','confirmado','pendiente','en_preparacion') AND stock_consumed_at IS NULL AND delivery_date <= ?`,
    [until],
  );
  const confirmed = await requirementsForOrders(
    pending.filter((o) => o.status !== 'nuevo').map((o) => o.id),
    cat,
  );
  const unconfirmed = await requirementsForOrders(
    pending.filter((o) => o.status === 'nuevo').map((o) => o.id),
    cat,
  );
  const used = await all<{ item_id: number; qty: number }>(
    `SELECT item_id, SUM(-quantity) AS qty FROM inventory_movements
      WHERE type = 'consumption' AND substr(created_at, 1, 10) >= ? GROUP BY item_id`,
    [addDays(t, -HISTORY_DAYS)],
  );
  const usedMap = new Map(used.map((u) => [u.item_id, Math.max(0, u.qty)]));

  const rows: ForecastRow[] = [];
  for (const item of cat.allItems().filter((i) => i.active)) {
    const committedConf = confirmed.req.get(item.id) || 0;
    const committedNew = unconfirmed.req.get(item.id) || 0;
    const committed = committedConf + committedNew;
    const avgDaily = (usedMap.get(item.id) || 0) / HISTORY_DAYS;
    if (!committed && !avgDaily && !isLow(item)) continue;
    const forecast = Math.max(committed, avgDaily * days);
    // Días que aguanta lo que queda después de servir los pedidos ya apuntados.
    const coverage = avgDaily > 0 ? Math.max(0, item.quantity - committed) / avgDaily : null;
    const coverageDays = avgDaily > 0 ? Math.floor(Math.max(0, item.quantity) / avgDaily) : null;
    const shortfall = Math.max(0, forecast + item.min_stock - item.quantity);
    const suggested = roundPurchase(shortfall, item.unit, item.pack_size);
    const status: ForecastRow['status'] =
      forecast > item.quantity + 1e-9 ? 'falta' : shortfall > 1e-9 || (coverage !== null && coverage < days) ? 'justo' : 'ok';
    rows.push({
      item_id: item.id,
      name: item.name,
      kind: item.kind,
      unit: item.unit,
      stock: round2(item.quantity),
      min_stock: item.min_stock,
      committed: round2(committed),
      committed_unconfirmed: round2(committedNew),
      avg_daily: round2(avgDaily),
      forecast: round2(forecast),
      coverage_days: coverageDays,
      runs_out: coverageDays !== null && coverageDays <= days * 2 ? addDays(t, coverageDays) : null,
      shortfall: round2(shortfall),
      suggested_purchase: suggested,
      est_cost: round2(suggested * item.cost_per_unit),
      supplier: item.supplier ?? null,
      status,
    });
  }
  const order = { falta: 0, justo: 1, ok: 2 };
  rows.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name, 'es'));
  return {
    days,
    from: t,
    until,
    orders_considered: pending.length,
    unconfirmed_orders: pending.filter((o) => o.status === 'nuevo').length,
    has_history: used.length > 0,
    items: rows,
    total_est_cost: round2(rows.reduce((s, r) => s + r.est_cost, 0)),
  };
}

// ---------------------------------------------------------------------------
// Rentabilidad de productos
// ---------------------------------------------------------------------------

export interface ProfitRow {
  product_id: number;
  name: string;
  category: string;
  variant: string | null;
  price: number;
  cost: number;
  profit: number;
  margin: number; // 0..1
  recommended_price: number;
  has_costing: boolean;
  units_sold: number;
  revenue: number;
  total_profit: number;
  flags: ('pierde_dinero' | 'margen_bajo' | 'sin_escandallo' | 'no_se_vende' | 'precio_bajo')[];
}

export async function productProfitability(days = 90) {
  const s = getSettings();
  const target = (s.target_margin_percent || 0) / 100;
  const lowMargin = Math.max(0.2, target * 0.6);
  const cat = await Catalog.load();
  const from = addDays(today(), -days);
  const sales = await all<{ product_id: number; size_id: number | null; units: number; revenue: number }>(
    `SELECT oi.product_id, oi.size_id, SUM(oi.quantity) AS units, SUM(oi.line_total) AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status <> 'cancelado' AND o.delivery_date BETWEEN ? AND ? AND oi.product_id IS NOT NULL
      GROUP BY oi.product_id, oi.size_id`,
    [from, today()],
  );
  const salesKey = (p: number, sz: number | null) => `${p}:${sz ?? ''}`;
  const salesMap = new Map(sales.map((r) => [salesKey(r.product_id, r.size_id), r]));

  const rows: ProfitRow[] = [];
  for (const p of cat.allProducts().filter((x) => x.active)) {
    const variants = p.sizes.length ? p.sizes.map((sz) => ({ id: sz.id as number | null, name: sz.name as string | null })) : [{ id: null, name: null }];
    for (const v of variants) {
      const c = productCost(cat, p, { sizeId: v.id });
      const sold = salesMap.get(salesKey(p.id, v.id));
      const units = sold?.units ?? 0;
      const revenue = sold?.revenue ?? 0;
      const hasCosting = p.components.length > 0;
      const flags: ProfitRow['flags'] = [];
      if (!hasCosting) flags.push('sin_escandallo');
      else if (c.price > 0 && c.profit < 0) flags.push('pierde_dinero');
      else if (c.price > 0 && c.margin < lowMargin) flags.push('margen_bajo');
      if (hasCosting && c.price > 0 && c.price < c.recommended_price * 0.9) flags.push('precio_bajo');
      if (!units) flags.push('no_se_vende');
      rows.push({
        product_id: p.id,
        name: p.name,
        category: p.category,
        variant: v.name,
        price: c.price,
        cost: c.total,
        profit: c.profit,
        margin: round2(c.margin),
        recommended_price: c.recommended_price,
        has_costing: hasCosting,
        units_sold: units,
        revenue: round2(revenue),
        total_profit: round2(units * c.profit),
        flags,
      });
    }
  }
  rows.sort((a, b) => (a.has_costing === b.has_costing ? a.margin - b.margin : a.has_costing ? -1 : 1));
  return {
    days,
    target_margin: target,
    low_margin_threshold: round2(lowMargin),
    products: rows,
    worst: rows.filter((r) => r.flags.some((f) => f === 'pierde_dinero' || f === 'margen_bajo' || f === 'precio_bajo')),
  };
}

// ---------------------------------------------------------------------------
// Plan de producción
// ---------------------------------------------------------------------------

export async function productionPlan(days = 7) {
  const t = today();
  const until = addDays(t, days - 1);
  const pd = prodDateSql('o');
  const cat = await Catalog.load();
  const orders = await all(
    `SELECT o.id, o.number, o.customer_name, o.status, o.delivery_date, o.delivery_time, ${pd} AS production_day,
            (SELECT COUNT(*) FROM production_tasks t WHERE t.order_id = o.id AND t.done = 0 AND t.stage <> 'entregar') AS tasks_left
       FROM orders o
      WHERE o.status IN ('nuevo','confirmado','pendiente','en_preparacion') AND ${pd} <= ?
      ORDER BY ${pd}, o.delivery_date, o.delivery_time`,
    [until],
  );
  const ids = orders.map((o) => o.id);
  const lines = ids.length
    ? await all<LineLike & { order_id: number; product_name: string; size_name: string | null }>(
        `SELECT order_id, product_id, size_id, quantity, servings, product_name, size_name FROM order_items
          WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort, id`,
        ids,
      )
    : [];

  // Stock que se va gastando día a día para detectar cuándo faltará algo.
  const stock = new Map(cat.allItems().map((i) => [i.id, i.quantity]));
  const dayList: string[] = [];
  for (let i = 0; i < days; i++) dayList.push(addDays(t, i));

  const plan = dayList.map((day) => {
    const dayOrders = orders.filter((o) => (day === t ? o.production_day <= day : o.production_day === day));
    let minutes = 0;
    const products = new Map<string, { name: string; quantity: number }>();
    const recipeUse = new Map<number, { name: string; batches: number; orders: Set<number> }>();
    const req: Requirements = new Map();
    for (const o of dayOrders) {
      for (const l of lines.filter((x) => x.order_id === o.id)) {
        const product = l.product_id ? cat.product(l.product_id) : null;
        const key = `${l.product_name}${l.size_name ? ` (${l.size_name})` : ''}`;
        const cur = products.get(key) ?? { name: key, quantity: 0 };
        cur.quantity += l.quantity;
        products.set(key, cur);
        if (o.status !== 'en_preparacion') addLineRequirements(cat, req, l);
        if (!product) continue;
        minutes += productCost(cat, product, { sizeId: l.size_id, servings: l.servings }).labor_minutes * l.quantity;
        const totalServings = servingsPerUnit(product, l) * l.quantity;
        for (const comp of product.components) {
          if (!comp.recipe_id || (comp.size_id && comp.size_id !== l.size_id)) continue;
          const recipe = cat.recipe(comp.recipe_id);
          if (!recipe) continue;
          const use = recipeUse.get(recipe.id) ?? { name: recipe.name, batches: 0, orders: new Set<number>() };
          use.batches += (comp.quantity * totalServings) / recipe.servings;
          use.orders.add(o.number);
          recipeUse.set(recipe.id, use);
          minutes += ((recipe.prep_minutes || 0) * ((comp.quantity * totalServings) / recipe.servings)) || 0;
        }
      }
    }
    const shortages: { item_id: number; name: string; unit: string; missing: number }[] = [];
    for (const [itemId, qty] of req) {
      const left = (stock.get(itemId) ?? 0) - qty;
      stock.set(itemId, left);
      if (left < -1e-9) {
        const item = cat.item(itemId);
        if (item) shortages.push({ item_id: itemId, name: item.name, unit: item.unit, missing: round2(-left) });
      }
    }
    return {
      date: day,
      orders: dayOrders.map((o) => ({
        id: o.id,
        number: o.number,
        customer_name: o.customer_name,
        status: o.status,
        delivery_date: o.delivery_date,
        delivery_time: o.delivery_time,
        overdue: o.production_day < t,
        tasks_left: o.tasks_left,
      })),
      products: [...products.values()],
      batches: [...recipeUse.values()]
        .filter((r) => r.orders.size > 1)
        .map((r) => ({ recipe: r.name, batches: round2(r.batches), orders: [...r.orders] })),
      minutes: Math.round(minutes),
      shortages,
    };
  });
  const busiest = plan.reduce((a, b) => (b.minutes > a.minutes ? b : a), plan[0]);
  return {
    days,
    from: t,
    until,
    plan,
    busiest_day: busiest && busiest.minutes > 0 ? busiest.date : null,
    unconfirmed: orders.filter((o) => o.status === 'nuevo').map((o) => o.number),
    total_minutes: plan.reduce((s, d) => s + d.minutes, 0),
  };
}
