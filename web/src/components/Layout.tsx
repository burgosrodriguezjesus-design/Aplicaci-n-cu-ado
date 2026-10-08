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
  Sparkles,
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
  { to: '/asistente', label: 'Asistente', hint: 'Pregunta y previsiones con IA', icon: Sparkles },
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
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col hero text-cream-100 z-30">
        <div className="absolute inset-0 hero-dots pointer-events-none" />
        <Link to="/" className="relative flex flex-col items-center text-center gap-3 px-5 pt-7 pb-5">
          <Logo className="h-[92px] w-[92px] ring-4 ring-white/10 shadow-[0_14px_32px_-10px_rgb(0_0_0/0.7)]" />
          <span className="font-display text-[18px] font-medium text-white leading-tight">{businessName}</span>
        </Link>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="relative mx-4 flex items-center gap-2 rounded-xl glass px-3 h-10 text-cream-100/60 hover:text-white text-[13px] transition"
        >
          <Search size={15} /> Buscar… <kbd className="ml-auto text-[10px] font-sans rounded-md border border-white/15 px-1.5 py-0.5">Ctrl K</kbd>
        </button>
        <nav className="relative flex-1 overflow-y-auto px-3 py-5 space-y-0.5">
          {[...MAIN, ...visibleMore].map((item, i) => (
            <div key={item.to}>
              {i === MAIN.length && <div className="mx-3 my-3 border-t border-white/10" />}
              <NavLink
                to={item.to}
                end={'end' in item ? item.end : false}
                className={({ isActive }) =>
                  cx(
                    'relative flex items-center gap-3 rounded-xl px-3 h-10 text-sm transition',
                    isActive ? 'bg-white/[0.12] text-white font-medium shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]' : 'text-cream-100/65 hover:bg-white/[0.06] hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-berry-200" />}
                    <item.icon size={18} strokeWidth={1.75} />
                    <span className="flex-1">{item.label}</span>
                    {item.to === '/avisos' && alertCount > 0 && (
                      <span className="rounded-full bg-berry-500 text-white text-[11px] font-semibold px-2 py-0.5 tabular-nums">{alertCount}</span>
                    )}
                  </>
                )}
              </NavLink>
            </div>
          ))}
        </nav>
      </aside>

      {/* Barra superior (móvil) */}
      <header className="lg:hidden sticky top-0 z-30 bg-cream-100/85 backdrop-blur-md border-b border-cream-200/70 pt-safe no-print">
        <div className="flex items-center gap-1 h-14 px-4">
          <Link to="/" className="flex items-center gap-2.5 flex-1 min-w-0">
            <Logo />
            <span className="font-display text-[18px] font-medium text-choco-900 truncate">{businessName}</span>
          </Link>
          <HeaderButton label="Buscar" onClick={() => setSearchOpen(true)}>
            <Search size={19} strokeWidth={1.75} />
          </HeaderButton>
          <Link to="/avisos" className="relative h-10 w-10 flex items-center justify-center rounded-xl text-choco-700 hover:bg-cream-200/70" aria-label="Recordatorios">
            <Bell size={19} strokeWidth={1.75} />
            {alertCount > 0 && (
              <span className="absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-berry-500 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-cream-100 tabular-nums">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-5 pb-36 lg:pb-14 lg:pt-10 lg:px-10">
        <Outlet />
      </main>

      {/* Navegación inferior flotante (móvil) */}
      <nav
        className="lg:hidden fixed inset-x-3 bottom-[calc(0.625rem+env(safe-area-inset-bottom))] z-40 rounded-[22px] bg-white/90 backdrop-blur-xl border border-cream-200/80 shadow-[0_12px_32px_-12px_rgb(42_29_24/0.35)] no-print"
        aria-label="Menú principal"
      >
        <div className="grid grid-cols-5 h-16 px-1">
          {[...MAIN, { to: '/mas', label: 'Más', icon: LayoutGrid, end: false }].map((item) => {
            const more = item.to === '/mas';
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className="flex items-center justify-center">
                {({ isActive }) => {
                  const on = more ? moreActive : isActive;
                  return (
                    <span className={cx('flex flex-col items-center gap-1 text-[10.5px] transition', on ? 'text-choco-900 font-semibold' : 'text-choco-400')}>
                      <span
                        className={cx(
                          'flex h-8 w-12 items-center justify-center rounded-full transition',
                          on && 'bg-choco-900 text-white shadow-[0_4px_12px_-4px_rgb(42_29_24/0.6)]',
                        )}
                      >
                        <item.icon size={19} strokeWidth={on ? 2 : 1.7} />
                      </span>
                      {item.label}
                    </span>
                  );
                }}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="h-10 w-10 flex items-center justify-center rounded-xl text-choco-700 hover:bg-cream-200/70">
      {children}
    </button>
  );
}

/** Logo de Repostería Madre Mía. */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/logo-256.png"
      alt="Repostería Madre Mía"
      width={40}
      height={40}
      className={cx('h-10 w-10 shrink-0 rounded-full ring-1 ring-black/5 shadow-[0_4px_12px_-4px_rgb(42_29_24/0.35)]', className)}
    />
  );
}
