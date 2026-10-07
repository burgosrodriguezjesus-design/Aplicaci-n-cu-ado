// Reloj del negocio: todas las fechas "de negocio" se calculan en la zona horaria configurada.
import { getSettings } from '../services/settings.js';

let fixedNow: Date | null = null;

/** Solo para pruebas: fija la hora actual. */
export function setNow(d: Date | null) {
  fixedNow = d;
}

export function now(): Date {
  return fixedNow ? new Date(fixedNow) : new Date();
}

function parts(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
  return p;
}

function tz() {
  try {
    return getSettings().timezone || 'Europe/Madrid';
  } catch {
    return 'Europe/Madrid';
  }
}

/** Fecha local de hoy: YYYY-MM-DD */
export function today(): string {
  const p = parts(now(), tz());
  return `${p.year}-${p.month}-${p.day}`;
}

/** Fecha y hora local: YYYY-MM-DDTHH:MM */
export function nowLocal(): string {
  const p = parts(now(), tz());
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function nowIso(): string {
  return now().toISOString();
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
}

/** Lunes de la semana de la fecha dada. */
export function startOfWeek(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 domingo
  return addDays(date, -((dow + 6) % 7));
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return dt.toISOString().slice(0, 7);
}
