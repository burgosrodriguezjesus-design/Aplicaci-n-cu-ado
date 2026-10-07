import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './schema.js';

export type DB = Database.Database;

let instance: DB | null = null;
let currentPath = '';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');

export function defaultDbPath() {
  return path.join(DATA_DIR, 'obrador.db');
}

export function openDb(file = defaultDbPath()): DB {
  if (instance) instance.close();
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  registerFunctions(db);
  migrate(db);
  instance = db;
  currentPath = file;
  return db;
}

/** Funciones SQL propias para buscar sin tildes ni mayúsculas, y por teléfono. */
function registerFunctions(db: DB) {
  db.function('norm', { deterministic: true }, (v: unknown) =>
    v == null ? null : String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  );
  db.function('digits', { deterministic: true }, (v: unknown) => (v == null ? null : String(v).replace(/\D/g, '')));
}

export function migrate(db: DB) {
  const version = db.pragma('user_version', { simple: true }) as number;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}

export function db(): DB {
  if (!instance) openDb();
  return instance!;
}

export function dbPath() {
  return currentPath;
}

export function closeDb() {
  instance?.close();
  instance = null;
}

type Params = unknown[] | Record<string, unknown>;

function bind(params?: Params) {
  if (params === undefined) return [];
  return Array.isArray(params) ? params : [params];
}

export function all<T = any>(sql: string, params?: Params): T[] {
  return db().prepare(sql).all(...bind(params)) as T[];
}

export function get<T = any>(sql: string, params?: Params): T | undefined {
  return db().prepare(sql).get(...bind(params)) as T | undefined;
}

export function run(sql: string, params?: Params) {
  return db().prepare(sql).run(...bind(params));
}

export function insert(table: string, data: Record<string, unknown>): number {
  const keys = Object.keys(data);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((k) => '@' + k).join(',')})`;
  return Number(db().prepare(sql).run(data).lastInsertRowid);
}

export function update(table: string, id: number, data: Record<string, unknown>) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @__id`;
  db().prepare(sql).run({ ...data, __id: id });
}

/** Ejecuta fn dentro de una transacción (anidable). */
export function tx<T>(fn: () => T): T {
  return db().transaction(fn)();
}
