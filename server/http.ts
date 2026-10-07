import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './lib/util.js';
import { loadSettings } from './services/settings.js';
import { addTenantKey, ensureDb, get, hashKey, insert, legacyTenantBySession, tenantByKey, withTenant, type Tenant } from './db/db.js';
import type { Permission } from '../shared/constants.js';

export interface SessionUser {
  id: number;
  name: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    tenant?: Tenant;
    user?: SessionUser;
  }
}

/** Cookie con la llave de acceso a la pastelería de este dispositivo. */
export const COOKIE = 'obrador_t';
/** Cookie de sesión de la versión anterior (con usuario y contraseña). */
const LEGACY_COOKIE = 'obrador_sid';
const COOKIE_DAYS = 400;

export function setKeyCookie(req: Request, res: Response, token: string) {
  const opts: CookieOptions = { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: COOKIE_DAYS * 86400000, path: '/' };
  res.cookie(COOKIE, token, opts);
}

/** Ejecuta fn con la base de datos de la pastelería: configuración cargada y usuario de la casa. */
export function inTenant<T>(t: Tenant, fn: (user: SessionUser) => Promise<T>): Promise<T> {
  return withTenant(t, async () => {
    await loadSettings();
    let u = await get<SessionUser>('SELECT id, name FROM users WHERE active = 1 ORDER BY (role = \'admin\') DESC, id LIMIT 1');
    if (!u) {
      const id = await insert('users', { name: 'Yo', username: 'yo', password_hash: '-', role: 'admin', active: 1 });
      u = { id, name: 'Yo' };
    }
    return fn(u);
  });
}

/** Envuelve un manejador: corre dentro de la pastelería de quien llama y lo que devuelva se envía como JSON. */
export function h(fn: (req: Request, res: Response) => unknown): RequestHandler {
  return async (req, res, next) => {
    try {
      const out = req.tenant
        ? await inTenant(req.tenant, async (user) => {
            req.user = user;
            return fn(req, res);
          })
        : await fn(req, res);
      if (!res.headersSent) {
        if (out === undefined) res.json({ ok: true });
        else res.json(out);
      }
    } catch (e) {
      next(e);
    }
  };
}

/** Al empezar cada petición: base de datos lista y pastelería de este dispositivo (por su cookie). */
export async function loadUser(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDb();
    const tenant = await tenantByKey(req.cookies?.[COOKIE]);
    if (tenant) req.tenant = tenant;
    else if (req.cookies?.[LEGACY_COOKIE]) {
      // Quien ya tenía la sesión abierta en la versión anterior sigue entrando en su pastelería.
      const legacy = await legacyTenantBySession(hashKey(req.cookies[LEGACY_COOKIE]));
      if (legacy) {
        setKeyCookie(req, res, await addTenantKey(legacy.id));
        req.tenant = legacy;
      }
      res.clearCookie(LEGACY_COOKIE, { path: '/' });
    }
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.tenant) {
    res.status(401).json({ error: 'Primero crea tu pastelería' });
    return;
  }
  next();
}

// Sin usuarios ni roles: quien abre su pastelería puede hacerlo todo en ella.
export function requireAdmin(_req: Request, _res: Response, next: NextFunction) {
  next();
}

export function can(req: Request, _perm?: Permission): boolean {
  return !!req.tenant;
}

export function requirePerm(_perm: Permission) {
  return requireAdmin;
}

export function permissions(req: Request) {
  const ok = can(req);
  return { finances: ok, costs: ok, inventory: ok, catalog: ok, delete: ok, admin: ok };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const msg = issue?.message && !issue.message.startsWith('Invalid') ? issue.message : 'Revisa los datos del formulario';
    res.status(400).json({ error: msg, field: issue?.path?.join('.') });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const e = err as { code?: string; type?: string; status?: number; message?: string };
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: 'El archivo es demasiado grande' });
    return;
  }
  // 23xxx: violación de restricciones en Postgres (duplicados, claves foráneas…)
  if (typeof e?.code === 'string' && e.code.startsWith('23')) {
    res.status(400).json({ error: 'No se puede guardar: hay datos relacionados o duplicados' });
    return;
  }
  // Sin conexión con la base de datos (red, pooler, credenciales…)
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|tenant\/user|Connection terminated|timeout exceeded when trying to connect/i.test(`${e?.code} ${e?.message}`)) {
    console.error(err);
    res.status(503).json({ error: 'No se puede conectar con la base de datos. Prueba otra vez en un momento.' });
    return;
  }
  if (e?.status && e.status < 500) {
    res.status(e.status).json({ error: e.message || 'Petición no válida' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Ha ocurrido un error inesperado' });
}
