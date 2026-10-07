import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError, forbidden } from './lib/util.js';
import { sessionUser, type SessionUser } from './services/auth.js';
import { getSettings } from './services/settings.js';
import type { Permission } from '../shared/constants.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

export const COOKIE = 'obrador_sid';

/** Envuelve un manejador: lo que devuelva se envía como JSON. */
export function h(fn: (req: Request, res: Response) => unknown): RequestHandler {
  return async (req, res, next) => {
    try {
      const out = await fn(req, res);
      if (!res.headersSent) {
        if (out === undefined) res.json({ ok: true });
        else res.json(out);
      }
    } catch (e) {
      next(e);
    }
  };
}

export function loadUser(req: Request, _res: Response, next: NextFunction) {
  req.user = sessionUser(req.cookies?.[COOKIE]) ?? undefined;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Tienes que iniciar sesión' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Solo el administrador puede hacer esto' });
    return;
  }
  next();
}

export function can(req: Request, perm: Permission): boolean {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  return !!getSettings()[perm];
}

export function requirePerm(perm: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!can(req, perm)) return next(forbidden());
    next();
  };
}

export function permissions(req: Request) {
  return {
    finances: can(req, 'perm_finances'),
    costs: can(req, 'perm_costs'),
    inventory: can(req, 'perm_inventory'),
    catalog: can(req, 'perm_catalog'),
    delete: can(req, 'perm_delete'),
    admin: req.user?.role === 'admin',
  };
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
  if (typeof e?.code === 'string' && e.code.startsWith('SQLITE_CONSTRAINT')) {
    res.status(400).json({ error: 'No se puede guardar: hay datos relacionados o duplicados' });
    return;
  }
  if (e?.status && e.status < 500) {
    res.status(e.status).json({ error: e.message || 'Petición no válida' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Ha ocurrido un error inesperado' });
}
