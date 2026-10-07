import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { all, get, insert, run } from '../db/db.js';
import { now } from '../lib/clock.js';
import { badRequest, notFound } from '../lib/util.js';

export interface SessionUser {
  id: number;
  name: string;
  username: string;
  role: 'admin' | 'employee';
}

export const SESSION_DAYS = 30;

export const userSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
  username: z
    .string()
    .trim()
    .min(3, 'El usuario debe tener al menos 3 letras')
    .max(50)
    .regex(/^[a-zA-Z0-9._@-]+$/, 'El usuario solo puede tener letras, números y . _ - @'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(200).optional(),
  role: z.enum(['admin', 'employee']).default('employee'),
  active: z.boolean().default(true),
});

const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export function hashPassword(pw: string) {
  return bcrypt.hashSync(pw, 10);
}

export function verifyPassword(pw: string, hash: string) {
  return bcrypt.compareSync(pw, hash);
}

export function usersCount() {
  return get<{ n: number }>('SELECT COUNT(*) AS n FROM users')!.n;
}

export function login(username: string, password: string): { token: string; user: SessionUser } | null {
  const u = get('SELECT * FROM users WHERE username = ? AND active = 1', [username.trim()]);
  if (!u || !verifyPassword(password, u.password_hash)) return null;
  return { token: createSession(u.id), user: publicUser(u) };
}

export function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(now().getTime() + SESSION_DAYS * 86400000).toISOString();
  insert('sessions', { token_hash: hashToken(token), user_id: userId, expires_at: expires });
  run('DELETE FROM sessions WHERE expires_at < ?', [now().toISOString()]);
  return token;
}

export function sessionUser(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = get(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    [hashToken(token), now().toISOString()],
  );
  return row ? publicUser(row) : null;
}

export function logout(token: string | undefined) {
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
}

export function publicUser(u: any): SessionUser {
  return { id: u.id, name: u.name, username: u.username, role: u.role };
}

export function listUsers() {
  return all('SELECT id, name, username, role, active, created_at FROM users ORDER BY role, name');
}

export function createUser(raw: unknown) {
  const input = userSchema.parse(raw);
  if (!input.password) throw badRequest('Escribe una contraseña');
  if (get('SELECT id FROM users WHERE username = ?', [input.username])) throw badRequest('Ese usuario ya existe');
  return insert('users', {
    name: input.name,
    username: input.username,
    password_hash: hashPassword(input.password),
    role: input.role,
    active: input.active ? 1 : 0,
  });
}

function activeAdmins(excludeId?: number) {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?", [
    excludeId ?? 0,
  ])!.n;
}

export function updateUser(id: number, raw: unknown) {
  const input = userSchema.parse(raw);
  const u = get('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) throw notFound('Usuario');
  if (get('SELECT id FROM users WHERE username = ? AND id <> ?', [input.username, id])) throw badRequest('Ese usuario ya existe');
  if ((input.role !== 'admin' || !input.active) && u.role === 'admin' && activeAdmins(id) === 0) {
    throw badRequest('Tiene que quedar al menos un administrador activo');
  }
  run('UPDATE users SET name = ?, username = ?, role = ?, active = ? WHERE id = ?', [
    input.name,
    input.username,
    input.role,
    input.active ? 1 : 0,
    id,
  ]);
  if (input.password) {
    run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(input.password), id]);
    run('DELETE FROM sessions WHERE user_id = ?', [id]);
  }
  if (!input.active) run('DELETE FROM sessions WHERE user_id = ?', [id]);
}

export function deleteUser(id: number) {
  const u = get('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) throw notFound('Usuario');
  if (u.role === 'admin' && activeAdmins(id) === 0) throw badRequest('No puedes borrar el último administrador');
  run('DELETE FROM users WHERE id = ?', [id]);
}

export function changePassword(userId: number, current: string, next: string) {
  const u = get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!u || !verifyPassword(current, u.password_hash)) throw badRequest('La contraseña actual no es correcta');
  if (next.length < 6) throw badRequest('La nueva contraseña debe tener al menos 6 caracteres');
  run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(next), userId]);
}
