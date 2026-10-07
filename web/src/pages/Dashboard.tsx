import { Link } from 'react-router';
import { AlertTriangle, ArrowRight, CalendarClock, ChevronRight, Clock, Plus, Store, Truck } from 'lucide-react';
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-choco-500 font-semibold first-letter:uppercase">{dateLong(d.today)}</p>
          <h1 className="text-[1.75rem] font-extrabold text-choco-900 leading-tight">
            {greeting()}, {user?.name.split(' ')[0]} 👋
          </h1>
        </div>
        <Link
          to="/pedidos/nuevo"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-16 px-7 rounded-2xl bg-berry-500 hover:bg-berry-600 text-white text-xl font-extrabold shadow-[var(--shadow-float)] active:scale-[0.98] transition"
        >
          <Plus size={28} strokeWidth={3} /> Nuevo pedido
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile to="/pedidos?vista=today" label="Para hoy" value={d.counts.today} emoji="🎂" tone="berry" />
        <StatTile to="/pedidos?vista=tomorrow" label="Para mañana" value={d.counts.tomorrow} emoji="⏰" tone="caramel" />
        <StatTile to="/calendario?vista=semana" label="Esta semana" value={d.counts.week} emoji="📅" tone="violet" />
        <StatTile to="/pedidos?vista=overdue" label="Atrasados" value={d.counts.overdue} emoji="🚨" tone={d.counts.overdue ? 'red' : 'neutral'} />
      </div>

      {d.next_delivery && <NextDelivery o={d.next_delivery} />}

      {d.money && (
        <Section title="Este mes" action={<Link to="/finanzas" className="text-sm font-bold text-berry-600">Ver finanzas</Link>}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MoneyTile label="Facturado" value={d.money.revenue} />
            <MoneyTile label="Pendiente de cobrar" value={d.money.pending} sub={`${d.money.pending_orders} pedidos`} tone="amber" to="/pedidos?vista=unpaid" />
            <MoneyTile label="Gastos" value={d.money.expenses} tone="red" />
            <MoneyTile label="Beneficio estimado" value={d.money.profit} tone={d.money.profit >= 0 ? 'green' : 'red'} />
          </div>
        </Section>
      )}

      {d.overdue_orders.length > 0 && (
        <Section title={<span className="text-red-600">⚠️ Atrasados</span>}>
          <div className="grid gap-2.5 lg:grid-cols-2">
            {d.overdue_orders.map((o) => (
              <OrderCard key={o.id} o={o} />
            ))}
          </div>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Pedidos de hoy" action={<Link to="/produccion" className="text-sm font-bold text-berry-600">Producción</Link>}>
          {d.today_orders.length ? (
            <div className="space-y-2.5">
              {d.today_orders.map((o) => (
                <OrderCard key={o.id} o={o} showDate={false} compact />
              ))}
            </div>
          ) : (
            <Card className="p-5 text-center text-choco-500">Hoy no hay entregas. ☕</Card>
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
            <Card className="p-5 text-center text-choco-500">Mañana no hay entregas.</Card>
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Avisos" action={<Link to="/avisos" className="text-sm font-bold text-berry-600">Ver todos</Link>}>
          {d.reminders.length ? (
            <Card className="divide-y divide-cream-200 overflow-hidden">
              {d.reminders.map((r) => (
                <ReminderRow key={r.id} r={r} />
              ))}
            </Card>
          ) : (
            <Card className="p-5 text-center text-choco-500">Todo en orden. ✨</Card>
          )}
        </Section>
        <Section title="Poco stock" action={<Link to="/compras" className="text-sm font-bold text-berry-600">Lista de la compra</Link>}>
          {d.low_stock.length ? (
            <Card className="divide-y divide-cream-200 overflow-hidden">
              {d.low_stock.map((i) => (
                <Link key={i.id} to={`/inventario/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50">
                  <span className="flex-1 font-semibold">{i.message}</span>
                  <ChevronRight size={18} className="text-choco-400" />
                </Link>
              ))}
            </Card>
          ) : (
            <Card className="p-5 text-center text-choco-500">Tienes de todo. 👍</Card>
          )}
        </Section>
      </div>
    </div>
  );
}

const TONES = {
  berry: 'from-berry-500 to-berry-600 text-white',
  caramel: 'from-caramel-500 to-caramel-700 text-white',
  violet: 'from-violet-500 to-violet-700 text-white',
  red: 'from-red-500 to-red-700 text-white',
  neutral: 'from-white to-white text-choco-800 border border-cream-200',
};

function StatTile({ to, label, value, emoji, tone }: { to: string; label: string; value: number; emoji: string; tone: keyof typeof TONES }) {
  return (
    <Link to={to} className={cx('rounded-2xl p-4 bg-gradient-to-br shadow-[var(--shadow-card)] active:scale-[0.98] transition', TONES[tone])}>
      <div className="flex items-start justify-between">
        <span className="text-4xl font-extrabold leading-none">{value}</span>
        <span className="text-2xl">{emoji}</span>
      </div>
      <div className="mt-2 font-bold opacity-95">{label}</div>
    </Link>
  );
}

function MoneyTile({ label, value, sub, tone, to }: { label: string; value: number; sub?: string; tone?: 'amber' | 'red' | 'green'; to?: string }) {
  const color = tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-700' : 'text-choco-900';
  const inner = (
    <>
      <div className="text-sm font-bold text-choco-500">{label}</div>
      <div className={cx('text-2xl font-extrabold mt-1 tabular-nums', color)}>{money(value)}</div>
      {sub && <div className="text-xs text-choco-500 mt-0.5">{sub}</div>}
    </>
  );
  return to ? (
    <Link to={to} className="card p-4 block active:scale-[0.98] transition">
      {inner}
    </Link>
  ) : (
    <div className="card p-4">{inner}</div>
  );
}

function NextDelivery({ o }: { o: OrderSummary }) {
  return (
    <Link to={`/pedidos/${o.id}`} className="card block p-4 border-2 border-berry-100 bg-gradient-to-r from-white to-berry-50 active:scale-[0.99] transition">
      <div className="flex items-center gap-2 text-berry-600 font-extrabold text-sm uppercase tracking-wide">
        <CalendarClock size={18} /> Próxima entrega · {untilText(o.delivery_date, o.delivery_time)}
      </div>
      <div className="mt-2 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xl font-extrabold text-choco-900">{o.customer_name}</div>
          <div className="text-choco-700">{o.summary}</div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 text-sm text-choco-500 font-semibold">
            <span className="inline-flex items-center gap-1">
              <Clock size={15} /> {relDay(o.delivery_date)} {o.delivery_time ?? ''}
            </span>
            <span className="inline-flex items-center gap-1">
              {o.delivery_type === 'delivery' ? <Truck size={15} /> : <Store size={15} />}
              {o.delivery_type === 'delivery' ? 'A domicilio' : 'Recogida'}
            </span>
            {o.allergens.length > 0 && (
              <span className="inline-flex items-center gap-1 text-red-600">
                <AlertTriangle size={15} /> Alérgenos
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={o.status} />
          <ArrowRight className="text-berry-500" />
        </div>
      </div>
    </Link>
  );
}
