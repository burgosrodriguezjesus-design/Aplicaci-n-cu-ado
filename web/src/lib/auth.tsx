import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Settings } from '@shared/constants';
import { api } from './api';
import type { Permissions, User } from './types';

interface AuthState {
  loading: boolean;
  needsSetup: boolean;
  businessName: string;
  user: User | null;
  permissions: Permissions;
  settings: Partial<Settings>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const NO_PERMS: Permissions = { finances: false, costs: false, inventory: false, catalog: false, delete: false, admin: false };

const Ctx = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<Omit<AuthState, 'refresh' | 'logout'>>({
    loading: true,
    needsSetup: false,
    businessName: '',
    user: null,
    permissions: NO_PERMS,
    settings: {},
  });

  const refresh = useCallback(async () => {
    try {
      const status = await api<{ needs_setup: boolean; user: User | null; business_name: string }>('/auth/status');
      if (!status.user) {
        setState({ loading: false, needsSetup: status.needs_setup, businessName: status.business_name, user: null, permissions: NO_PERMS, settings: {} });
        return;
      }
      const me = await api<{ user: User; permissions: Permissions; settings: Partial<Settings> }>('/auth/me');
      setState({
        loading: false,
        needsSetup: false,
        businessName: me.settings.business_name ?? status.business_name,
        user: me.user,
        permissions: me.permissions,
        settings: me.settings,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    qc.clear();
    await refresh();
  }, [qc, refresh]);

  useEffect(() => {
    refresh();
    const onExpired = () => refresh();
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [refresh]);

  useEffect(() => {
    if (state.businessName) document.title = state.businessName;
  }, [state.businessName]);

  return <Ctx.Provider value={{ ...state, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
