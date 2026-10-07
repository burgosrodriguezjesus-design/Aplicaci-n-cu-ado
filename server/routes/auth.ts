import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { tx } from '../db/db.js';
import { COOKIE, h, permissions, requireAuth } from '../http.js';
import { HttpError, badRequest } from '../lib/util.js';
import {
  changePassword,
  createSession,
  createUser,
  login,
  logout,
  SESSION_DAYS,
  usersCount,
} from '../services/auth.js';
import { getSettings, saveSettings } from '../services/settings.js';
import { seedDemo, seedBasics } from '../db/seed.js';
import { visibleSettings } from './core.js';

export const authRouter = Router();

function setCookie(req: Request, res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_DAYS * 86400000,
    path: '/',
  });
}

// Límite sencillo de intentos de inicio de sesión (por IP + usuario).
const attempts = new Map<string, { n: number; until: number }>();
function checkRate(key: string) {
  const a = attempts.get(key);
  if (a && a.until > Date.now() && a.n >= 8) {
    throw new HttpError(429, 'Demasiados intentos. Espera unos minutos y vuelve a probar.');
  }
}
function fail(key: string) {
  if (attempts.size > 5000) {
    const now = Date.now();
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  }
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) attempts.set(key, { n: 1, until: Date.now() + 15 * 60000 });
  else a.n++;
}

authRouter.get(
  '/status',
  h((req) => ({
    needs_setup: usersCount() === 0,
    user: req.user ?? null,
    business_name: getSettings().business_name,
  })),
);

const setupSchema = z.object({
  business_name: z.string().trim().min(1, 'Escribe el nombre del negocio').max(100),
  name: z.string().trim().min(1, 'Escribe tu nombre').max(100),
  username: z.string().trim().min(3, 'El usuario debe tener al menos 3 letras').max(50),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  demo: z.boolean().default(false),
});

authRouter.post(
  '/setup',
  h((req, res) => {
    if (usersCount() > 0) throw badRequest('La aplicación ya está configurada');
    const input = setupSchema.parse(req.body);
    const userId = tx(() => {
      const id = createUser({ name: input.name, username: input.username, password: input.password, role: 'admin' });
      saveSettings({ business_name: input.business_name });
      if (input.demo) seedDemo(id);
      else seedBasics();
      return id;
    });
    setCookie(req, res, createSession(userId));
    return { ok: true };
  }),
);

authRouter.post(
  '/login',
  h((req, res) => {
    const { username, password } = z
      .object({ username: z.string().min(1, 'Escribe tu usuario'), password: z.string().min(1, 'Escribe tu contraseña') })
      .parse(req.body);
    const key = `${req.ip}|${username.toLowerCase()}`;
    checkRate(key);
    const r = login(username, password);
    if (!r) {
      fail(key);
      throw new HttpError(401, 'Usuario o contraseña incorrectos');
    }
    attempts.delete(key);
    setCookie(req, res, r.token);
    return { user: r.user };
  }),
);

authRouter.post(
  '/logout',
  h((req, res) => {
    logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  h((req) => ({ user: req.user, permissions: permissions(req), settings: visibleSettings(req) })),
);

authRouter.post(
  '/password',
  requireAuth,
  h((req) => {
    const { current, next } = z.object({ current: z.string(), next: z.string() }).parse(req.body);
    changePassword(req.user!.id, current, next);
  }),
);
