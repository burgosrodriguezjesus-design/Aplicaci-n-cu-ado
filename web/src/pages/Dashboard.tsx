import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ArrowRight, BarChart3, BookOpen, CakeSlice, CalendarCheck, Check, ChevronRight, CircleCheck, ClipboardList, Coffee, FileText, Package, Plus, Store, Truck, Wheat, type LucideIcon } from 'lucide-react';
import { useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateLong, greeting, money, monthLabel, relDay, untilText } from '../lib/format';
import type { OrderSummary, Permissions, Reminder } from '../lib/types';
import { OrderCard } from '../components/OrderCard';
import { Card, cx, ErrorBox, Loading, Section, StatusBadge, TintIcon } from '../components/ui';
import { ColumnChart, SERIES } from '../components/Charts';
import { ReminderRow } from './Reminders';

interface DashboardData {
  today: string;
  counts: { today: number; tomorrow: number; week: number; overdue: number };
  today_orders: OrderSummary[];
  tomorrow_orders: OrderSummary[];
  overdue_orders: OrderSummary[];
  next_delivery: OrderSummary | null;
  money: {
    revenue: number;
    pending: number;
    pending_orders: number;
    expenses: number;
    profit: number;
    history: { month: string; revenue: number }[];
  } | null;
  low_stock: { id: number; name: string; message: string; kind: string }[];
  reminders: Reminder[];
  permissions: Permissions;
  setup: { products: number; recipes: number; items: number; orders: number };
}

function daySummary(c: DashboardData['counts']) {
  const today = c.today === 0 ? 'Hoy no tienes entregas' : `Hoy tienes ${c.today} ${c.today === 1 ? 'entrega' : 'entregas'}`;
  const tomorrow = c.tomorrow > 0 ? `, mañana ${c.tomorrow}` : '';
  const late = c.overdue > 0 ? ` y ${c.overdue} ${c.overdue === 1 ? 'pedido atrasado' : 'pedidos atrasados'}` : '';
  return `${today}${tomorrow}${late}.`;
}

export function Dashboard() {
  const { user } = useAuth();
  const q = useApi<DashboardData>('/dashboard', { refetchInterval: 60_000 });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} retry={q.refetch} />;
  const d = q.data;
  const name = user?.name && user.name !== 'Yo' ? user.name.split(' ')[0] : '';

  return (
    <div className="space-y-8 lg:space-y-10">
      {/* Cabecera */}
      <section className="hero relative overflow-hidden rounded-[28px] text-white px-5 pt-6 pb-5 lg:p-9 shadow-[var(--shadow-float)] -mx-1 lg:mx-0">
        <div className="absolute inset-0 hero-dots pointer-events-none" />
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full border border-white/10 pointer-events-none" />
        <div className="absolute -right-4 -top-8 h-40 w-40 rounded-full border border-white/10 pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-end gap-6 lg:gap-10">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/55 first-letter:uppercase">{dateLong(d.today)}</p>
            <h1 className="font-display text-[34px] lg:text-[46px] font-normal leading-[1.05] mt-2.5">
              {greeting()}
              {name && (
                <>
                  ,<br />
                  <span className="text-berry-200">{name}</span>
                </>
              )}
            </h1>
            <p className="mt-3 text-[14px] text-white/70 max-w-md">{daySummary(d.counts)}</p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link
                to="/pedidos/nuevo"
                className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-white text-choco-900 text-sm font-semibold shadow-[0_8px_20px_-8px_rgb(0_0_0/0.5)] hover:bg-cream-50 active:scale-[0.98] transition"
              >
                <Plus size={18} strokeWidth={2.25} /> Nuevo pedido
              </Link>
              <Link
                to="/presupuestos/nuevo"
                className="inline-flex items-center gap-2 h-11 px-4 rounded-xl glass text-white/90 text-sm font-medium hover:bg-white/15 transition"
              >
                <FileText size={16} strokeWidth={1.75} /> Presupuesto
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-4 lg:grid-cols-2 gap-2 lg:gap-2.5 lg:w-[330px]">
            <HeroStat to="/pedidos?vista=today" label="Hoy" value={d.counts.today} />
            <HeroStat to="/pedidos?vista=tomorrow" label="Mañana" value={d.counts.tomorrow} />
            <HeroStat to="/calendario?vista=semana" label="Semana" value={d.counts.week} />
            <HeroStat to="/pedidos?vista=overdue" label="Atrasados" short="Atrasos" value={d.counts.overdue} alert={d.counts.overdue > 0} />
          </div>
        </div>
      </section>

      <GettingStarted s={d.setup} />

      {d.next_delivery && <NextDelivery o={d.next_delivery} />}

      {d.money && <MonthCard m={d.money} />}

      {d.overdue_orders.length > 0 && (
        <Section title={<span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-berry-500" /> Atrasados</span>}>
          <div className="grid gap-3 lg:grid-cols-2">
            {d.overdue_orders.map((o) => (
              <OrderCard key={o.id} o={o} />
            ))}
          </div>
        </Section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Para hoy" action={<SectionLink to="/produccion">Producción</SectionLink>}>
          {d.today_orders.length ? (
            <div className="space-y-3">
              {d.today_orders.map((o) => (
                <OrderCard key={o.id} o={o} showDate={false} compact />
              ))}
            </div>
          ) : (
            <Placeholder icon={Coffee}>No hay entregas hoy.</Placeholder>
          )}
        </Section>
        <Section title="Para mañana" action={<SectionLink to="/pedidos?vista=tomorrow">Ver</SectionLink>}>
          {d.tomorrow_orders.length ? (
            <div className="space-y-3">
              {d.tomorrow_orders.map((o) => (
                <OrderCard key={o.id} o={o} showDate={false} compact />
              ))}
            </div>
          ) : (
            <Placeholder icon={CalendarCheck}>No hay entregas mañana.</Placeholder>
          )}
        </Section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Avisos" action={<SectionLink to="/avisos">Ver todos</SectionLink>}>
          {d.reminders.length ? (
            <Card className="divide-y divide-cream-200/80 overflow-hidden">
              {d.reminders.map((r) => (
                <ReminderRow key={r.id} r={r} />
              ))}
            </Card>
          ) : (
            <Placeholder icon={CircleCheck}>No hay avisos pendientes.</Placeholder>
          )}
        </Section>
        <Section title="Poco stock" action={<SectionLink to="/compras">Lista de la compra</SectionLink>}>
          {d.low_stock.length ? (
            <Card className="divide-y divide-cream-200/80 overflow-hidden">
              {d.low_stock.map((i) => (
                <Link key={i.id} to={`/inventario/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50 transition">
                  <TintIcon icon={i.kind === 'material' ? Package : Wheat} tint="caramel" size="sm" />
                  <span className="flex-1 text-sm text-choco-800">{i.message}</span>
                  <ChevronRight size={16} className="text-choco-400" />
                </Link>
              ))}
            </Card>
          ) : (
            <Placeholder icon={Package}>Ningún artículo por debajo del mínimo.</Placeholder>
          )}
        </Section>
      </div>
    </div>
  );
}

function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-0.5 text-[13px] font-medium text-berry-600 hover:text-berry-700">
      {children} <ChevronRight size={14} />
    </Link>
  );
}

function Placeholder({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50/60 px-4 py-7 flex flex-col items-center gap-2 text-center text-sm text-choco-500">
      <Icon size={20} strokeWidth={1.5} className="text-choco-400" />
      {children}
    </div>
  );
}

function HeroStat({ to, label, short, value, alert }: { to: string; label: string; short?: string; value: number; alert?: boolean }) {
  return (
    <Link to={to} className={cx('rounded-2xl glass px-3 py-3 lg:px-4 lg:py-3.5 hover:bg-white/[0.12] transition', alert && 'bg-berry-500/25 border-berry-200/30')}>
      <div className="font-display text-[28px] lg:text-[34px] leading-none tabular-nums">{value}</div>
      <div className={cx('mt-1.5 text-[11px] lg:text-[12px] truncate', alert ? 'text-berry-100' : 'text-white/60')}>
        {short ? (
          <>
            <span className="lg:hidden">{short}</span>
            <span className="hidden lg:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </div>
    </Link>
  );
}

function MonthCard({ m }: { m: NonNullable<DashboardData['money']> }) {
  const data = m.history.map((h) => ({ label: monthLabel(h.month).slice(0, 3), long: monthLabel(h.month), values: [h.revenue] }));
  const current = m.history.length - 1;
  return (
    <Section title="Este mes" action={<SectionLink to="/finanzas">Finanzas</SectionLink>}>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="min-w-0 p-5 lg:p-6">
            <div className="text-[13px] text-choco-500">Facturado</div>
            <div className="font-display text-[40px] leading-tight text-choco-900 tabular-nums">{money(m.revenue)}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 lg:gap-3">
              <MiniFigure label="Por cobrar" value={m.pending} tone={m.pending > 0 ? 'text-caramel-700' : undefined} to="/pedidos?vista=unpaid" />
              <MiniFigure label="Gastos" value={m.expenses} />
              <MiniFigure label="Beneficio" value={m.profit} tone={m.profit > 0 ? 'text-sage-700' : m.profit < 0 ? 'text-red-700' : undefined} />
            </div>
          </div>
          {data.some((x) => x.values[0] > 0) ? (
            <div className="min-w-0 px-4 pb-4 pt-1 lg:pt-6 lg:pr-6 lg:border-l border-cream-200/80">
              <div className="text-[12px] text-choco-500 mb-1 px-1">Facturado · últimos 6 meses</div>
              <ColumnChart
                data={data}
                series={[{ name: 'Facturado', color: SERIES.revenue }]}
                colorFor={(_, __, i) => (i === current ? SERIES.revenue : '#e6c3cd')}
                height={150}
              />
            </div>
          ) : (
            <div className="min-w-0 m-4 mt-0 lg:m-6 lg:ml-0 rounded-2xl border border-dashed border-cream-300 bg-cream-50/60 flex flex-col items-center justify-center gap-2 text-center px-6 py-8">
              <BarChart3 size={22} strokeWidth={1.5} className="text-berry-500" />
              <p className="text-sm text-choco-500 max-w-60">Cuando entregues pedidos verás aquí cómo evoluciona lo que facturas cada mes.</p>
            </div>
          )}
        </div>
      </Card>
    </Section>
  );
}

function MiniFigure({ label, value, tone, to }: { label: string; value: number; tone?: string; to?: string }) {
  const inner = (
    <>
      <div className="text-[12px] text-choco-500">{label}</div>
      <div className={cx('mt-0.5 text-[14px] lg:text-[15px] font-semibold tabular-nums truncate', tone ?? 'text-choco-900')}>{money(value)}</div>
    </>
  );
  return to ? (
    <Link to={to} className="min-w-0 rounded-xl bg-cream-50 border border-cream-200/80 px-2.5 lg:px-3 py-2.5 hover:border-cream-300 transition">
      {inner}
    </Link>
  ) : (
    <div className="min-w-0 rounded-xl bg-cream-50 border border-cream-200/80 px-2.5 lg:px-3 py-2.5">{inner}</div>
  );
}

function NextDelivery({ o }: { o: OrderSummary }) {
  return (
    <Link to={`/pedidos/${o.id}`} className="card flex items-stretch overflow-hidden hover:shadow-[var(--shadow-lift)] transition group">
      <div className="w-[88px] lg:w-28 shrink-0 bg-gradient-to-b from-berry-50 to-caramel-50 border-r border-cream-200/80 flex flex-col items-center justify-center text-center px-2 py-4">
        <span className="text-[10px] uppercase tracking-[0.14em] text-berry-600 font-semibold">{relDay(o.delivery_date)}</span>
        <span className="font-display text-[26px] leading-none text-choco-900 mt-1.5">{o.delivery_time ?? '—'}</span>
      </div>
      <div className="flex-1 min-w-0 p-4 lg:p-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-choco-500">
          Próxima entrega · <span className="text-choco-800 normal-case tracking-normal text-[12px] font-medium">{untilText(o.delivery_date, o.delivery_time)}</span>
        </div>
        <div className="mt-1.5 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-display text-[21px] leading-tight text-choco-900 truncate">{o.customer_name}</div>
            <div className="text-sm text-choco-700 mt-0.5 line-clamp-1">{o.summary}</div>
          </div>
          <StatusBadge status={o.status} />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-choco-500">
          <span className="inline-flex items-center gap-1.5">
            {o.delivery_type === 'delivery' ? <Truck size={14} strokeWidth={1.75} /> : <Store size={14} strokeWidth={1.75} />}
            {o.delivery_type === 'delivery' ? 'A domicilio' : 'Recoge en tienda'}
          </span>
          {o.allergens.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-red-700">
              <AlertTriangle size={14} strokeWidth={1.75} /> Alérgenos
            </span>
          )}
          <ArrowRight size={16} className="ml-auto text-choco-400 group-hover:text-berry-500 group-hover:translate-x-0.5 transition" />
        </div>
      </div>
    </Link>
  );
}

/** Guía para una pastelería recién creada: se va tachando sola y desaparece al completarla. */
function GettingStarted({ s }: { s: DashboardData['setup'] }) {
  const steps = [
    { done: s.products > 0, to: '/catalogo/nuevo', icon: CakeSlice, tint: 'rose' as const, title: 'Añade tus productos', text: 'Tartas, galletas… con tamaños y precios.' },
    { done: s.items > 0, to: '/inventario', icon: Package, tint: 'caramel' as const, title: 'Apunta tus ingredientes', text: 'Para saber qué te falta y qué comprar.' },
    { done: s.recipes > 0, to: '/recetas/nueva', icon: BookOpen, tint: 'plum' as const, title: 'Guarda tus recetas', text: 'Se escalan solas y calculan el coste.' },
    { done: s.orders > 0, to: '/pedidos/nuevo', icon: ClipboardList, tint: 'sage' as const, title: 'Crea tu primer pedido', text: 'Y aparecerá en el calendario y en producción.' },
  ];
  const done = steps.filter((x) => x.done).length;
  if (done === steps.length) return null;
  return (
    <Section title="Pon en marcha tu obrador" action={<span className="text-[13px] text-choco-500 tabular-nums">{done} de {steps.length}</span>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {steps.map((st) => (
          <Link
            key={st.to}
            to={st.to}
            className={cx('card flex items-center gap-3.5 p-4 hover:shadow-[var(--shadow-lift)] hover:-translate-y-px transition', st.done && 'opacity-60')}
          >
            {st.done ? (
              <span className="h-10 w-10 shrink-0 rounded-xl bg-sage-500 text-white flex items-center justify-center">
                <Check size={18} strokeWidth={2.25} />
              </span>
            ) : (
              <TintIcon icon={st.icon} tint={st.tint} />
            )}
            <span className="flex-1 min-w-0">
              <span className={cx('block font-medium text-choco-900', st.done && 'line-through')}>{st.title}</span>
              <span className="block text-[13px] text-choco-500">{st.text}</span>
            </span>
            {!st.done && <ChevronRight size={16} className="text-choco-400" />}
          </Link>
        ))}
      </div>
    </Section>
  );
}
