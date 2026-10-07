import express, { Router, type Request } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { all, get, insert, run } from '../db/db.js';
import { can, h, permissions, requireAdmin } from '../http.js';
import { today } from '../lib/clock.js';
import { badRequest, forbidden, notFound, toId } from '../lib/util.js';
import { getSettings, saveSettings } from '../services/settings.js';
import { createUser, deleteUser, listUsers, updateUser } from '../services/auth.js';
import { getDashboard, getReminders, search } from '../services/dashboard.js';
import { runAutomations } from '../services/orders.js';
import {
  backupFile,
  createBackup,
  listBackups,
  restoreBackup,
  snapshotToTemp,
} from '../services/backup.js';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/constants.js';

export const coreRouter = Router();

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

const PUBLIC_KEYS: (keyof Settings)[] = [
  'business_name',
  'business_phone',
  'business_address',
  'timezone',
  'production_lead_days',
  'shopping_horizon_days',
  'default_delivery_fee',
  'deposit_percent',
  'quote_validity_days',
];

/** Los empleados solo ven la configuración que necesitan para trabajar. */
export function visibleSettings(req: Request): Partial<Settings> {
  const s = getSettings();
  if (req.user?.role === 'admin') return s;
  const out: Partial<Settings> = {};
  for (const k of PUBLIC_KEYS) (out as any)[k] = s[k];
  if (can(req, 'perm_costs')) {
    out.labor_cost_per_hour = s.labor_cost_per_hour;
    out.overhead_percent = s.overhead_percent;
    out.target_margin_percent = s.target_margin_percent;
  }
  return out;
}

coreRouter.get('/settings', h((req) => visibleSettings(req)));

const settingsSchema = z
  .object({
    business_name: z.string().trim().min(1).max(100),
    business_phone: z.string().trim().max(50),
    business_address: z.string().trim().max(300),
    timezone: z.string().trim().min(1).max(60),
    production_lead_days: z.number().int().min(0).max(14),
    shopping_horizon_days: z.number().int().min(1).max(60),
    labor_cost_per_hour: z.number().min(0).max(500),
    overhead_percent: z.number().min(0).max(200),
    target_margin_percent: z.number().min(0).max(95),
    default_delivery_fee: z.number().min(0).max(500),
    deposit_percent: z.number().min(0).max(100),
    quote_validity_days: z.number().int().min(1).max(365),
    low_stock_include_orders: z.boolean(),
    perm_finances: z.boolean(),
    perm_costs: z.boolean(),
    perm_inventory: z.boolean(),
    perm_catalog: z.boolean(),
    perm_delete: z.boolean(),
  })
  .partial();

coreRouter.put(
  '/settings',
  requireAdmin,
  h((req) => {
    const patch = settingsSchema.parse(req.body);
    if (patch.timezone) {
      try {
        new Intl.DateTimeFormat('es-ES', { timeZone: patch.timezone });
      } catch {
        throw badRequest('Zona horaria no válida');
      }
    }
    return saveSettings(patch);
  }),
);

coreRouter.get('/settings/defaults', requireAdmin, h(() => DEFAULT_SETTINGS));

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

coreRouter.get('/users', requireAdmin, h(() => listUsers()));
coreRouter.post('/users', requireAdmin, h((req) => ({ id: createUser(req.body) })));
coreRouter.put(
  '/users/:id',
  requireAdmin,
  h((req) => updateUser(toId(req.params.id), req.body)),
);
coreRouter.delete(
  '/users/:id',
  requireAdmin,
  h((req) => {
    const id = toId(req.params.id);
    if (id === req.user!.id) throw badRequest('No puedes borrar tu propio usuario');
    deleteUser(id);
  }),
);

// ---------------------------------------------------------------------------
// Panel, recordatorios y buscador
// ---------------------------------------------------------------------------

coreRouter.get(
  '/dashboard',
  h((req) => {
    runAutomations();
    return { ...getDashboard({ finances: can(req, 'perm_finances') }), permissions: permissions(req) };
  }),
);

coreRouter.get(
  '/reminders',
  h(() => {
    runAutomations();
    return getReminders();
  }),
);

coreRouter.post(
  '/reminders',
  h((req) => {
    const input = z
      .object({
        text: z.string().trim().min(1, 'Escribe el recordatorio').max(500),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        order_id: z.number().int().positive().nullable().optional(),
      })
      .parse(req.body);
    return {
      id: insert('reminders', {
        text: input.text,
        due_date: input.due_date ?? null,
        order_id: input.order_id ?? null,
        created_by: req.user!.id,
      }),
    };
  }),
);

coreRouter.get(
  '/reminders/manual',
  h(() =>
    all(
      `SELECT r.*, o.number AS order_number FROM reminders r LEFT JOIN orders o ON o.id = r.order_id
        WHERE r.done = 0 OR r.created_at >= date(?, '-7 days') ORDER BY r.done, r.due_date IS NULL, r.due_date`,
      [today()],
    ),
  ),
);

coreRouter.patch(
  '/reminders/:id',
  h((req) => {
    const { done } = z.object({ done: z.boolean() }).parse(req.body);
    run('UPDATE reminders SET done = ? WHERE id = ?', [done ? 1 : 0, toId(req.params.id)]);
  }),
);

coreRouter.delete(
  '/reminders/:id',
  h((req) => {
    run('DELETE FROM reminders WHERE id = ?', [toId(req.params.id)]);
  }),
);

coreRouter.get(
  '/search',
  h((req) => search(typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '')),
);

// ---------------------------------------------------------------------------
// Imágenes (se guardan en la base de datos ya comprimidas desde el móvil)
// ---------------------------------------------------------------------------

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

coreRouter.post(
  '/images',
  express.raw({ type: IMAGE_TYPES, limit: '8mb' }),
  h((req) => {
    const type = String(req.headers['content-type'] || '').split(';')[0];
    if (!IMAGE_TYPES.includes(type) || !Buffer.isBuffer(req.body) || !req.body.length) {
      throw badRequest('Sube una imagen JPG, PNG o WEBP');
    }
    return { id: insert('images', { mime: type, data: req.body }) };
  }),
);

coreRouter.get('/images/:id', (req, res) => {
  const img = get<{ mime: string; data: Buffer }>('SELECT mime, data FROM images WHERE id = ?', [toId(req.params.id)]);
  if (!img) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', img.mime);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(img.data);
});

// ---------------------------------------------------------------------------
// Copias de seguridad
// ---------------------------------------------------------------------------

coreRouter.get('/backups', requireAdmin, h(() => listBackups()));
coreRouter.post('/backups', requireAdmin, h(() => ({ name: createBackup('manual') })));

coreRouter.get('/backups/download/current', requireAdmin, (req, res, next) => {
  try {
    const tmp = snapshotToTemp();
    res.download(tmp, `copia-pasteleria-${today()}.sqlite`, () => fs.rmSync(tmp, { force: true }));
  } catch (e) {
    next(e);
  }
});

coreRouter.get('/backups/download/:name', requireAdmin, (req, res) => {
  const file = backupFile(String(req.params.name));
  if (!file) {
    res.status(404).json({ error: 'Copia no encontrada' });
    return;
  }
  res.download(file);
});

coreRouter.post(
  '/backups/restore',
  requireAdmin,
  express.raw({ type: () => true, limit: '500mb' }),
  h((req) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Selecciona un archivo de copia');
    restoreBackup(req.body);
  }),
);

coreRouter.post(
  '/backups/restore/:name',
  requireAdmin,
  h((req) => {
    const file = backupFile(String(req.params.name));
    if (!file) throw notFound('Copia');
    restoreBackup(fs.readFileSync(file));
  }),
);

// ---------------------------------------------------------------------------
// Exportar a Excel (CSV)
// ---------------------------------------------------------------------------

function csv(rows: Record<string, unknown>[], columns: [string, string][]) {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c[1])).join(';');
  const body = rows.map((r) => columns.map((c) => esc(r[c[0]])).join(';'));
  return '﻿' + [head, ...body].join('\r\n');
}

const EXPORTS: Record<string, { finance?: boolean; sql: string; columns: [string, string][] }> = {
  pedidos: {
    sql: `SELECT o.number, o.order_date, o.delivery_date, o.delivery_time, o.customer_name, o.customer_phone, o.status,
                 o.delivery_type, o.total,
                 (SELECT COALESCE(SUM(CASE WHEN p.kind='refund' THEN -p.amount ELSE p.amount END),0) FROM payments p WHERE p.order_id=o.id) AS paid,
                 (SELECT GROUP_CONCAT(oi.quantity || ' x ' || oi.product_name, ' | ') FROM order_items oi WHERE oi.order_id=o.id) AS products
            FROM orders o ORDER BY o.number`,
    columns: [
      ['number', 'Nº pedido'],
      ['order_date', 'Fecha pedido'],
      ['delivery_date', 'Fecha entrega'],
      ['delivery_time', 'Hora'],
      ['customer_name', 'Cliente'],
      ['customer_phone', 'Teléfono'],
      ['products', 'Productos'],
      ['status', 'Estado'],
      ['delivery_type', 'Entrega'],
      ['total', 'Total'],
      ['paid', 'Cobrado'],
    ],
  },
  clientes: {
    sql: `SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id AND o.status<>'cancelado') AS n FROM customers c ORDER BY c.name`,
    columns: [
      ['name', 'Nombre'],
      ['phone', 'Teléfono'],
      ['email', 'Email'],
      ['address', 'Dirección'],
      ['birthday', 'Cumpleaños'],
      ['n', 'Pedidos'],
      ['preferences', 'Preferencias'],
      ['notes', 'Notas'],
    ],
  },
  gastos: {
    finance: true,
    sql: `SELECT * FROM expenses ORDER BY date`,
    columns: [
      ['date', 'Fecha'],
      ['category', 'Categoría'],
      ['description', 'Descripción'],
      ['supplier', 'Proveedor'],
      ['payment_method', 'Forma de pago'],
      ['amount', 'Importe'],
    ],
  },
  cobros: {
    finance: true,
    sql: `SELECT p.*, o.number, o.customer_name FROM payments p LEFT JOIN orders o ON o.id = p.order_id ORDER BY p.paid_at`,
    columns: [
      ['paid_at', 'Fecha'],
      ['kind', 'Tipo'],
      ['number', 'Nº pedido'],
      ['customer_name', 'Cliente'],
      ['description', 'Concepto'],
      ['method', 'Forma de pago'],
      ['amount', 'Importe'],
    ],
  },
  inventario: {
    sql: `SELECT * FROM inventory_items WHERE active = 1 ORDER BY kind, name`,
    columns: [
      ['name', 'Artículo'],
      ['kind', 'Tipo'],
      ['quantity', 'Cantidad'],
      ['unit', 'Unidad'],
      ['min_stock', 'Stock mínimo'],
      ['cost_per_unit', 'Precio por unidad'],
      ['supplier', 'Proveedor'],
    ],
  },
};

coreRouter.get('/export/:what', (req, res, next) => {
  try {
    const def = EXPORTS[String(req.params.what)];
    if (!def) throw notFound('Exportación');
    if (def.finance && !can(req, 'perm_finances')) throw forbidden();
    if (req.user?.role !== 'admin' && !def.finance && !can(req, 'perm_finances')) throw forbidden();
    const body = csv(all(def.sql), def.columns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.what}-${today()}.csv"`);
    res.send(body);
  } catch (e) {
    next(e);
  }
});
