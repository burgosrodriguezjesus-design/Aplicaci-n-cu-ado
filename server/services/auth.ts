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
  return bcrypt.hash(pw, 10);
}

export function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function usersCount() {
  return (await get<{ n: number }>('SELECT COUNT(*) AS n FROM users'))!.n;
}

export async function login(username: string, password: string): Promise<{ token: string; user: SessionUser } | null> {
  const u = await get('SELECT * FROM users WHERE lower(username) = lower(?) AND active = 1', [username.trim()]);
  if (!u || !(await verifyPassword(password, u.password_hash))) return null;
  return { token: await createSession(u.id), user: publicUser(u) };
}

export function tokenHash(token: string) {
  return hashToken(token);
}

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(now().getTime() + SESSION_DAYS * 86400000).toISOString();
  await run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [hashToken(token), userId, expires]);
  await run('DELETE FROM sessions WHERE expires_at < ?', [now().toISOString()]);
  return token;
}

export async function sessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const row = await get(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    [hashToken(token), now().toISOString()],
  );
  return row ? publicUser(row) : null;
}

export async function logout(token: string | undefined) {
  if (token) await run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
}

export function publicUser(u: any): SessionUser {
  return { id: u.id, name: u.name, username: u.username, role: u.role };
}

export function listUsers() {
  return all('SELECT id, name, username, role, active, created_at FROM users ORDER BY role, name');
}

export async function createUser(raw: unknown) {
  const input = userSchema.parse(raw);
  if (!input.password) throw badRequest('Escribe una contraseña');
  if (await get('SELECT id FROM users WHERE lower(username) = lower(?)', [input.username])) throw badRequest('Ese usuario ya existe');
  return insert('users', {
    name: input.name,
    username: input.username,
    password_hash: await hashPassword(input.password),
    role: input.role,
    active: input.active ? 1 : 0,
  });
}

async function activeAdmins(excludeId?: number) {
  return (await get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?", [
    excludeId ?? 0,
  ]))!.n;
}

export async function updateUser(id: number, raw: unknown) {
  const input = userSchema.parse(raw);
  const u = await get('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) throw notFound('Usuario');
  if (await get('SELECT id FROM users WHERE lower(username) = lower(?) AND id <> ?', [input.username, id])) throw badRequest('Ese usuario ya existe');
  if ((input.role !== 'admin' || !input.active) && u.role === 'admin' && (await activeAdmins(id)) === 0) {
    throw badRequest('Tiene que quedar al menos un administrador activo');
  }
  await run('UPDATE users SET name = ?, username = ?, role = ?, active = ? WHERE id = ?', [
    input.name,
    input.username,
    input.role,
    input.active ? 1 : 0,
    id,
  ]);
  if (input.password) {
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(input.password), id]);
    await run('DELETE FROM sessions WHERE user_id = ?', [id]);
  }
  if (!input.active) await run('DELETE FROM sessions WHERE user_id = ?', [id]);
}

export async function deleteUser(id: number) {
  const u = await get('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) throw notFound('Usuario');
  if (u.role === 'admin' && (await activeAdmins(id)) === 0) throw badRequest('No puedes borrar el último administrador');
  await run('DELETE FROM users WHERE id = ?', [id]);
}

export async function changePassword(userId: number, current: string, next: string) {
  const u = await get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!u || !(await verifyPassword(current, u.password_hash))) throw badRequest('La contraseña actual no es correcta');
  if (next.length < 6) throw badRequest('La nueva contraseña debe tener al menos 6 caracteres');
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(next), userId]);
}
