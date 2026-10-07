export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Elemento') => new HttpError(404, `${what} no encontrado`);
export const badRequest = (msg: string) => new HttpError(400, msg);
export const forbidden = (msg = 'No tienes permiso para hacer esto') => new HttpError(403, msg);

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toId(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('Identificador no válido');
  return n;
}

/** Normaliza un teléfono para buscar (solo dígitos, sin prefijo 34). */
export function normPhone(p?: string | null) {
  const digits = (p || '').replace(/\D/g, '');
  return digits.length > 9 && digits.startsWith('34') ? digits.slice(2) : digits;
}

export function eur(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
}
