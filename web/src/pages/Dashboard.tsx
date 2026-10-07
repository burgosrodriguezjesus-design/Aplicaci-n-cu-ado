import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ArrowRight, CalendarCheck, CalendarClock, CalendarRange, ChevronRight, Clock, Package, Plus, Store, TriangleAlert, Truck, type LucideIcon } from 'lucide-react';
import { useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateLong, greeting, money, relDay, untilText } from '../lib/format';
import type { OrderSummary, Permissions, Reminder } from '../lib/types';
import { OrderCard } from '../components/OrderCard';
import { Card, cx, ErrorBox, Loading, Section, StatusBadge } from '../components/ui';
import { ReminderRow } from './Reminders';

interface DashboardData {
  today: string;
  counts: { today: number; tomorrow: number; week: number; overdue: number };
  today_orders: OrderSummary[];
  tomorrow_orders: OrderSummary[];
  overdue_orders: OrderSummary[];
  next_delivery: OrderSummary | null;
  money: { revenue: number; pending: number; pending_orders: number; expenses: number; profit: number } | null;
  low_stock: { id: number; name: string; message: string; kind: string }[];
  reminders: Reminder[];
  permissions: Permissions;
}

export function Dashboard() {
  const { user } = useAuth();
  const q = useApi<DashboardData>('/dashboard', { refetchInterval: 60_000 });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} retry={q.refetch} />;
  const d = q.data;
  const firstName = user?.name && user.name !== 'Yo' ? `, ${user.name.split(' ')[0]}` : '';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-choco-500 first-letter:uppercase">{dateLong(d.today)}</p>
          <h1 className="text-2xl font-semibold text-choco-900 mt-0.5">
            {greeting()}
            {firstName}
          </h1>
        </div>
        <Link
          to="/pedidos/nuevo"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-choco-900 hover:bg-choco-800 text-white text-sm font-medium shadow-[0_1px_2px_rgb(28_25_23/0.2)] transition"
        >
          <Plus size={18} /> Nuevo pedido
        </Link>
      </div>

      <div className="card grid grid-cols-2 lg:grid-cols-4 divide-cream-200 overflow-hidden">
        <StatTile to="/pedidos?vista=today" label="Para hoy" value={d.counts.today} icon={CalendarCheck} className="border-r border-b lg:border-b-0 border-cream-200" />
        <StatTile to="/pedidos?vista=tomorrow" label="Para mañana" value={d.counts.tomorrow} icon={CalendarClock} className="border-b lg:border-b-0 lg:border-r border-cream-200" />
        <StatTile to="/calendario?vista=semana" label="Esta semana" value={d.counts.week} icon={CalendarRange} className="border-r border-cream-200" />
        <StatTile to="/pedidos?vista=overdue" label="Atrasados" value={d.counts.overdue} icon={TriangleAlert} alert={d.counts.overdue > 0} />
      </div>

      {d.next_delivery && <NextDelivery o={d.next_delivery} />}

      {d.money && (
        <Section title="Este mes" action={<SectionLink to="/finanzas">Ver finanzas</SectionLink>}>
          <div className="card grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
            <MoneyTile label="Facturado" value={d.money.revenue} className="border-r border-b lg:border-b-0 border-cream-200" />
            <MoneyTile
              label="Pendiente de cobrar"
              value={d.money.pending}
              sub={`${d.money.pending_orders} ${d.money.pending_orders === 1 ? 'pedido' : 'pedidos'}`}
              tone={d.money.pending > 0 ? 'amber' : undefined}
              to="/pedidos?vista=unpaid"
              className="border-b lg:border-b-0 lg:border-r border-cream-200"
            />
            <MoneyTile label="Gastos" value={d.money.expenses} className="border-r border-cream-200" />
            <MoneyTile label="Beneficio estimado" value={d.money.profit} tone={d.money.profit > 0 ? 'green' : d.money.profit < 0 ? 'red' : undefined} />
          </div>
        </Section>
      )}

      {d.overdue_orders.length > 0 && (
        <Section title={<span className="inline-flex items-center gap-1.5 text-red-700"><TriangleAlert size={15} /> Atrasados</span>}>
          <div className="grid gap-2.5 lg:grid-cols-2">
            {d.overdue_orders.map((o) => (
              <OrderCard key={o.id} o={o} />
            ))}
          </div>
        </Section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Pedidos de hoy" action={<SectionLink to="/produccion">Producción</SectionLink>}>
          {d.today_orders.length ? (
            <div className="space-y-2.5">
              {d.today_orders.map((o) => (
                <OrderCard key={o.id} o={o} showDate={false} compact />
              ))}
            </div>
          ) : (
            <Placeholder>No hay entregas hoy.</Placeholder>
          )}
        </Section>
        <Section title="Pedidos de mañana">
          {d.tomorrow_orders.length ? (
            <div className="space-y-2.5">
              {d.tomorrow_orders.map((o) => (
                <OrderCard key={o.id} o={o} showDate={false} compact />
              ))}
            </div>
          ) : (
            <Placeholder>No hay entregas mañana.</Placeholder>
          )}
        </Section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Avisos" action={<SectionLink to="/avisos">Ver todos</SectionLink>}>
          {d.reminders.length ? (
            <Card className="divide-y divide-cream-200 overflow-hidden">
              {d.reminders.map((r) => (
                <ReminderRow key={r.id} r={r} />
              ))}
            </Card>
          ) : (
            <Placeholder>No hay avisos pendientes.</Placeholder>
          )}
        </Section>
        <Section title="Poco stock" action={<SectionLink to="/compras">Lista de la compra</SectionLink>}>
          {d.low_stock.length ? (
            <Card className="divide-y divide-cream-200 overflow-hidden">
              {d.low_stock.map((i) => (
                <Link key={i.id} to={`/inventario/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50">
                  <Package size={16} strokeWidth={1.75} className="text-amber-600 shrink-0" />
                  <span className="flex-1 text-sm">{i.message}</span>
                  <ChevronRight size={16} className="text-choco-400" />
                </Link>
              ))}
            </Card>
          ) : (
            <Placeholder>Ningún artículo por debajo del mínimo.</Placeholder>
          )}
        </Section>
      </div>
    </div>
  );
}

function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-0.5 text-[13px] font-medium text-choco-500 hover:text-choco-900">
      {children} <ChevronRight size={14} />
    </Link>
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-cream-300 px-4 py-6 text-center text-sm text-choco-500">{children}</div>;
}

function StatTile({ to, label, value, icon: Icon, alert, className }: { to: string; label: string; value: number; icon: LucideIcon; alert?: boolean; className?: string }) {
  return (
    <Link to={to} className={cx('block p-4 lg:p-5 hover:bg-cream-50 transition', className)}>
      <div className="flex items-center justify-between text-[13px] text-choco-500">
        <span>{label}</span>
        <Icon size={16} strokeWidth={1.75} className={alert ? 'text-red-600' : 'text-choco-400'} />
      </div>
      <div className={cx('mt-2 text-[28px] font-semibold leading-none tabular-nums', alert ? 'text-red-700' : 'text-choco-900')}>{value}</div>
    </Link>
  );
}

function MoneyTile({ label, value, sub, tone, to, className }: { label: string; value: number; sub?: string; tone?: 'amber' | 'red' | 'green'; to?: string; className?: string }) {
  const color = tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-emerald-700' : 'text-choco-900';
  const inner = (
    <>
      <div className="text-[13px] text-choco-500">{label}</div>
      <div className={cx('text-xl lg:text-2xl font-semibold mt-1.5 tabular-nums tracking-tight', color)}>{money(value)}</div>
      {sub && <div className="text-xs text-choco-500 mt-1">{sub}</div>}
    </>
  );
  return to ? (
    <Link to={to} className={cx('block p-4 lg:p-5 hover:bg-cream-50 transition', className)}>
      {inner}
    </Link>
  ) : (
    <div className={cx('p-4 lg:p-5', className)}>{inner}</div>
  );
}

function NextDelivery({ o }: { o: OrderSummary }) {
  return (
    <Link to={`/pedidos/${o.id}`} className="card block p-4 lg:p-5 hover:border-cream-300 transition">
      <div className="flex items-center gap-2 text-[13px] text-choco-500">
        <CalendarClock size={15} strokeWidth={1.75} /> Próxima entrega · <span className="text-choco-900 font-medium">{untilText(o.delivery_date, o.delivery_time)}</span>
      </div>
      <div className="mt-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-semibold text-choco-900">{o.customer_name}</div>
          <div className="text-sm text-choco-700 mt-0.5">{o.summary}</div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-choco-500">
            <span className="inline-flex items-center gap-1.5">
              <Clock size={14} strokeWidth={1.75} /> {relDay(o.delivery_date)} {o.delivery_time ?? ''}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {o.delivery_type === 'delivery' ? <Truck size={14} strokeWidth={1.75} /> : <Store size={14} strokeWidth={1.75} />}
              {o.delivery_type === 'delivery' ? 'A domicilio' : 'Recogida'}
            </span>
            {o.allergens.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-red-700">
                <AlertTriangle size={14} strokeWidth={1.75} /> Alérgenos
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <StatusBadge status={o.status} />
          <ArrowRight size={18} className="text-choco-400" />
        </div>
      </div>
    </Link>
  );
}
