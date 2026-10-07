// Copias de seguridad: automáticas (una al día) y manuales; descarga y restauración.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb, DATA_DIR, db, dbPath, openDb } from '../db/db.js';
import { nowLocal, today } from '../lib/clock.js';
import { badRequest } from '../lib/util.js';

export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP_AUTO = 30;

export function createBackup(label: 'auto' | 'manual' | 'antes-de-restaurar' = 'manual') {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = nowLocal().replace('T', '_').replace(':', '');
  let name = `copia_${stamp}_${label}.sqlite`;
  let n = 1;
  while (fs.existsSync(path.join(BACKUP_DIR, name))) name = `copia_${stamp}_${label}-${n++}.sqlite`;
  db().prepare('VACUUM INTO ?').run(path.join(BACKUP_DIR, name));
  prune();
  return name;
}

function prune() {
  const autos = listBackups().filter((b) => b.name.includes('_auto'));
  for (const b of autos.slice(KEEP_AUTO)) fs.rmSync(path.join(BACKUP_DIR, b.name), { force: true });
}

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.sqlite'))
    .map((name) => {
      const st = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, size: st.size, created_at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function backupFile(name: string) {
  const safe = path.basename(name);
  const file = path.join(BACKUP_DIR, safe);
  if (!safe.endsWith('.sqlite') || !fs.existsSync(file)) return null;
  return file;
}

/** Copia "al vuelo" del estado actual, para descargar. */
export function snapshotToTemp() {
  const tmp = path.join(DATA_DIR, `descarga-${Date.now()}.sqlite`);
  db().prepare('VACUUM INTO ?').run(tmp);
  return tmp;
}

/** Restaura una copia subida: se valida, se guarda una copia del estado actual y se reemplaza. */
export function restoreBackup(buffer: Buffer) {
  if (buffer.subarray(0, 15).toString() !== 'SQLite format 3') throw badRequest('El archivo no es una copia de seguridad válida');
  const tmp = path.join(DATA_DIR, `restaurar-${Date.now()}.sqlite`);
  fs.writeFileSync(tmp, buffer);
  try {
    const test = new Database(tmp, { readonly: true });
    try {
      const tables = test.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
      const names = new Set(tables.map((t) => t.name));
      for (const t of ['users', 'orders', 'customers', 'inventory_items']) {
        if (!names.has(t)) throw badRequest('El archivo no es una copia de esta aplicación');
      }
      const admins = test.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get() as { n: number };
      if (!admins.n) throw badRequest('La copia no tiene ningún administrador activo');
    } finally {
      test.close();
    }
    createBackup('antes-de-restaurar');
    const target = dbPath();
    closeDb();
    for (const ext of ['-wal', '-shm']) fs.rmSync(target + ext, { force: true });
    fs.copyFileSync(tmp, target);
    openDb(target);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

let timer: NodeJS.Timeout | null = null;

/** Hace una copia automática al arrancar y cada día. */
export function scheduleAutoBackups() {
  const check = () => {
    try {
      const day = today();
      const done = listBackups().some((b) => b.name.startsWith(`copia_${day}`) && b.name.includes('_auto'));
      if (!done) createBackup('auto');
    } catch (e) {
      console.error('Error en la copia automática', e);
    }
  };
  check();
  timer = setInterval(check, 60 * 60 * 1000);
  timer.unref();
}
