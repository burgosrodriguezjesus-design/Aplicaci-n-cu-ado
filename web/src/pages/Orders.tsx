import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ClipboardList, Plus } from 'lucide-react';
import { useApi } from '../lib/api';
import { dateLong, relDay, today } from '../lib/format';
import type { OrderSummary } from '../lib/types';
import { OrderCard } from '../components/OrderCard';
import { Button, Chip, Empty, ErrorBox, Fab, Loading, PageHeader, SearchInput } from '../components/ui';

const VIEWS = [
  { value: 'upcoming', label: 'Próximos' },
  { value: 'today', label: 'Hoy' },
  { value: 'tomorrow', label: 'Mañana' },
  { value: 'overdue', label: 'Atrasados' },
  { value: 'unpaid', label: 'Por cobrar' },
  { value: 'delivered', label: 'Entregados' },
  { value: 'cancelled', label: 'Cancelados' },
  { value: 'all', label: 'Todos' },
];

export function Orders() {
  const [params, setParams] = useSearchParams();
  const view = params.get('vista') || 'upcoming';
  const [q, setQ] = useState(params.get('q') || '');
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const path = `/orders?view=${view}${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`;
  const res = useApi<OrderSummary[]>(path);

  // Agrupar por día de entrega
  const groups = useMemo(() => {
    const m = new Map<string, OrderSummary[]>();
    for (const o of res.data ?? []) {
      if (!m.has(o.delivery_date)) m.set(o.delivery_date, []);
      m.get(o.delivery_date)!.push(o);
    }
    return [...m.entries()];
  }, [res.data]);

  return (
    <div>
      <PageHeader
        title="Pedidos"
        actions={
          <Link to="/pedidos/nuevo" className="hidden lg:block">
            <Button icon={<Plus size={20} />}>Nuevo pedido</Button>
          </Link>
        }
      />
      <div className="space-y-3 mb-4">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por cliente, teléfono, nº o producto" />
        <div className="scroll-x -mx-4 px-4">
          {VIEWS.map((v) => (
            <Chip
              key={v.value}
              active={view === v.value}
              onClick={() => {
                const p = new URLSearchParams(params);
                p.set('vista', v.value);
                setParams(p, { replace: true });
              }}
            >
              {v.label}
            </Chip>
          ))}
        </div>
      </div>

      {res.isLoading ? (
        <Loading />
      ) : res.error ? (
        <ErrorBox error={res.error} retry={res.refetch} />
      ) : !res.data?.length ? (
        <Empty
          icon={ClipboardList}
          title={debounced ? 'Sin resultados' : 'No hay pedidos aquí'}
          text={debounced ? 'Prueba con otro nombre o número.' : 'Cuando entren pedidos los verás en esta lista.'}
          action={
            <Link to="/pedidos/nuevo">
              <Button icon={<Plus size={20} />}>Nuevo pedido</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([date, list]) => (
            <section key={date} className="space-y-2">
              <h2 className="px-1 flex items-baseline gap-2">
                <span className={date < today() && view !== 'delivered' && view !== 'all' && view !== 'cancelled' ? 'font-semibold text-red-600' : 'font-semibold text-choco-800'}>
                  {relDay(date)}
                </span>
                <span className="text-sm text-choco-500 first-letter:uppercase">{dateLong(date)}</span>
                <span className="ml-auto text-sm text-choco-400 font-medium">{list.length}</span>
              </h2>
              <div className="grid gap-2.5 lg:grid-cols-2">
                {list.map((o) => (
                  <OrderCard key={o.id} o={o} showDate={false} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <Fab to="/pedidos/nuevo" label="Nuevo pedido" />
    </div>
  );
}
