import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import {
  Bell,
  BookOpen,
  CakeSlice,
  CalendarDays,
  ChefHat,
  ClipboardList,
  FileText,
  House,
  LayoutGrid,
  Package,
  Search,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/api';
import type { Reminder } from '../lib/types';
import { cx } from './ui';
import { GlobalSearch } from './GlobalSearch';

const MAIN = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays },
  { to: '/produccion', label: 'Producción', icon: ChefHat },
];

export const MORE = [
  { to: '/clientes', label: 'Clientes', icon: Users, emoji: '👥' },
  { to: '/recetas', label: 'Recetas', icon: BookOpen, emoji: '📖' },
  { to: '/inventario', label: 'Inventario', icon: Package, emoji: '📦' },
  { to: '/compras', label: 'Compras', icon: ShoppingCart, emoji: '🛒' },
  { to: '/finanzas', label: 'Finanzas', icon: Wallet, emoji: '💶', perm: 'finances' as const },
  { to: '/catalogo', label: 'Catálogo', icon: CakeSlice, emoji: '🎂' },
  { to: '/presupuestos', label: 'Presupuestos', icon: FileText, emoji: '📝' },
  { to: '/avisos', label: 'Recordatorios', icon: Bell, emoji: '🔔' },
  { to: '/ajustes', label: 'Configuración', icon: Settings, emoji: '⚙️' },
];

const MORE_PATHS = MORE.map((m) => m.to).concat('/mas');

export function Layout() {
  const { businessName, permissions } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const loc = useLocation();
  const reminders = useApi<Reminder[]>('/reminders', { refetchInterval: 120_000 });
  const alertCount = (reminders.data ?? []).filter((r) => r.severity !== 'info').length;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const moreActive = MORE_PATHS.some((p) => loc.pathname.startsWith(p));
  const visibleMore = MORE.filter((m) => !m.perm || permissions[m.perm]);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Barra lateral (ordenador) */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-white border-r border-cream-200 z-30">
        <Link to="/" className="flex items-center gap-2.5 px-5 h-16 border-b border-cream-200">
          <span className="text-2xl">🧁</span>
          <span className="font-extrabold text-lg text-choco-900 truncate">{businessName}</span>
        </Link>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-cream-300 px-3 h-10 text-choco-400 hover:border-berry-200 text-sm"
        >
          <Search size={18} /> Buscar… <kbd className="ml-auto text-xs bg-cream-100 rounded px-1.5">Ctrl K</kbd>
        </button>
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {[...MAIN, ...visibleMore].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 h-11 font-bold transition',
                  isActive ? 'bg-berry-50 text-berry-600' : 'text-choco-700 hover:bg-cream-100',
                )
              }
            >
              <item.icon size={20} />
              <span className="flex-1">{item.label}</span>
              {item.to === '/avisos' && alertCount > 0 && (
                <span className="rounded-full bg-berry-500 text-white text-xs px-2 py-0.5">{alertCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Barra superior (móvil) */}
      <header className="lg:hidden sticky top-0 z-30 bg-cream-100/90 backdrop-blur border-b border-cream-200 pt-safe no-print">
        <div className="flex items-center gap-1 h-14 px-3">
          <Link to="/" className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-2xl">🧁</span>
            <span className="font-extrabold text-choco-900 truncate">{businessName}</span>
          </Link>
          <HeaderButton label="Buscar" onClick={() => setSearchOpen(true)}>
            <Search size={22} />
          </HeaderButton>
          <Link to="/avisos" className="relative h-11 w-11 flex items-center justify-center rounded-full hover:bg-cream-200" aria-label="Recordatorios">
            <Bell size={22} />
            {alertCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-5 h-5 px-1 rounded-full bg-berry-500 text-white text-[11px] font-extrabold flex items-center justify-center">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-4 pb-32 lg:pb-12 lg:pt-8 lg:px-8">
        <Outlet />
      </main>

      {/* Navegación inferior (móvil) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-cream-200 pb-safe no-print" aria-label="Menú principal">
        <div className="grid grid-cols-5 h-[4.25rem]">
          {MAIN.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx('flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition', isActive ? 'text-berry-600' : 'text-choco-500')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx('flex h-8 w-14 items-center justify-center rounded-full transition', isActive && 'bg-berry-50')}>
                    <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
          <NavLink
            to="/mas"
            className={cx('flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold', moreActive ? 'text-berry-600' : 'text-choco-500')}
          >
            <span className={cx('flex h-8 w-14 items-center justify-center rounded-full', moreActive && 'bg-berry-50')}>
              <LayoutGrid size={22} strokeWidth={moreActive ? 2.5 : 2} />
            </span>
            Más
          </NavLink>
        </div>
      </nav>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-cream-200">
      {children}
    </button>
  );
}
