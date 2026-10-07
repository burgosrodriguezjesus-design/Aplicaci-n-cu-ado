// Presupuestos: alta, estados y conversión en pedido con un botón.
import { z } from 'zod';
import { all, get, insert, run, tx, update } from '../db/db.js';
import { addDays, nowIso, today } from '../lib/clock.js';
import { badRequest, notFound, parseJson, round2 } from '../lib/util.js';
import { getSettings, nextNumber } from './settings.js';
import { resolveCustomer } from './customers.js';
import { Catalog, productAllergens } from './catalog.js';
import { computeTotal, linesTotal, lineSchema, loadLines, normalizeLines, saveLines } from './lines.js';
import { createOrder } from './orders.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida');
const optText = z
  .string()
  .trim()
  .max(5000)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const quoteSchema = z.object({
  customer_id: z.number().int().positive().nullable().optional(),
  customer_name: z.string().trim().min(1, 'Falta el nombre del cliente').max(200),
  customer_phone: optText,
  save_customer: z.boolean().default(true),
  date: dateStr.optional(),
  valid_until: dateStr.optional(),
  delivery_date: dateStr.nullable().optional().or(z.literal('').transform(() => null)),
  delivery_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  delivery_type: z.enum(['pickup', 'delivery']).default('pickup'),
  delivery_address: optText,
  delivery_fee: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  allergens: z.array(z.string()).default([]),
  notes: optText,
  items: z.array(lineSchema).min(1, 'Añade al menos un producto'),
});

export function quoteStatus(q: { status: string; valid_until: string }) {
  return q.status === 'pending' && q.valid_until < today() ? 'expired' : q.status;
}

export function saveQuote(raw: unknown, userId: number | null, id?: number) {
  const input = quoteSchema.parse(raw);
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
    const date = input.date ?? today();
    const row = {
      customer_id: customerId,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone ?? null,
      date,
      valid_until: input.valid_until ?? addDays(date, getSettings().quote_validity_days),
      delivery_date: input.delivery_date ?? null,
      delivery_time: input.delivery_time ?? null,
      delivery_type: input.delivery_type,
      delivery_address: input.delivery_type === 'delivery' ? (input.delivery_address ?? null) : null,
      delivery_fee: input.delivery_type === 'delivery' ? input.delivery_fee : 0,
      discount: input.discount,
      total,
      allergens: JSON.stringify(input.allergens),
      notes: input.notes ?? null,
    };
    if (id) {
      const q = get('SELECT * FROM quotes WHERE id = ?', [id]);
      if (!q) throw notFound('Presupuesto');
      if (q.status === 'accepted') throw badRequest('Este presupuesto ya se convirtió en pedido; edita el pedido.');
      update('quotes', id, { ...row, updated_at: nowIso() });
    } else {
      id = insert('quotes', { ...row, number: nextNumber('quotes'), created_by: userId });
    }
    saveLines('quote_items', id!, lines);
    return id!;
  });
}

export function listQuotes() {
  return all(
    `SELECT q.*, (SELECT GROUP_CONCAT(qi.product_name, ' · ') FROM quote_items qi WHERE qi.quote_id = q.id) AS summary,
            o.number AS order_number
       FROM quotes q LEFT JOIN orders o ON o.id = q.order_id
      ORDER BY q.date DESC, q.id DESC`,
  ).map((q) => ({ ...q, allergens: parseJson(q.allergens, []), status: quoteStatus(q) }));
}

export function getQuote(id: number) {
  const q = get(
    `SELECT q.*, o.number AS order_number FROM quotes q LEFT JOIN orders o ON o.id = q.order_id WHERE q.id = ?`,
    [id],
  );
  if (!q) throw notFound('Presupuesto');
  const cat = new Catalog();
  const items = loadLines('quote_items', id).map((l) => ({
    ...l,
    contains: l.product_id ? productAllergens(cat, l.product_id) : [],
  }));
  const subtotal = round2(items.reduce((s, l) => s + l.line_total, 0));
  return { ...q, allergens: parseJson(q.allergens, []), status: quoteStatus(q), raw_status: q.status, items, subtotal };
}

export function setQuoteStatus(id: number, status: 'pending' | 'accepted' | 'rejected') {
  const q = get('SELECT * FROM quotes WHERE id = ?', [id]);
  if (!q) throw notFound('Presupuesto');
  if (q.order_id && status !== 'accepted') throw badRequest('Ya se convirtió en pedido');
  run('UPDATE quotes SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
}

export const convertSchema = z.object({
  delivery_date: dateStr.optional(),
  delivery_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  deposit: z.object({ amount: z.number().min(0), method: z.string().min(1) }).nullable().optional(),
});

/** Convierte un presupuesto aceptado en pedido confirmado. */
export function convertQuote(id: number, raw: unknown, userId: number | null) {
  const input = convertSchema.parse(raw ?? {});
  return tx(() => {
    const q = getQuote(id);
    if (q.order_id) return q.order_id as number;
    const deliveryDate = input.delivery_date ?? q.delivery_date;
    if (!deliveryDate) throw badRequest('Indica la fecha de entrega para crear el pedido');
    const orderId = createOrder(
      {
        customer_id: q.customer_id,
        customer_name: q.customer_name,
        customer_phone: q.customer_phone,
        delivery_date: deliveryDate,
        delivery_time: input.delivery_time ?? q.delivery_time,
        delivery_type: q.delivery_type,
        delivery_address: q.delivery_address,
        delivery_fee: q.delivery_fee,
        discount: q.discount,
        allergens: q.allergens,
        notes: q.notes,
        status: 'confirmado',
        quote_id: q.id,
        deposit: input.deposit ?? null,
        items: q.items.map((l: any) => ({
          product_id: l.product_id,
          product_name: l.product_name,
          size_id: l.size_id,
          quantity: l.quantity,
          servings: l.servings,
          flavor: l.flavor,
          filling: l.filling,
          coverage: l.coverage,
          decoration: l.decoration,
          custom_text: l.custom_text,
          notes: l.notes,
          extras: l.extras,
          unit_price: l.unit_price,
        })),
      },
      userId,
    );
    run('UPDATE quotes SET status = ?, order_id = ?, updated_at = ? WHERE id = ?', ['accepted', orderId, nowIso(), id]);
    return orderId;
  });
}

export function deleteQuote(id: number) {
  run('DELETE FROM quotes WHERE id = ?', [id]);
}

