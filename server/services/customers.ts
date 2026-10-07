import { z } from 'zod';
import { all, get, insert, update } from '../db/db.js';
import { normPhone, parseJson } from '../lib/util.js';
import { nowIso } from '../lib/clock.js';

const optText = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  phone: optText,
  email: optText,
  address: optText,
  birthday: z
    .string()
    .regex(/^(\d{4}-|--)\d{2}-\d{2}$/, 'Fecha de cumpleaños no válida')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  allergens: z.array(z.string()).default([]),
  preferences: optText,
  notes: optText,
});
export type CustomerInput = z.infer<typeof customerSchema>;

export function mapCustomer(r: any) {
  return r ? { ...r, allergens: parseJson<string[]>(r.allergens, []) } : r;
}

export function findCustomerByPhone(phone?: string | null) {
  const p = normPhone(phone);
  if (p.length < 6) return undefined;
  // Comparación por dígitos (ignora espacios, guiones y prefijo +34).
  const rows = all<{ id: number; phone: string }>("SELECT id, phone FROM customers WHERE phone IS NOT NULL AND phone <> ''");
  const hit = rows.find((r) => normPhone(r.phone) === p);
  return hit ? get('SELECT * FROM customers WHERE id = ?', [hit.id]) : undefined;
}

export function createCustomer(data: CustomerInput) {
  return insert('customers', { ...data, allergens: JSON.stringify(data.allergens ?? []) });
}

export function updateCustomer(id: number, data: Partial<CustomerInput>) {
  const patch: Record<string, unknown> = { ...data, updated_at: nowIso() };
  if (data.allergens) patch.allergens = JSON.stringify(data.allergens);
  update('customers', id, patch);
}

/**
 * Busca o crea el cliente de un pedido/presupuesto.
 * Devuelve el id o null si no se debe guardar.
 */
export function resolveCustomer(opts: {
  customer_id?: number | null;
  name: string;
  phone?: string | null;
  address?: string | null;
  save: boolean;
}): number | null {
  if (opts.customer_id) {
    const c = get('SELECT * FROM customers WHERE id = ?', [opts.customer_id]);
    if (c) {
      const patch: Record<string, unknown> = {};
      if (!c.phone && opts.phone) patch.phone = opts.phone;
      if (!c.address && opts.address) patch.address = opts.address;
      if (Object.keys(patch).length) updateCustomer(c.id, patch);
      return c.id;
    }
  }
  if (!opts.save) return null;
  const byPhone = findCustomerByPhone(opts.phone);
  if (byPhone) return byPhone.id;
  return createCustomer({
    name: opts.name,
    phone: opts.phone ?? null,
    email: null,
    address: opts.address ?? null,
    birthday: null,
    allergens: [],
    preferences: null,
    notes: null,
  });
}

export function customerStats(id: number) {
  return get(
    `SELECT COUNT(*) AS orders_count,
            COALESCE(SUM(CASE WHEN status = 'entregado' THEN total END), 0) AS total_spent,
            MAX(delivery_date) AS last_order_date
       FROM orders WHERE customer_id = ? AND status <> 'cancelado'`,
    [id],
  );
}
