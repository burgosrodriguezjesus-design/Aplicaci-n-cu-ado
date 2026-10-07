import { convertUnit, type Unit } from '@shared/constants';

const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export function money(n: number | null | undefined) {
  return eurFmt.format(n ?? 0);
}

export function num(n: number | null | undefined, max = 2) {
  return (n ?? 0).toLocaleString('es-ES', { maximumFractionDigits: max });
}

export function pct(n: number | null | undefined) {
  return `${((n ?? 0) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
}

/** Cantidad legible: 1250 g → "1,25 kg", 0,4 kg → "400 g", 3 ud → "3 ud". */
export function qty(q: number, unit: Unit | string): string {
  const u = unit as Unit;
  if (u === 'g' && Math.abs(q) >= 1000) return `${num(convertUnit(q, 'g', 'kg'))} kg`;
  if (u === 'ml' && Math.abs(q) >= 1000) return `${num(convertUnit(q, 'ml', 'l'))} l`;
  if (u === 'kg' && Math.abs(q) < 1 && q !== 0) return `${num(convertUnit(q, 'kg', 'g'), 0)} g`;
  if (u === 'l' && Math.abs(q) < 1 && q !== 0) return `${num(convertUnit(q, 'l', 'ml'), 0)} ml`;
  if (u === 'ud') return `${num(q, 1)} ud`;
  if (u === 'g' || u === 'ml') return `${num(q, 0)} ${u}`;
  return `${num(q)} ${u}`;
}

/** Fecha local YYYY-MM-DD */
export function isoDate(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function today() {
  return isoDate();
}

export function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(s: string, n: number) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function diffDays(a: string, b: string) {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86400000);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "martes, 7 de octubre" */
export function dateLong(s: string) {
  return parseDate(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "7 oct" */
export function dateShort(s: string) {
  return parseDate(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
}

export function dateNumeric(s: string) {
  return parseDate(s).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** "Hoy", "Mañana", "Ayer", "Jueves 9", "12 oct" */
export function relDay(s: string) {
  const d = diffDays(s, today());
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d === -1) return 'Ayer';
  if (d > 1 && d < 7) return cap(parseDate(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }));
  const sameYear = s.slice(0, 4) === today().slice(0, 4);
  return parseDate(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).replace('.', '');
}

export function monthLabel(month: string) {
  return cap(parseDate(`${month}-15`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
}

export function addMonths(month: string, n: number) {
  const d = parseDate(`${month}-15`);
  d.setMonth(d.getMonth() + n);
  return isoDate(d).slice(0, 7);
}

/** Lunes de la semana */
export function weekStart(s: string) {
  const d = parseDate(s);
  const dow = (d.getDay() + 6) % 7;
  return addDays(s, -dow);
}

/** "en 3 h", "en 25 min", "hace 2 h" */
export function untilText(date: string, time: string | null) {
  const target = parseDate(date);
  if (time) {
    const [h, m] = time.split(':').map(Number);
    target.setHours(h, m, 0, 0);
  } else target.setHours(23, 59);
  const mins = Math.round((target.getTime() - Date.now()) / 60000);
  const abs = Math.abs(mins);
  const txt = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} días`;
  return mins >= 0 ? `en ${txt}` : `hace ${txt}`;
}

export function greeting() {
  const h = new Date().getHours();
  return h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

/** Lee un número escrito con coma o punto. */
export function parseNum(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function plural(n: number, one: string, many: string) {
  return `${num(n)} ${n === 1 ? one : many}`;
}
