import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Settings } from '@shared/constants';
import { api } from './api';
import type { Permissions, User } from './types';
import { setImageBakery } from './image';

// Sin usuario ni contraseña: el servidor reconoce la pastelería de este dispositivo
// por su cookie. Con el enlace /entrar#<llave> se abre la misma en otro dispositivo.
interface AuthState {
  loading: boolean;
  businessName: string;
  user: User | null;
  permissions: Permissions;
  settings: Partial<Settings>;
  /** Error al abrir un enlace de acceso. */
  linkError: string;
  refresh: () => Promise<void>;
  leave: () => Promise<void>;
}

const NO_PERMS: Permissions = { finances: false, costs: false, inventory: false, catalog: false, delete: false, admin: false };

const Ctx = createContext<AuthState>(null as unknown as AuthState);

/** Si se ha abierto un enlace de acceso, se guarda la llave en este dispositivo. */
async function enterFromLink(): Promise<string> {
  const { pathname, hash } = window.location;
  if (pathname !== '/entrar') return '';
  window.history.replaceState(null, '', '/');
  const key = decodeURIComponent(hash.replace(/^#/, ''));
  if (!key) return '';
  try {
    await api('/auth/enter', { method: 'POST', body: { key } });
    return '';
  } catch (e) {
    return (e as Error).message;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<Omit<AuthState, 'refresh' | 'leave'>>({
    loading: true,
    businessName: '',
    user: null,
    permissions: NO_PERMS,
    settings: {},
    linkError: '',
  });

  const refresh = useCallback(async (linkError = '') => {
    try {
      const status = await api<{ has_bakery: boolean; user: User | null; business_name: string }>('/auth/status');
      if (!status.has_bakery) {
        setState({ loading: false, businessName: '', user: null, permissions: NO_PERMS, settings: {}, linkError });
        return;
      }
      const me = await api<{ user: User; bakery_id: number; permissions: Permissions; settings: Partial<Settings> }>('/auth/me');
      setImageBakery(me.bakery_id);
      setState({
        loading: false,
        businessName: me.settings.business_name ?? status.business_name,
        user: me.user,
        permissions: me.permissions,
        settings: me.settings,
        linkError: '',
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  const leave = useCallback(async () => {
    await api('/auth/leave', { method: 'POST' }).catch(() => {});
    qc.clear();
    await refresh();
  }, [qc, refresh]);

  useEffect(() => {
    enterFromLink().then((err) => refresh(err));
    const onExpired = () => refresh();
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [refresh]);

  useEffect(() => {
    if (state.businessName) document.title = state.businessName;
  }, [state.businessName]);

  return <Ctx.Provider value={{ ...state, refresh: () => refresh(), leave }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
