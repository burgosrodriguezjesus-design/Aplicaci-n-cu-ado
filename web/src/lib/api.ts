import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { useToast } from '../components/Toast';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T = any>(path: string, opts: { method?: Method; body?: unknown; raw?: Blob } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.raw) {
    body = opts.raw;
    headers['Content-Type'] = opts.raw.type || 'application/octet-stream';
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError('Sin conexión. Comprueba internet y vuelve a intentarlo.', 0);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('auth:expired'));
    throw new ApiError(data?.error || 'Algo ha fallado. Inténtalo de nuevo.', res.status);
  }
  return data as T;
}

/** Consulta GET con caché. Pasa `null` como ruta para no consultar todavía. */
export function useApi<T = any>(path: string | null, options: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => api<T>(path!),
    enabled: !!path,
    ...options,
  });
}

/**
 * Mutación: al terminar refresca todos los datos (las automatizaciones afectan a
 * varias pantallas a la vez) y muestra un aviso.
 */
export function useAction<V = void, T = any>(
  fn: (v: V) => Promise<T>,
  opts: { success?: string | ((r: T) => string); onSuccess?: (r: T, v: V) => void; silent?: boolean } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<T, Error, V>({
    mutationFn: fn,
    onSuccess: async (r, v) => {
      await qc.invalidateQueries();
      const msg = typeof opts.success === 'function' ? opts.success(r) : opts.success;
      if (msg) toast.show(msg);
      opts.onSuccess?.(r, v);
    },
    onError: (e) => {
      if (!opts.silent) toast.show(e.message, 'error');
    },
  });
}
