// Acceso a la base de datos (PostgreSQL).
//  - En producción: Postgres (Supabase) con DATABASE_URL.
//  - En local o en pruebas: PGlite (Postgres dentro de Node), sin instalar nada.
// Las transacciones se propagan solas con AsyncLocalStorage: cualquier consulta hecha
// dentro de `tx(...)` usa la misma conexión.
//
// Cada pastelería tiene su propio esquema de Postgres (t_xxxxxxxx) con todas sus tablas.
// `withTenant` abre una transacción con `SET LOCAL search_path` a ese esquema, así el
// resto del código usa nombres de tabla normales y nunca ve los datos de otra pastelería.
// En el esquema base solo están `tenants` (las pastelerías) y `tenant_keys` (los accesos).
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
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
/** Esquema base (el de la conexión), donde está la lista de pastelerías. */
let base = 'public';

export interface Tenant {
  id: number;
  schema: string;
  version: number;
}
export interface TenantCtx extends Tenant {
  /** Datos de la petición en curso que dependen de la pastelería (configuración…). */
  [key: string]: unknown;
}
const tenantAls = new AsyncLocalStorage<TenantCtx>();
const SCHEMA_RE = /^t_[0-9a-f]{8,32}$/;

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
  ready = setupBase();
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

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
/** Nombre completo de una tabla del esquema base (tenants, tenant_keys). */
export const baseTable = (t: 'tenants' | 'tenant_keys') => `${q(base)}.${t}`;

/** Prepara el esquema base. Si hay datos de antes (una sola pastelería), los pasa a su propio esquema. */
async function setupBase() {
  base = (await get<{ s: string }>('SELECT current_schema() AS s'))!.s;
  await tx(async () => {
    // Evita que dos instancias preparen la base a la vez.
    await run('SELECT pg_advisory_xact_lock(724519)');
    await conn().exec(`
      CREATE TABLE IF NOT EXISTS ${baseTable('tenants')} (
        id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        schema text NOT NULL UNIQUE,
        name text,
        version integer NOT NULL DEFAULT 0,
        legacy boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS ${baseTable('tenant_keys')} (
        token_hash text PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES ${baseTable('tenants')}(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS tenant_keys_tenant ON ${baseTable('tenant_keys')} (tenant_id);
    `);
    const legacy = await get<{ t: string | null }>('SELECT to_regclass(?) AS t', [`${q(base)}.users`]);
    if (legacy?.t) await moveLegacy();
  });
}

/** Instalación antigua (una sola pastelería en el esquema base): se mueve a su propio esquema. */
async function moveLegacy() {
  const schema = newSchemaName();
  await conn().exec(`CREATE SCHEMA ${q(schema)}`);
  const tables = await all<{ t: string }>(
    "SELECT tablename AS t FROM pg_tables WHERE schemaname = ? AND tablename NOT IN ('tenants', 'tenant_keys')",
    [base],
  );
  for (const { t } of tables) await conn().exec(`ALTER TABLE ${q(base)}.${q(t)} SET SCHEMA ${q(schema)}`);
  const fns = await all<{ sig: string }>(
    `SELECT p.oid::regprocedure::text AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = ? AND p.proname IN ('norm', 'digits')`,
    [base],
  );
  for (const { sig } of fns) await conn().exec(`ALTER FUNCTION ${q(base)}.${sig.replace(/^.*\./, '')} SET SCHEMA ${q(schema)}`);
  // (dentro de la transacción no se puede dejar fallar una consulta: se mira antes si la tabla existe)
  const has = async (t: string) => !!(await get<{ t: string | null }>('SELECT to_regclass(?) AS t', [`${q(schema)}.${t}`]))?.t;
  const v = (await has('schema_migrations')) ? await get<{ v: number | null }>(`SELECT MAX(version) AS v FROM ${q(schema)}.schema_migrations`) : undefined;
  const name = (await has('settings')) ? await get<{ value: string }>(`SELECT value FROM ${q(schema)}.settings WHERE key = 'business_name'`) : undefined;
  await run(`INSERT INTO ${baseTable('tenants')} (schema, name, version, legacy) VALUES (?, ?, ?, true)`, [
    schema,
    name ? safeJson(name.value) : null,
    v?.v ?? 0,
  ]);
}

function safeJson(v: string) {
  try {
    return String(JSON.parse(v));
  } catch {
    return v;
  }
}

function newSchemaName() {
  return `t_${crypto.randomBytes(8).toString('hex')}`;
}

/** Aplica las migraciones pendientes al esquema de la pastelería (dentro de withTenant). */
async function migrateTenant(t: Tenant) {
  await run('SELECT pg_advisory_xact_lock(724519, ?)', [t.id]);
  await run('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at text NOT NULL)');
  const done = new Set((await all<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version));
  for (let i = 0; i < MIGRATIONS.length; i++) {
    if (done.has(i + 1)) continue;
    await conn().exec(MIGRATIONS[i]);
    await run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [i + 1, new Date().toISOString()]);
  }
  await run(`UPDATE ${baseTable('tenants')} SET version = ? WHERE id = ?`, [MIGRATIONS.length, t.id]);
  t.version = MIGRATIONS.length;
}

// ---------------------------------------------------------------------------
// Pastelerías
// ---------------------------------------------------------------------------

export function currentTenant(): TenantCtx | null {
  return tenantAls.getStore() ?? null;
}

/** Ejecuta fn dentro de una transacción que solo ve los datos de esa pastelería. */
export function withTenant<T>(t: Tenant, fn: () => Promise<T>): Promise<T> {
  if (!SCHEMA_RE.test(t.schema)) throw new Error('Pastelería no válida');
  const ctx: TenantCtx = { id: t.id, schema: t.schema, version: t.version };
  return tenantAls.run(ctx, () =>
    tx(async () => {
      await conn().exec(`SET LOCAL search_path TO ${q(t.schema)}`);
      if (t.version < MIGRATIONS.length) await migrateTenant(ctx);
      return fn();
    }),
  );
}

export const hashKey = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** Crea una pastelería nueva (con su esquema y su primera llave de acceso) y la prepara con init. */
export async function createTenant(name: string, init: () => Promise<void>) {
  const schema = newSchemaName();
  const token = crypto.randomBytes(24).toString('base64url');
  const id = await tx(async () => {
    await conn().exec(`CREATE SCHEMA ${q(schema)}`);
    const row = await get<{ id: number }>(`INSERT INTO ${baseTable('tenants')} (schema, name) VALUES (?, ?) RETURNING id`, [schema, name]);
    await run(`INSERT INTO ${baseTable('tenant_keys')} (token_hash, tenant_id) VALUES (?, ?)`, [hashKey(token), row!.id]);
    await withTenant({ id: row!.id, schema, version: 0 }, init);
    return row!.id;
  });
  return { id, schema, token };
}

/** Pastelería a la que da acceso una llave (el valor de la cookie o del enlace). */
export async function tenantByKey(token: string | undefined): Promise<Tenant | null> {
  if (!token || token.length > 200) return null;
  const t = await get<Tenant & { stale: boolean }>(
    `SELECT t.id, t.schema, t.version, t.last_seen_at < now() - interval '1 day' AS stale
       FROM ${baseTable('tenant_keys')} k JOIN ${baseTable('tenants')} t ON t.id = k.tenant_id
      WHERE k.token_hash = ?`,
    [hashKey(token)],
  );
  if (!t) return null;
  if (t.stale) await run(`UPDATE ${baseTable('tenants')} SET last_seen_at = now() WHERE id = ?`, [t.id]);
  return { id: t.id, schema: t.schema, version: t.version };
}

/** Nueva llave de acceso para una pastelería (p. ej. al pasar de la sesión antigua). */
export async function addTenantKey(tenantId: number) {
  const token = crypto.randomBytes(24).toString('base64url');
  await run(`INSERT INTO ${baseTable('tenant_keys')} (token_hash, tenant_id) VALUES (?, ?)`, [hashKey(token), tenantId]);
  return token;
}

/** Instalación antigua: la sesión de antes (cookie obrador_sid) da acceso a esa pastelería. */
export async function legacyTenantBySession(tokenHash: string): Promise<Tenant | null> {
  const list = await all<Tenant>(`SELECT id, schema, version FROM ${baseTable('tenants')} WHERE legacy ORDER BY id`);
  for (const t of list) {
    if (!SCHEMA_RE.test(t.schema)) continue;
    const ok = await get(`SELECT 1 AS ok FROM ${q(t.schema)}.sessions WHERE token_hash = ? AND expires_at > ?`, [
      tokenHash,
      new Date().toISOString(),
    ]).catch(() => undefined);
    if (ok) return t;
  }
  return null;
}

/** Pastelerías usadas en los últimos `days` días (para las tareas diarias). */
export function activeTenants(days = 90) {
  return all<Tenant>(
    `SELECT id, schema, version FROM ${baseTable('tenants')} WHERE last_seen_at > now() - (? || ' days')::interval ORDER BY id`,
    [String(days)],
  );
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

/** Varias sentencias seguidas, sin parámetros. */
export async function exec(sql: string) {
  await conn().exec(sql);
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
