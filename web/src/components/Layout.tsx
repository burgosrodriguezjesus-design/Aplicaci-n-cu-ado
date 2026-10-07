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
  { to: '/clientes', label: 'Clientes', hint: 'Fichas, historial y cumpleaños', icon: Users },
  { to: '/recetas', label: 'Recetas', hint: 'Ingredientes y escalado', icon: BookOpen },
  { to: '/inventario', label: 'Inventario', hint: 'Stock y movimientos', icon: Package },
  { to: '/compras', label: 'Compras', hint: 'Lista de la compra', icon: ShoppingCart },
  { to: '/finanzas', label: 'Finanzas', hint: 'Ingresos, gastos y beneficio', icon: Wallet, perm: 'finances' as const },
  { to: '/catalogo', label: 'Catálogo', hint: 'Productos, tamaños y precios', icon: CakeSlice },
  { to: '/presupuestos', label: 'Presupuestos', hint: 'Enviar y convertir en pedido', icon: FileText },
  { to: '/avisos', label: 'Recordatorios', hint: 'Avisos y tareas pendientes', icon: Bell },
  { to: '/ajustes', label: 'Configuración', hint: 'Negocio, copias y acceso', icon: Settings },
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
        <Link to="/" className="flex items-center gap-2.5 px-4 h-14 border-b border-cream-200">
          <Logo name={businessName} />
          <span className="font-semibold text-[15px] text-choco-900 truncate">{businessName}</span>
        </Link>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-cream-200 bg-cream-50 px-2.5 h-9 text-choco-400 hover:border-cream-300 text-[13px]"
        >
          <Search size={15} /> Buscar… <kbd className="ml-auto text-[11px] font-sans border border-cream-200 bg-white rounded px-1.5">Ctrl K</kbd>
        </button>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-px">
          {[...MAIN, ...visibleMore].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2.5 rounded-md px-2.5 h-9 text-sm transition',
                  isActive ? 'bg-cream-100 text-choco-900 font-medium' : 'text-choco-500 hover:bg-cream-50 hover:text-choco-900',
                )
              }
            >
              <item.icon size={17} strokeWidth={1.75} />
              <span className="flex-1">{item.label}</span>
              {item.to === '/avisos' && alertCount > 0 && (
                <span className="rounded-md bg-cream-100 border border-cream-200 text-choco-700 text-[11px] font-medium px-1.5 tabular-nums">{alertCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Barra superior (móvil) */}
      <header className="lg:hidden sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-cream-200 pt-safe no-print">
        <div className="flex items-center gap-1 h-14 px-4">
          <Link to="/" className="flex items-center gap-2.5 flex-1 min-w-0">
            <Logo name={businessName} />
            <span className="font-semibold text-[15px] text-choco-900 truncate">{businessName}</span>
          </Link>
          <HeaderButton label="Buscar" onClick={() => setSearchOpen(true)}>
            <Search size={19} strokeWidth={1.75} />
          </HeaderButton>
          <Link to="/avisos" className="relative h-10 w-10 flex items-center justify-center rounded-lg text-choco-700 hover:bg-cream-100" aria-label="Recordatorios">
            <Bell size={19} strokeWidth={1.75} />
            {alertCount > 0 && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-berry-500 ring-2 ring-white" aria-label={`${alertCount} avisos`} />}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-5 pb-32 lg:pb-12 lg:pt-10 lg:px-10">
        <Outlet />
      </main>

      {/* Navegación inferior (móvil) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-cream-200 pb-safe no-print" aria-label="Menú principal">
        <div className="grid grid-cols-5 h-16">
          {MAIN.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx('flex flex-col items-center justify-center gap-1 text-[11px] transition', isActive ? 'text-choco-900 font-medium' : 'text-choco-400')
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={21} strokeWidth={isActive ? 2 : 1.6} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
          <NavLink
            to="/mas"
            className={cx('flex flex-col items-center justify-center gap-1 text-[11px]', moreActive ? 'text-choco-900 font-medium' : 'text-choco-400')}
          >
            <LayoutGrid size={21} strokeWidth={moreActive ? 2 : 1.6} />
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
    <button type="button" aria-label={label} onClick={onClick} className="h-10 w-10 flex items-center justify-center rounded-lg text-choco-700 hover:bg-cream-100">
      {children}
    </button>
  );
}

/** Monograma con la inicial del negocio. */
export function Logo({ name, className }: { name: string; className?: string }) {
  const initial = (name.trim().replace(/^(la|el|los|las)\s+/i, '').charAt(0) || 'O').toUpperCase();
  return (
    <span className={cx('h-7 w-7 shrink-0 rounded-md bg-choco-900 text-white text-[13px] font-semibold flex items-center justify-center', className)} aria-hidden>
      {initial}
    </span>
  );
}
