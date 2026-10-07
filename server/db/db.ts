// Acceso a la base de datos (PostgreSQL).
//  - En producción: Postgres (Supabase) con DATABASE_URL.
//  - En local o en pruebas: PGlite (Postgres dentro de Node), sin instalar nada.
// Las transacciones se propagan solas con AsyncLocalStorage: cualquier consulta hecha
// dentro de `tx(...)` usa la misma conexión.
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './schema.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');

interface Result {
  rows: any[];
  rowCount: number;
}
interface Conn {
  query(text: string, params: unknown[]): Promise<Result>;
  /** Varias sentencias seguidas, sin parámetros (migraciones). */
  exec(text: string): Promise<void>;
}
interface Driver extends Conn {
  connect(): Promise<Conn & { release(): void }>;
  end(): Promise<void>;
  kind: 'pg' | 'pglite';
}

let driver: Driver | null = null;
let ready: Promise<void> | null = null;
const als = new AsyncLocalStorage<Conn>();

// ---------------------------------------------------------------------------
// Controladores
// ---------------------------------------------------------------------------

async function pgDriver(url: string): Promise<Driver> {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(20, (v: string) => Number(v)); // bigint (COUNT, SUM de enteros)
  pg.types.setTypeParser(1700, (v: string) => Number(v)); // numeric (ROUND)
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX) || 3,
    idleTimeoutMillis: 10_000,
    ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  const wrap = (r: any): Result => ({ rows: r.rows, rowCount: r.rowCount ?? 0 });
  return {
    kind: 'pg',
    query: async (t, p) => wrap(await pool.query(t, p)),
    exec: async (t) => {
      await pool.query(t);
    },
    connect: async () => {
      const c = await pool.connect();
      return {
        query: async (t, p) => wrap(await c.query(t, p)),
        exec: async (t) => {
          await c.query(t);
        },
        release: () => c.release(),
      };
    },
    end: () => pool.end(),
  };
}

async function pgliteDriver(dataDir: string | null): Promise<Driver> {
  const { PGlite, types } = await import('@electric-sql/pglite');
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const db = new PGlite(dataDir ?? undefined, {
    parsers: { [types.INT8]: (v: string) => Number(v), [types.NUMERIC]: (v: string) => Number(v) },
  });
  // PGlite tiene una sola conexión: las transacciones se ponen en cola.
  let lock: Promise<void> = Promise.resolve();
  const acquire = () => {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = lock;
    lock = prev.then(() => next);
    return prev.then(() => release);
  };
  const run = async (t: string, p: unknown[]): Promise<Result> => {
    const r = await db.query(t, p.map((v) => (Buffer.isBuffer(v) ? new Uint8Array(v) : v)));
    const rows = r.rows.map((row: any) => {
      for (const k in row) if (row[k] instanceof Uint8Array) row[k] = Buffer.from(row[k]);
      return row;
    });
    return { rows, rowCount: r.affectedRows ?? rows.length };
  };
  const exec = async (t: string) => {
    await db.exec(t);
  };
  return {
    kind: 'pglite',
    query: async (t, p) => {
      const release = await acquire();
      try {
        return await run(t, p);
      } finally {
        release();
      }
    },
    exec: async (t) => {
      const release = await acquire();
      try {
        await exec(t);
      } finally {
        release();
      }
    },
    connect: async () => {
      const release = await acquire();
      return { query: run, exec, release };
    },
    end: () => db.close(),
  };
}

/**
 * Abre la base de datos y aplica las migraciones pendientes.
 * `url`: cadena de conexión Postgres; si no hay, PGlite en `dataDir` (o en memoria con 'memory').
 */
export async function openDb(opts: { url?: string | null; dataDir?: string | 'memory' } = {}) {
  if (driver) await closeDb();
  const url = opts.url !== undefined ? opts.url : process.env.DATABASE_URL;
  driver = url
    ? await pgDriver(url)
    : await pgliteDriver(opts.dataDir === 'memory' ? null : (opts.dataDir ?? path.join(DATA_DIR, 'pglite')));
  ready = migrate();
  await ready;
}

/** Garantiza que la base de datos está abierta y migrada (se llama en cada petición). */
export async function ensureDb() {
  if (!driver) {
    if (!ready) ready = openDb();
    await ready;
    return;
  }
  await ready;
}

export async function closeDb() {
  const d = driver;
  driver = null;
  ready = null;
  if (d) await d.end();
}

export function dbKind() {
  return driver?.kind ?? null;
}

async function migrate() {
  await tx(async () => {
    await run('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at text NOT NULL)');
    // Evita que dos instancias migren a la vez.
    await run('SELECT pg_advisory_xact_lock(724519)');
    const done = new Set((await all<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version));
    for (let i = 0; i < MIGRATIONS.length; i++) {
      if (done.has(i + 1)) continue;
      await conn().exec(MIGRATIONS[i]);
      await run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [i + 1, new Date().toISOString()]);
    }
  });
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

function conn(): Conn {
  const c = als.getStore() ?? driver;
  if (!c) throw new Error('La base de datos no está abierta');
  return c;
}

/** Convierte los `?` en `$1, $2…` (respetando los textos entre comillas). */
function placeholders(sql: string) {
  let n = 0;
  let out = '';
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") inStr = !inStr;
    if (ch === '?' && !inStr) out += `$${++n}`;
    else out += ch;
  }
  return out;
}

export async function all<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await conn().query(placeholders(sql), params)).rows as T[];
}

export async function get<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await all<T>(sql, params))[0];
}

export async function run(sql: string, params: unknown[] = []) {
  const r = await conn().query(placeholders(sql), params);
  return { changes: r.rowCount };
}

export async function insert(table: string, data: Record<string, unknown>): Promise<number> {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`;
  const r = await conn().query(sql, keys.map((k) => data[k]));
  return r.rows[0].id as number;
}

export async function update(table: string, id: number, data: Record<string, unknown>) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  if (!keys.length) return;
  const sql = `UPDATE ${table} SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1}`;
  await conn().query(sql, [...keys.map((k) => data[k]), id]);
}

/** Ejecuta fn en una transacción. Si ya hay una en curso, se une a ella. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (als.getStore()) return fn();
  if (!driver) throw new Error('La base de datos no está abierta');
  const c = await driver.connect();
  try {
    await c.query('BEGIN', []);
    const out = await als.run(c, fn);
    await c.query('COMMIT', []);
    return out;
  } catch (e) {
    await c.query('ROLLBACK', []).catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
