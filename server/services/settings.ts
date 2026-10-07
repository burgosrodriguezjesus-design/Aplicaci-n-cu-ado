import { all, run, tx } from '../db/db.js';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/constants.js';

export function getSettings(): Settings {
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (!(r.key in DEFAULT_SETTINGS)) continue;
    try {
      s[r.key] = JSON.parse(r.value);
    } catch {
      /* valor corrupto: se ignora y queda el valor por defecto */
    }
  }
  return s as unknown as Settings;
}

export function saveSettings(patch: Partial<Settings>) {
  tx(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_SETTINGS) || value === undefined) continue;
      run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
        key,
        JSON.stringify(value),
      ]);
    }
  });
  return getSettings();
}

/** Contador interno (números de pedido / presupuesto). */
export function nextNumber(table: 'orders' | 'quotes'): number {
  const row = all<{ n: number }>(`SELECT COALESCE(MAX(number), 0) + 1 AS n FROM ${table}`)[0];
  return row.n;
}
