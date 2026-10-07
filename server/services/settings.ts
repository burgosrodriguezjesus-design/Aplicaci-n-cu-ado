import { all, get, run, tx } from '../db/db.js';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/constants.js';

// Copia en memoria de la configuración. Se recarga al principio de cada petición
// (una consulta muy barata), así getSettings() puede ser síncrona en todo el código.
let cache: Settings = { ...DEFAULT_SETTINGS };

export function getSettings(): Settings {
  return cache;
}

export async function loadSettings(): Promise<Settings> {
  const rows = await all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (!(r.key in DEFAULT_SETTINGS)) continue;
    try {
      s[r.key] = JSON.parse(r.value);
    } catch {
      /* valor corrupto: se ignora y queda el valor por defecto */
    }
  }
  cache = s as unknown as Settings;
  return cache;
}

export async function saveSettings(patch: Partial<Settings>) {
  await tx(async () => {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_SETTINGS) || value === undefined) continue;
      await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
        key,
        JSON.stringify(value),
      ]);
    }
  });
  return loadSettings();
}

/** Siguiente número de pedido / presupuesto. */
export async function nextNumber(table: 'orders' | 'quotes'): Promise<number> {
  const row = await get<{ n: number }>(`SELECT COALESCE(MAX(number), 0) + 1 AS n FROM ${table}`);
  return row!.n;
}
