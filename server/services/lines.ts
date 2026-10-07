// Líneas de producto compartidas por pedidos y presupuestos.
import { z } from 'zod';
import { all, insert, run, update } from '../db/db.js';
import { badRequest, parseJson, round2 } from '../lib/util.js';
import { Catalog, suggestedUnitPrice, type Extra } from './catalog.js';

const optText = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const lineSchema = z.object({
  id: z.number().int().positive().optional(),
  product_id: z.number().int().positive().nullable().optional(),
  product_name: optText,
  size_id: z.number().int().positive().nullable().optional(),
  quantity: z.number().positive('La cantidad debe ser mayor que 0').default(1),
  servings: z.number().positive().nullable().optional(),
  flavor: optText,
  filling: optText,
  coverage: optText,
  decoration: optText,
  custom_text: optText,
  notes: optText,
  extras: z
    .array(z.object({ name: z.string().trim().min(1), price: z.number().min(0) }))
    .default([]),
  unit_price: z.number().min(0).nullable().optional(),
});
export type LineInput = z.infer<typeof lineSchema>;

export interface Line {
  id: number;
  product_id: number | null;
  product_name: string;
  size_id: number | null;
  size_name: string | null;
  quantity: number;
  servings: number | null;
  flavor: string | null;
  filling: string | null;
  coverage: string | null;
  decoration: string | null;
  custom_text: string | null;
  extras: Extra[];
  unit_price: number;
  line_total: number;
  notes: string | null;
  sort: number;
}

type LineTable = 'order_items' | 'quote_items';
const FK: Record<LineTable, string> = { order_items: 'order_id', quote_items: 'quote_id' };

export async function loadLines(table: LineTable, parentId: number): Promise<Line[]> {
  return (await all(`SELECT * FROM ${table} WHERE ${FK[table]} = ? ORDER BY sort, id`, [parentId])).map((r) => ({
    ...r,
    extras: parseJson<Extra[]>(r.extras, []),
  }));
}

/** Prepara las líneas: nombre, tamaño y precio por defecto a partir del catálogo. */
export function normalizeLines(items: LineInput[], cat: Catalog) {
  return items.map((it, i) => {
    const product = it.product_id ? cat.product(it.product_id) : null;
    if (it.product_id && !product) throw badRequest('Uno de los productos ya no existe');
    const size = product?.sizes.find((s) => s.id === it.size_id) ?? null;
    const name = it.product_name || product?.name;
    if (!name) throw badRequest('Cada producto necesita un nombre');
    const unitPrice =
      it.unit_price ?? (product ? suggestedUnitPrice(product, size?.id ?? null, it.servings ?? null) : 0);
    const extrasTotal = it.extras.reduce((s, e) => s + e.price, 0);
    return {
      id: it.id,
      product_id: product?.id ?? null,
      product_name: name,
      size_id: size?.id ?? null,
      size_name: size?.name ?? null,
      quantity: it.quantity,
      servings: it.servings ?? size?.servings ?? (product ? product.servings : null),
      flavor: it.flavor ?? null,
      filling: it.filling ?? null,
      coverage: it.coverage ?? null,
      decoration: it.decoration ?? null,
      custom_text: it.custom_text ?? null,
      notes: it.notes ?? null,
      extras: JSON.stringify(it.extras),
      unit_price: round2(unitPrice),
      line_total: round2(unitPrice * it.quantity + extrasTotal),
      sort: i,
    };
  });
}

export function linesTotal(lines: { line_total: number }[]) {
  return round2(lines.reduce((s, l) => s + l.line_total, 0));
}

/**
 * Guarda las líneas conservando los id existentes (así las tareas de producción
 * ya marcadas no se pierden al editar el pedido).
 */
export async function saveLines(table: LineTable, parentId: number, lines: ReturnType<typeof normalizeLines>) {
  const fk = FK[table];
  const existing = new Set((await all<{ id: number }>(`SELECT id FROM ${table} WHERE ${fk} = ?`, [parentId])).map((r) => r.id));
  const keep = new Set<number>();
  for (const l of lines) {
    const { id, ...data } = l;
    if (id && existing.has(id)) {
      await update(table, id, data);
      keep.add(id);
    } else {
      keep.add(await insert(table, { ...data, [fk]: parentId }));
    }
  }
  for (const id of existing) if (!keep.has(id)) await run(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

export function computeTotal(subtotal: number, deliveryType: string, deliveryFee: number, discount: number) {
  return Math.max(0, round2(subtotal + (deliveryType === 'delivery' ? deliveryFee : 0) - discount));
}
