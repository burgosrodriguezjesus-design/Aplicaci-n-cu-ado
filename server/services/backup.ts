// Copias de seguridad: instantáneas comprimidas (JSON + gzip) de todos los datos del
// negocio. Se guardan en la propia base de datos (automática diaria y manuales),
// se pueden descargar y se pueden restaurar desde la app.
// Las fotos no van dentro (pesan mucho): se quedan en la base de datos.
import zlib from 'node:zlib';
import { all, get, insert, run, tx } from '../db/db.js';
import { DATA_TABLES, MIGRATIONS } from '../db/schema.js';
import { nowIso, nowLocal, today } from '../lib/clock.js';
import { badRequest, notFound } from '../lib/util.js';

const KEEP = { auto: 30, other: 20 };
type Kind = 'auto' | 'manual' | 'antes-de-restaurar';

export async function exportData(): Promise<Buffer> {
  const tables: Record<string, unknown[]> = {};
  for (const t of DATA_TABLES) tables[t] = await all(`SELECT * FROM ${t}`);
  const json = JSON.stringify({ app: 'obrador', schema: MIGRATIONS.length, created_at: nowIso(), tables });
  return zlib.gzipSync(json);
}

export async function createBackup(kind: Kind = 'manual') {
  const data = await exportData();
  const name = `copia_${nowLocal().replace('T', '_').replace(':', '')}_${kind}`;
  const id = await insert('backups', { name, kind, size: data.length, data });
  // Limpieza: se guardan las últimas copias de cada tipo.
  await run(
    `DELETE FROM backups WHERE kind = 'auto' AND id NOT IN (SELECT id FROM backups WHERE kind = 'auto' ORDER BY id DESC LIMIT ${KEEP.auto})`,
  );
  await run(
    `DELETE FROM backups WHERE kind <> 'auto' AND id NOT IN (SELECT id FROM backups WHERE kind <> 'auto' ORDER BY id DESC LIMIT ${KEEP.other})`,
  );
  return { id, name };
}

export function listBackups() {
  return all<{ id: number; name: string; kind: string; size: number; created_at: string }>(
    'SELECT id, name, kind, size, created_at FROM backups ORDER BY id DESC',
  );
}

export async function backupData(id: number) {
  const b = await get<{ name: string; data: Buffer }>('SELECT name, data FROM backups WHERE id = ?', [id]);
  if (!b) throw notFound('Copia');
  return b;
}

/** Copia automática del día (si todavía no se ha hecho). */
export async function dailyBackup() {
  const done = await get("SELECT id FROM backups WHERE kind = 'auto' AND name LIKE ?", [`copia_${today()}%`]);
  if (!done) await createBackup('auto');
}

function parse(buffer: Buffer) {
  let text: string;
  try {
    text = (buffer[0] === 0x1f && buffer[1] === 0x8b ? zlib.gunzipSync(buffer) : buffer).toString('utf8');
  } catch {
    throw badRequest('El archivo no es una copia de seguridad válida');
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw badRequest('El archivo no es una copia de seguridad válida');
  }
  if (data?.app !== 'obrador' || typeof data.tables !== 'object') throw badRequest('El archivo no es una copia de esta aplicación');
  const users = data.tables.users as any[] | undefined;
  if (!users?.some((u) => u.role === 'admin' && u.active)) throw badRequest('La copia no tiene ningún administrador activo');
  return data as { tables: Record<string, Record<string, unknown>[]> };
}

async function insertRows(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const cols = Object.keys(chunk[0]);
    const params: unknown[] = [];
    const values = chunk.map((r) => `(${cols.map((c) => (params.push(r[c] ?? null), '?')).join(',')})`);
    await run(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${values.join(',')}`, params);
  }
}

/**
 * Sustituye todos los datos por los de la copia. Antes guarda una copia del estado actual.
 * `keepSession` vuelve a dejar abierta la sesión de quien restaura (si su usuario existe en la copia).
 */
export async function restoreData(buffer: Buffer, keepSession?: { tokenHash: string; userId: number; expires: string }) {
  const data = parse(buffer);
  await createBackup('antes-de-restaurar');
  await tx(async () => {
    await run(`TRUNCATE ${[...DATA_TABLES, 'sessions'].join(', ')} RESTART IDENTITY CASCADE`);
    const images = new Set((await all<{ id: number }>('SELECT id FROM images')).map((r) => r.id));
    const quoteOrders: [number, number][] = [];
    for (const table of DATA_TABLES) {
      let rows = (data.tables[table] ?? []).map((r) => ({ ...r }));
      // Las fotos que ya no existan se quitan de la ficha.
      if (table === 'recipes' || table === 'products') rows.forEach((r) => r.photo_id && !images.has(r.photo_id as number) && (r.photo_id = null));
      if (table === 'order_images') rows = rows.filter((r) => images.has(r.image_id as number));
      // Presupuesto ↔ pedido se enlazan cuando ya existen los pedidos.
      if (table === 'quotes') {
        rows.forEach((r) => {
          if (r.order_id) quoteOrders.push([r.id as number, r.order_id as number]);
          r.order_id = null;
        });
      }
      if (rows.length) await insertRows(table, rows);
      if (rows.length && 'id' in rows[0]) {
        await run(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT COALESCE(MAX(id), 0) + 1 FROM ${table}), false)`);
      }
    }
    for (const [q, o] of quoteOrders) await run('UPDATE quotes SET order_id = ? WHERE id = ?', [o, q]);
    if (keepSession && (await get('SELECT id FROM users WHERE id = ? AND active = 1', [keepSession.userId]))) {
      await run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
        keepSession.tokenHash,
        keepSession.userId,
        keepSession.expires,
      ]);
    }
  });
}
