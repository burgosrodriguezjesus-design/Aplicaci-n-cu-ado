// Acceso sin usuario ni contraseña: cada dispositivo guarda en una cookie la llave de
// su pastelería. Con el enlace de acceso (la misma llave) se abre en otro móvil.
import { Router } from 'express';
import { z } from 'zod';
import { createTenant, insert, tenantByKey } from '../db/db.js';
import { COOKIE, h, permissions, requireAuth, setKeyCookie } from '../http.js';
import { HttpError } from '../lib/util.js';
import { getSettings, saveSettings } from '../services/settings.js';
import { seedDemo, seedBasics } from '../db/seed.js';
import { visibleSettings } from './core.js';

export const authRouter = Router();

// Límite sencillo por IP para crear pastelerías y probar enlaces.
const attempts = new Map<string, { n: number; until: number }>();
export const resetLimits = () => attempts.clear();
function limit(key: string, max: number, minutes: number) {
  const now = Date.now();
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  const a = attempts.get(key);
  if (!a || a.until < now) attempts.set(key, { n: 1, until: now + minutes * 60000 });
  else if (++a.n > max) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos y vuelve a probar.');
}

authRouter.get(
  '/status',
  h(async (req, res) => {
    // Se renueva la cookie para que no caduque mientras se use.
    if (req.tenant && req.cookies?.[COOKIE]) setKeyCookie(req, res, req.cookies[COOKIE]);
    return {
      has_bakery: !!req.tenant,
      user: req.user ?? null,
      business_name: req.tenant ? getSettings().business_name : '',
    };
  }),
);

const createSchema = z.object({
  business_name: z.string().trim().min(1, 'Escribe el nombre de tu pastelería').max(100),
  name: z.string().trim().max(100).optional(),
  demo: z.boolean().default(false),
});

authRouter.post(
  '/create',
  h(async (req, res) => {
    const input = createSchema.parse(req.body);
    limit(`create|${req.ip}`, 10, 60);
    const t = await createTenant(input.business_name, async () => {
      const userId = await insert('users', { name: input.name || 'Yo', username: 'yo', password_hash: '-', role: 'admin', active: 1 });
      await saveSettings({ business_name: input.business_name });
      if (input.demo) await seedDemo(userId);
      else await seedBasics();
    });
    setKeyCookie(req, res, t.token);
    return { ok: true };
  }),
);

/** Abrir en este dispositivo una pastelería con su enlace de acceso. */
authRouter.post(
  '/enter',
  h(async (req, res) => {
    const { key } = z.object({ key: z.string().trim().min(10, 'El enlace no es válido').max(200) }).parse(req.body);
    limit(`enter|${req.ip}`, 20, 15);
    const token = key.includes('#') ? key.slice(key.lastIndexOf('#') + 1) : key;
    if (!(await tenantByKey(token))) throw new HttpError(400, 'Ese enlace no es válido o la pastelería ya no existe');
    setKeyCookie(req, res, token);
    return { ok: true };
  }),
);

/** Enlace para abrir esta pastelería en otro dispositivo. */
authRouter.get(
  '/link',
  requireAuth,
  h((req) => ({ key: req.cookies[COOKIE] })),
);

/** Dejar de usar la pastelería en este dispositivo (los datos no se borran). */
authRouter.post(
  '/leave',
  h((_req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  h((req) => ({ user: req.user, bakery_id: req.tenant!.id, permissions: permissions(req), settings: visibleSettings(req) })),
);
