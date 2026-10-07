import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Check, ChefHat, ChevronRight, MapPin, TriangleAlert } from 'lucide-react';
import {
  ALLERGEN_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type Allergen,
  type ProductCategory,
  type Stage,
} from '@shared/constants';
import { api, useAction, useApi } from '../lib/api';
import { addDays, dateLong, money, num, qty, relDay, today } from '../lib/format';
import type { Requirement } from '../lib/types';
import { Badge, Button, Card, CategoryIcon, Chip, Collapsible, Empty, ErrorBox, Input, Loading, PageHeader, ProgressBar, Segmented, Sheet, StageIcon, StatusBadge, cx } from '../components/ui';

interface ProdTask {
  id: number;
  order_id: number;
  stage: Stage;
  title: string;
  done: boolean;
  done_by_name: string | null;
  order_number: number;
  customer_name: string;
  customer_phone: string | null;
  delivery_date: string;
  delivery_time: string | null;
  delivery_type: string;
  delivery_address: string | null;
  order_status: any;
  order_notes: string | null;
  allergens: string[];
  pending: number | null;
  flavor: string | null;
  filling: string | null;
  coverage: string | null;
  decoration: string | null;
  custom_text: string | null;
  item_notes: string | null;
  servings: number | null;
}

interface ProductionData {
  date: string;
  is_today: boolean;
  summary: { product_name: string; size_name: string | null; flavor: string | null; unit_label: string | null; category: ProductCategory | null; quantity: number; done_quantity: number; orders: number[] }[];
  stages: { stage: Stage; label: string; tasks: ProdTask[]; total: number; done: number }[];
  orders: { id: number; number: number; customer_name: string; delivery_date: string; delivery_time: string | null; status: any; producing: boolean; delivering: boolean }[];
  requirements: Omit<Requirement, 'cost'>[];
  unconfirmed: { id: number; number: number; customer_name: string; delivery_date: string; delivery_time: string | null }[];
  progress: { done: number; total: number };
}

export function Production() {
  const [params, setParams] = useSearchParams();
  const date = params.get('fecha') || today();
  const [group, setGroup] = useState<'stage' | 'order'>('stage');
  const [deliver, setDeliver] = useState<ProdTask | null>(null);
  const res = useApi<ProductionData>(`/production?date=${date}`, { refetchInterval: 30_000 });
  const toggle = useAction((v: { id: number; done: boolean }) => api(`/production/tasks/${v.id}`, { method: 'PATCH', body: { done: v.done } }), {
    success: (r: any) => (r.status === 'terminado' ? 'Pedido terminado' : r.status === 'entregado' ? 'Pedido entregado' : ''),
  });

  const setDate = (d: string) => {
    const p = new URLSearchParams(params);
    p.set('fecha', d);
    setParams(p, { replace: true });
  };

  const onToggle = (t: ProdTask) => {
    if (t.stage === 'entregar' && !t.done && (t.pending ?? 0) > 0.005) setDeliver(t);
    else toggle.mutate({ id: t.id, done: !t.done });
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Producción" subtitle={<span className="first-letter:uppercase inline-block">{dateLong(date)}</span>} />
      <div className="flex flex-wrap items-center gap-2">
        {[-1, 0, 1, 2].map((n) => {
          const d = addDays(today(), n);
          return (
            <Chip key={n} active={d === date} onClick={() => setDate(d)}>
              {relDay(d)}
            </Chip>
          );
        })}
        <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="!w-auto !py-2 !min-h-10" />
      </div>

      {res.error ? (
        <ErrorBox error={res.error} retry={res.refetch} />
      ) : res.isLoading || !res.data ? (
        <Loading />
      ) : (
        <ProductionBody data={res.data} group={group} setGroup={setGroup} onToggle={onToggle} />
      )}
      {deliver && <DeliverTaskSheet task={deliver} onClose={() => setDeliver(null)} />}
    </div>
  );
}

function ProductionBody({
  data,
  group,
  setGroup,
  onToggle,
}: {
  data: ProductionData;
  group: 'stage' | 'order';
  setGroup: (g: 'stage' | 'order') => void;
  onToggle: (t: ProdTask) => void;
}) {
  const label = data.is_today ? 'HOY' : relDay(data.date).toUpperCase() === 'MAÑANA' ? 'MAÑANA' : `EL ${relDay(data.date).toUpperCase()}`;
  const stages = data.stages.filter((s) => s.total > 0);
  if (!stages.length && !data.summary.length && !data.unconfirmed.length) {
    return <Empty icon={ChefHat} title="Nada que preparar" text="No hay pedidos para producir ni entregar este día." />;
  }
  return (
    <>
      {data.unconfirmed.length > 0 && (
        <div className="rounded-xl bg-sky-50 border border-sky-200 p-4">
          <div className="font-semibold text-sky-800 mb-1">Pedidos sin confirmar para estos días</div>
          <div className="space-y-1">
            {data.unconfirmed.map((o) => (
              <Link key={o.id} to={`/pedidos/${o.id}`} className="flex items-center gap-2 text-sky-900 font-semibold">
                <span className="flex-1">
                  #{o.number} {o.customer_name} · {relDay(o.delivery_date)} {o.delivery_time ?? ''}
                </span>
                <ChevronRight size={16} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.summary.length > 0 && (
        <Card className="p-4">
          <div className="text-[13px] font-medium text-choco-500 mb-3 first-letter:uppercase">{label.toLowerCase()} hay que preparar</div>
          <ul className="space-y-1.5">
            {data.summary.map((s, i) => {
              const done = s.done_quantity >= s.quantity;
              return (
                <li key={i} className={cx('flex items-center gap-2.5 text-[15px]', done && 'line-through text-choco-400')}>
                  <CategoryIcon category={s.category} />
                  <span className="flex-1">
                    <b>{num(s.quantity)}</b> {s.product_name.toLowerCase()}
                    {s.size_name && <span className="text-choco-500"> ({s.size_name.toLowerCase()})</span>}
                    {s.flavor && <span className="text-choco-500"> · {s.flavor.toLowerCase()}</span>}
                  </span>
                  {done && <Check className="text-emerald-600" />}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {data.progress.total > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm font-medium text-choco-700">
            <span>Progreso del día</span>
            <span>
              {data.progress.done} de {data.progress.total} tareas
            </span>
          </div>
          <ProgressBar value={data.progress.done} total={data.progress.total} className="h-3.5" />
        </div>
      )}

      <Segmented
        value={group}
        onChange={setGroup}
        options={[
          { value: 'stage', label: 'Por fases' },
          { value: 'order', label: 'Por pedido' },
        ]}
      />

      {group === 'stage' ? (
        <div className="space-y-5">
          {stages.map((s) => (
            <section key={s.stage} className="space-y-2">
              <h2 className="flex items-center gap-2 px-1">
                <StageIcon stage={s.stage} />
                <span className="text-[15px] font-semibold">{s.label}</span>
                <span className={cx('ml-auto text-xs font-medium rounded-md px-2 py-0.5 ring-1 ring-inset tabular-nums', s.done === s.total ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-white text-choco-700 ring-cream-300')}>
                  {s.done}/{s.total}
                </span>
              </h2>
              <div className="space-y-2">
                {s.tasks.map((t) => (
                  <TaskRow key={t.id} t={t} onToggle={() => onToggle(t)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {data.orders.map((o) => {
            const tasks = stages.flatMap((s) => s.tasks).filter((t) => t.order_id === o.id);
            if (!tasks.length) return null;
            return (
              <Card key={o.id} className="p-3">
                <Link to={`/pedidos/${o.id}`} className="flex items-center gap-2 px-1 pb-2">
                  <span className="font-semibold flex-1">
                    #{o.number} {o.customer_name}
                    <span className="block text-sm text-choco-500 font-semibold">
                      Entrega {relDay(o.delivery_date).toLowerCase()} {o.delivery_time ?? ''}
                    </span>
                  </span>
                  <StatusBadge status={o.status} />
                  <ChevronRight size={18} className="text-choco-400" />
                </Link>
                <div className="space-y-1.5">
                  {tasks.map((t) => (
                    <TaskRow key={t.id} t={t} onToggle={() => onToggle(t)} compact />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {data.requirements.length > 0 && (
        <Collapsible
          title="Ingredientes que vas a usar"
          right={data.requirements.some((r) => r.missing > 0) ? <Badge tone="red">Falta stock</Badge> : <Badge tone="green">Hay de todo</Badge>}
        >
          <div className="divide-y divide-cream-200">
            {data.requirements.map((r) => (
              <div key={r.item_id} className="flex items-center gap-2 py-2">
                <span className="flex-1">{r.name}</span>
                <span className="font-medium tabular-nums">{qty(r.needed, r.unit)}</span>
                {r.missing > 0 ? <Badge tone="red">Faltan {qty(r.missing, r.unit)}</Badge> : <Badge tone="green">Hay {qty(r.stock, r.unit)}</Badge>}
              </div>
            ))}
          </div>
          <Link to="/compras" className="block mt-3">
            <Button variant="secondary" block>
              Ver lista de la compra
            </Button>
          </Link>
        </Collapsible>
      )}
    </>
  );
}

function TaskRow({ t, onToggle, compact }: { t: ProdTask; onToggle: () => void; compact?: boolean }) {
  const details: [string, string | null][] =
    t.stage === 'entregar'
      ? []
      : [
          ['Sabor', t.stage === 'preparar' || t.stage === 'hornear' ? t.flavor : null],
          ['Relleno', t.stage === 'rellenar' ? t.filling : null],
          ['Cobertura', t.stage === 'decorar' || t.stage === 'rellenar' ? t.coverage : null],
          ['Decoración', t.stage === 'decorar' ? t.decoration : null],
          ['Personas', t.stage === 'preparar' && t.servings && t.servings > 1 ? num(t.servings) : null],
          ['Notas', t.item_notes],
        ];
  const late = t.delivery_date < today() && !t.done;
  return (
    <div className={cx('card flex items-start gap-3 p-3 transition', t.done && 'bg-cream-50 opacity-70')}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={t.done ? 'Desmarcar tarea' : 'Marcar como hecha'}
        aria-pressed={t.done}
        className={cx(
          'h-8 w-8 shrink-0 rounded-md border-[1.5px] flex items-center justify-center transition active:scale-90',
          t.done ? 'bg-choco-900 border-choco-900 text-white' : 'border-cream-300 bg-white hover:border-choco-500',
        )}
      >
        {t.done && <Check size={16} strokeWidth={2.5} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={cx('font-semibold text-[15px] leading-snug', t.done && 'line-through')}>
          
          {t.stage === 'entregar' ? `${t.delivery_type === 'delivery' ? 'Llevar a' : 'Recoge'} ${t.customer_name}` : t.title}
        </div>
        <div className={cx('text-sm font-semibold', late ? 'text-red-600' : 'text-choco-500')}>
          #{t.order_number} {t.stage !== 'entregar' && `· ${t.customer_name}`} · entrega {relDay(t.delivery_date).toLowerCase()} {t.delivery_time ?? ''}
        </div>
        {details.some(([, v]) => v) && (
          <div className="mt-1 text-[15px] space-y-0.5">
            {details
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <span className="text-choco-500">{k}:</span> <b>{v}</b>
                </div>
              ))}
          </div>
        )}
        {t.custom_text && t.stage === 'decorar' && (
          <div className="mt-1.5 inline-block rounded-lg bg-caramel-100 px-2 py-1 font-semibold">«{t.custom_text}»</div>
        )}
        {t.stage === 'entregar' && (
          <div className="mt-1 text-sm space-y-0.5">
            {t.delivery_type === 'delivery' && t.delivery_address && (
              <div className="flex items-center gap-1">
                <MapPin size={14} /> {t.delivery_address}
              </div>
            )}
            {(t.pending ?? 0) > 0.005 && <Badge tone="amber">Cobrar {money(t.pending!)}</Badge>}
          </div>
        )}
        {t.allergens.length > 0 && (
          <div className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-red-600 text-white text-xs font-semibold px-2 py-1">
            <TriangleAlert size={13} /> SIN {t.allergens.map((a) => ALLERGEN_LABELS[a as Allergen] ?? a).join(', ').toUpperCase()}
          </div>
        )}
        {t.done && t.done_by_name && <div className="text-xs text-choco-400 mt-1">Hecho por {t.done_by_name}</div>}
      </div>
    </div>
  );
}

function DeliverTaskSheet({ task, onClose }: { task: ProdTask; onClose: () => void }) {
  const [method, setMethod] = useState('efectivo');
  const run = useAction(
    async (collect: boolean) => {
      if (collect) await api(`/orders/${task.order_id}/payments`, { method: 'POST', body: { kind: 'payment', amount: task.pending, method } });
      return api(`/production/tasks/${task.id}`, { method: 'PATCH', body: { done: true } });
    },
    { success: 'Pedido entregado', onSuccess: onClose },
  );
  return (
    <Sheet open onClose={onClose} title={`Entregar a ${task.customer_name}`}>
      <div className="space-y-4">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
          <div className="font-semibold">Queda por cobrar</div>
          <div className="text-3xl font-semibold text-amber-700">{money(task.pending ?? 0)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m} active={method === m} onClick={() => setMethod(m)}>
              {PAYMENT_METHOD_LABELS[m]}
            </Chip>
          ))}
        </div>
        <Button block size="lg" variant="success" loading={run.isPending} onClick={() => run.mutate(true)}>
          Cobrar y entregar
        </Button>
        <Button block variant="ghost" disabled={run.isPending} onClick={() => run.mutate(false)}>
          Entregar sin cobrar
        </Button>
      </div>
    </Sheet>
  );
}
