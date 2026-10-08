import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { OrderStatus } from '@shared/constants';
import { useApi } from '../lib/api';
import { addDays, addMonths, dateLong, monthLabel, parseDate, relDay, today, weekStart } from '../lib/format';
import type { OrderSummary } from '../lib/types';
import { OrderCard } from '../components/OrderCard';
import { Button, Card, Chip, cx, ErrorBox, Fab, IconButton, Loading, PageHeader, Segmented, STATUS_STYLE } from '../components/ui';

type View = 'dia' | 'semana' | 'mes';

const FILTERS: { value: string; label: string; statuses: OrderStatus[] }[] = [
  { value: 'todos', label: 'Todos', statuses: ['nuevo', 'confirmado', 'pendiente', 'en_preparacion', 'terminado', 'entregado'] },
  { value: 'pendientes', label: 'Pendientes', statuses: ['nuevo', 'confirmado', 'pendiente'] },
  { value: 'preparacion', label: 'En preparación', statuses: ['en_preparacion'] },
  { value: 'terminados', label: 'Terminados', statuses: ['terminado'] },
  { value: 'entregados', label: 'Entregados', statuses: ['entregado'] },
  { value: 'cancelados', label: 'Cancelados', statuses: ['cancelado'] },
];

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const view = (params.get('vista') as View) || 'mes';
  const date = params.get('fecha') || today();
  const filter = params.get('filtro') || 'todos';
  const update = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => p.set(k, v));
    setParams(p, { replace: true });
  };

  const range = useMemo(() => {
    if (view === 'dia') return { from: date, to: date };
    if (view === 'semana') {
      const from = weekStart(date);
      return { from, to: addDays(from, 6) };
    }
    const first = `${date.slice(0, 7)}-01`;
    const from = weekStart(first);
    return { from, to: addDays(from, 41) };
  }, [view, date]);

  const res = useApi<OrderSummary[]>(`/orders?from=${range.from}&to=${range.to}&limit=1000`);
  const statuses = FILTERS.find((f) => f.value === filter)?.statuses ?? FILTERS[0].statuses;
  const orders = (res.data ?? []).filter((o) => statuses.includes(o.status));
  const byDay = useMemo(() => {
    const m = new Map<string, OrderSummary[]>();
    for (const o of orders) {
      if (!m.has(o.delivery_date)) m.set(o.delivery_date, []);
      m.get(o.delivery_date)!.push(o);
    }
    return m;
  }, [orders]);

  const move = (n: number) => {
    if (view === 'dia') update({ fecha: addDays(date, n) });
    else if (view === 'semana') update({ fecha: addDays(date, 7 * n) });
    else update({ fecha: `${addMonths(date.slice(0, 7), n)}-01` });
  };

  const title =
    view === 'mes'
      ? monthLabel(date.slice(0, 7))
      : view === 'semana'
        ? `Semana del ${parseDate(range.from).getDate()} al ${parseDate(range.to).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
        : `${relDay(date)}`;

  return (
    <div>
      <PageHeader title="Calendario" />
      <div className="space-y-3 mb-4">
        <Segmented
          value={view}
          onChange={(v) => update({ vista: v })}
          options={[
            { value: 'dia', label: 'Día' },
            { value: 'semana', label: 'Semana' },
            { value: 'mes', label: 'Mes' },
          ]}
        />
        <div className="flex items-center gap-1">
          <IconButton label="Anterior" onClick={() => move(-1)}>
            <ChevronLeft size={26} />
          </IconButton>
          <div className="flex-1 text-center">
            <div className="font-display text-[20px] text-choco-900 first-letter:uppercase">{title}</div>
            {view === 'dia' && <div className="text-sm text-choco-500 first-letter:uppercase">{dateLong(date)}</div>}
          </div>
          <IconButton label="Siguiente" onClick={() => move(1)}>
            <ChevronRight size={26} />
          </IconButton>
          <Button variant="secondary" size="sm" onClick={() => update({ fecha: today() })}>
            Hoy
          </Button>
        </div>
        <div className="scroll-x -mx-4 px-4">
          {FILTERS.map((f) => (
            <Chip key={f.value} active={filter === f.value} onClick={() => update({ filtro: f.value })}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      {res.error ? (
        <ErrorBox error={res.error} retry={res.refetch} />
      ) : res.isLoading ? (
        <Loading />
      ) : view === 'mes' ? (
        <MonthView from={range.from} month={date.slice(0, 7)} selected={date} byDay={byDay} onSelect={(d) => update({ fecha: d })} />
      ) : view === 'semana' ? (
        <div className="space-y-4">
          {Array.from({ length: 7 }, (_, i) => addDays(range.from, i)).map((d) => (
            <DayBlock key={d} date={d} list={byDay.get(d) ?? []} />
          ))}
        </div>
      ) : (
        <DayBlock date={date} list={byDay.get(date) ?? []} big />
      )}
      <Fab to={`/pedidos/nuevo?fecha=${date >= today() ? date : today()}`} label="Nuevo pedido" />
    </div>
  );
}

function MonthView({
  from,
  month,
  selected,
  byDay,
  onSelect,
}: {
  from: string;
  month: string;
  selected: string;
  byDay: Map<string, OrderSummary[]>;
  onSelect: (d: string) => void;
}) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const t = today();
  const selList = byDay.get(selected) ?? [];
  return (
    <div className="space-y-4">
      <Card className="p-2 sm:p-3">
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-choco-500 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const inMonth = d.startsWith(month);
            return (
              <button
                key={d}
                type="button"
                onClick={() => onSelect(d)}
                className={cx(
                  'min-h-16 sm:min-h-24 rounded-xl p-1 text-left flex flex-col transition border',
                  d === selected ? 'border-choco-900 bg-cream-50' : 'border-transparent hover:bg-cream-100',
                  !inMonth && 'opacity-40',
                )}
                aria-label={`${dateLong(d)}: ${list.length} pedidos`}
              >
                <span
                  className={cx(
                    'text-sm font-semibold h-7 w-7 flex items-center justify-center rounded-full self-center sm:self-start',
                    d === t && 'bg-choco-900 text-white',
                  )}
                >
                  {parseDate(d).getDate()}
                </span>
                {/* Móvil: puntos de colores. Ordenador: nombres. */}
                <div className="flex flex-wrap gap-0.5 justify-center sm:hidden mt-0.5">
                  {list.slice(0, 4).map((o) => (
                    <span key={o.id} className={cx('h-2 w-2 rounded-full', STATUS_STYLE[o.status].dot)} />
                  ))}
                  {list.length > 4 && <span className="text-[10px] font-medium leading-none">+{list.length - 4}</span>}
                </div>
                <div className="hidden sm:flex flex-col gap-0.5 mt-0.5 w-full">
                  {list.slice(0, 3).map((o) => (
                    <span key={o.id} className={cx('truncate rounded px-1 text-[11px] font-medium', STATUS_STYLE[o.status].badge)}>
                      {o.delivery_time ?? ''} {o.customer_name.split(' ')[0]}
                    </span>
                  ))}
                  {list.length > 3 && <span className="text-[11px] font-medium text-choco-500 px-1">+{list.length - 3} más</span>}
                </div>
              </button>
            );
          })}
        </div>
      </Card>
      <DayBlock date={selected} list={selList} />
    </div>
  );
}

function DayBlock({ date, list, big }: { date: string; list: OrderSummary[]; big?: boolean }) {
  const sorted = [...list].sort((a, b) => (a.delivery_time ?? '99').localeCompare(b.delivery_time ?? '99'));
  return (
    <section className="space-y-2">
      {!big && (
        <h2 className="flex items-baseline gap-2 px-1">
          <span className={cx('font-semibold', date === today() ? 'text-berry-600' : 'text-choco-800')}>{relDay(date)}</span>
          <span className="text-sm text-choco-500 first-letter:uppercase">{dateLong(date)}</span>
          <span className="ml-auto text-sm font-medium text-choco-400">{list.length || ''}</span>
        </h2>
      )}
      {sorted.length ? (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {sorted.map((o) => (
            <OrderCard key={o.id} o={o} showDate={false} compact={!big} />
          ))}
        </div>
      ) : (
        <Link
          to={`/pedidos/nuevo?fecha=${date >= today() ? date : today()}`}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-cream-300 py-4 text-choco-400 font-medium hover:text-choco-900 hover:border-crrry-200"
        >
          <Plus size={18} /> Sin pedidos · añadir
        </Link>
      )}
    </section>
  );
}
