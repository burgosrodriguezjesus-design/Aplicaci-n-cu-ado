import { useState } from 'react';
import { Link } from 'react-router';
import { Check, Plus, ShoppingCart, Trash2, Undo2 } from 'lucide-react';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type Unit } from '@shared/constants';
import { api, useAction, useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateLong, money, num, qty, relDay } from '../lib/format';
import {
  Button,
  Card,
  Chip,
  cx,
  Empty,
  ErrorBox,
  Field,
  Input,
  Loading,
  NumberInput,
  PageHeader,
  Section,
  Sheet,
  Toggle,
  useConfirm,
} from '../components/ui';

interface ShopItem {
  item_id: number;
  name: string;
  kind: 'ingredient' | 'material';
  unit: Unit;
  stock: number;
  min_stock: number;
  needed: number;
  shortfall: number;
  suggested: number;
  pack_size: number | null;
  cost_per_unit: number;
  est_cost: number;
  supplier: string | null;
  checked: boolean;
  reason: 'orders' | 'min_stock';
  orders: number[];
}

interface ShopData {
  days: number;
  until: string;
  orders: { id: number; number: number; customer_name: string; delivery_date: string }[];
  items: ShopItem[];
  extras: { id: number; name: string; quantity: string | null; done: number }[];
  recent: { id: number; date: string; description: string; amount: number; supplier: string | null; lines: number }[];
  total_est: number;
}

/** "3 kg de harina", "24 huevos", "5 cajas tarta grande" */
export function shoppingText(q: number, unit: Unit, name: string) {
  const n = name.toLowerCase();
  if (unit === 'ud') {
    const [first, ...rest] = n.split(' ');
    const plural = q === 1 || /s$/.test(first) ? n : [/[aeiouáéó]$/.test(first) ? `${first}s` : `${first}es`, ...rest].join(' ');
    return `${num(q, 1)} ${plural}`;
  }
  return `${qty(q, unit)} de ${n}`;
}

export function Shopping() {
  const { permissions } = useAuth();
  const confirm = useConfirm();
  const [days, setDays] = useState(7);
  const [includeNew, setIncludeNew] = useState(false);
  const [newExtra, setNewExtra] = useState('');
  const [checkout, setCheckout] = useState(false);
  const res = useApi<ShopData>(`/shopping?days=${days}${includeNew ? '&include_new=1' : ''}`);
  const check = useAction((v: { item_id: number; checked: boolean }) => api('/shopping/checks', { method: 'POST', body: v }), { silent: false });
  const addExtra = useAction((name: string) => api('/shopping/extras', { method: 'POST', body: { name } }), { onSuccess: () => setNewExtra('') });
  const toggleExtra = useAction((v: { id: number; done: boolean }) => api(`/shopping/extras/${v.id}`, { method: 'PATCH', body: { done: v.done } }));
  const delExtra = useAction((id: number) => api(`/shopping/extras/${id}`, { method: 'DELETE' }));
  const undo = useAction((id: number) => api(`/expenses/${id}`, { method: 'DELETE' }), { success: 'Compra deshecha: se ha quitado del inventario' });

  if (res.isLoading) return <Loading />;
  if (res.error || !res.data) return <ErrorBox error={res.error} retry={res.refetch} />;
  const d = res.data;
  const checked = d.items.filter((i) => i.checked);
  const showMoney = permissions.inventory || permissions.costs;
  const groups: [string, ShopItem[]][] = [
    ['Ingredientes', d.items.filter((i) => i.kind === 'ingredient')],
    ['Materiales y envases', d.items.filter((i) => i.kind === 'material')],
  ];

  return (
    <div className="space-y-5 pb-24">
      <PageHeader title="Lista de la compra" back="/mas" />
      <div className="flex flex-wrap gap-2 items-center">
        {[
          [7, 'Esta semana'],
          [14, '2 semanas'],
          [30, 'Este mes'],
        ].map(([n, label]) => (
          <Chip key={n} active={days === n} onClick={() => setDays(n as number)}>
            {label}
          </Chip>
        ))}
      </div>
      <Toggle checked={includeNew} onChange={setIncludeNew} label="Contar también pedidos sin confirmar" />

      <Card className="p-4">
        <div className="font-semibold text-base leading-snug">
          {d.items.length
            ? `Para los pedidos hasta el ${dateLong(d.until)} necesitas comprar:`
            : `Tienes todo lo necesario para los pedidos hasta el ${dateLong(d.until)}.`}
        </div>
        <div className="text-sm text-choco-700 mt-1">
          {d.orders.length} {d.orders.length === 1 ? 'pedido' : 'pedidos'} pendientes de preparar
          {d.orders.length > 0 && ': '}
          {d.orders.slice(0, 8).map((o, i) => (
            <span key={o.id}>
              {i > 0 && ', '}
              <Link to={`/pedidos/${o.id}`} className="font-medium text-berry-600">
                #{o.number}
              </Link>
            </span>
          ))}
          {d.orders.length > 8 && '…'}
        </div>
        {showMoney && d.total_est > 0 && <div className="mt-2 font-medium">Gasto estimado: {money(d.total_est)}</div>}
      </Card>

      {groups.map(
        ([title, list]) =>
          list.length > 0 && (
            <Section key={title} title={title}>
              <Card className="divide-y divide-cream-200 overflow-hidden">
                {list.map((i) => (
                  <button
                    key={i.item_id}
                    type="button"
                    onClick={() => check.mutate({ item_id: i.item_id, checked: !i.checked })}
                    className={cx('w-full flex items-start gap-3 px-4 py-3 text-left transition', i.checked ? 'bg-cream-50' : 'hover:bg-cream-50')}
                  >
                    <span
                      className={cx(
                        'mt-0.5 h-6 w-6 shrink-0 rounded-md border-[1.5px] flex items-center justify-center',
                        i.checked ? 'bg-choco-900 border-choco-900 text-white' : 'border-cream-300 bg-white',
                      )}
                    >
                      {i.checked && <Check size={14} strokeWidth={2.5} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={cx('block font-semibold text-[15px]', i.checked && 'line-through text-choco-400')}>
                        {shoppingText(i.suggested, i.unit, i.name)}
                      </span>
                      <span className="block text-sm text-choco-500">
                        {i.reason === 'orders' ? `Para pedidos: ${qty(i.needed, i.unit)}` : 'Por debajo del mínimo'} · Tienes {qty(Math.max(i.stock, 0), i.unit)}
                        {i.min_stock > 0 && ` · Mínimo ${qty(i.min_stock, i.unit)}`}
                        {i.supplier && ` · ${i.supplier}`}
                      </span>
                    </span>
                    {showMoney && i.est_cost > 0 && <span className="text-sm font-medium text-choco-500 tabular-nums">≈ {money(i.est_cost)}</span>}
                  </button>
                ))}
              </Card>
            </Section>
          ),
      )}

      <Section title="Otras cosas que comprar">
        <Card className="divide-y divide-cream-200 overflow-hidden">
          {d.extras.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <button
                type="button"
                onClick={() => toggleExtra.mutate({ id: e.id, done: !e.done })}
                aria-label={e.done ? 'Desmarcar' : 'Marcar como comprado'}
                className={cx('h-6 w-6 shrink-0 rounded-md border-[1.5px] flex items-center justify-center', e.done ? 'bg-choco-900 border-choco-900 text-white' : 'border-cream-300 bg-white')}
              >
                {!!e.done && <Check size={14} strokeWidth={2.5} />}
              </button>
              <span className={cx('flex-1 font-semibold', e.done && 'line-through text-choco-400')}>
                {e.name} {e.quantity && <span className="text-choco-500 font-normal">({e.quantity})</span>}
              </span>
              <button type="button" aria-label="Quitar" className="p-2 text-choco-400 hover:text-red-600" onClick={() => delExtra.mutate(e.id)}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
          <form
            className="flex gap-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (newExtra.trim()) addExtra.mutate(newExtra.trim());
            }}
          >
            <Input value={newExtra} onChange={(e) => setNewExtra(e.target.value)} placeholder="Ej. papel de horno, servilletas…" />
            <Button type="submit" variant="secondary" icon={<Plus size={18} />} disabled={!newExtra.trim()} loading={addExtra.isPending}>
              Añadir
            </Button>
          </form>
        </Card>
      </Section>

      {d.recent.length > 0 && (
        <Section title="Compras recientes">
          <Card className="divide-y divide-cream-200">
            {d.recent.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{r.description}</div>
                  <div className="text-xs text-choco-500">
                    {relDay(r.date)} {r.supplier ? `· ${r.supplier}` : ''}
                  </div>
                </div>
                {showMoney && <b className="tabular-nums">{money(r.amount)}</b>}
                {permissions.inventory && (
                  <button
                    type="button"
                    className="p-2 text-choco-400 hover:text-red-600"
                    aria-label="Deshacer compra"
                    title="Deshacer compra"
                    onClick={async () =>
                      (await confirm({ title: '¿Deshacer esta compra?', text: 'Se borrará el gasto y se quitarán esas cantidades del inventario.', ok: 'Deshacer', danger: true })) && undo.mutate(r.id)
                    }
                  >
                    <Undo2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </Card>
        </Section>
      )}

      {(checked.length > 0 || d.extras.some((e) => e.done)) && (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:bottom-0 lg:left-64 z-30 bg-white/95 backdrop-blur border-t border-cream-200">
          <div className="mx-auto max-w-5xl px-4 lg:px-8 py-3">
            {permissions.inventory ? (
              <Button block size="lg" variant="success" disabled={!checked.length} onClick={() => setCheckout(true)}>
                Registrar compra ({checked.length} {checked.length === 1 ? 'producto' : 'productos'})
              </Button>
            ) : (
              <p className="text-center text-sm text-choco-500">Pide al administrador que registre la compra para sumarla al inventario.</p>
            )}
          </div>
        </div>
      )}
      {checkout && <PurchaseSheet items={checked} extraIds={d.extras.filter((e) => e.done).map((e) => e.id)} onClose={() => setCheckout(false)} />}
      {!d.items.length && !d.extras.length && !d.recent.length && <Empty icon={ShoppingCart} title="Lista vacía" text="Cuando falte algo para tus pedidos o baje del mínimo, aparecerá aquí solo." />}
    </div>
  );
}

function PurchaseSheet({ items, extraIds, onClose }: { items: ShopItem[]; extraIds: number[]; onClose: () => void }) {
  const [lines, setLines] = useState(items.map((i) => ({ item_id: i.item_id, name: i.name, unit: i.unit, quantity: i.suggested as number | null, total_cost: i.est_cost as number | null })));
  const [supplier, setSupplier] = useState(items.find((i) => i.supplier)?.supplier ?? '');
  const [method, setMethod] = useState<string>('tarjeta');
  const total = lines.reduce((s, l) => s + (l.total_cost ?? 0), 0);
  const save = useAction(
    () =>
      api('/shopping/purchase', {
        method: 'POST',
        body: {
          lines: lines.filter((l) => l.quantity && l.quantity > 0).map((l) => ({ item_id: l.item_id, quantity: l.quantity, total_cost: l.total_cost ?? 0 })),
          extra_ids: extraIds,
          supplier: supplier || null,
          payment_method: method,
        },
      }),
    { success: 'Compra registrada: inventario actualizado y gasto anotado', onSuccess: onClose },
  );
  return (
    <Sheet
      open
      onClose={onClose}
      title="Registrar compra"
      wide
      footer={
        <Button block size="lg" variant="success" loading={save.isPending} onClick={() => save.mutate()}>
          Guardar compra · {money(total)}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-choco-500">Revisa lo que has comprado y lo que ha costado (mira el tique). Se sumará al inventario y se anotará el gasto.</p>
        <div className="space-y-2.5">
          {lines.map((l, i) => (
            <div key={l.item_id} className="rounded-xl border border-cream-200 bg-white p-3">
              <div className="font-medium mb-2">{l.name}</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Cantidad">
                  <NumberInput value={l.quantity} onChange={(quantity) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity } : x)))} suffix={l.unit} />
                </Field>
                <Field label="Precio total">
                  <NumberInput value={l.total_cost} onChange={(total_cost) => setLines(lines.map((x, j) => (j === i ? { ...x, total_cost } : x)))} suffix="€" />
                </Field>
              </div>
            </div>
          ))}
        </div>
        <Field label="Dónde has comprado">
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ej. Makro" />
        </Field>
        <div>
          <span className="label">Forma de pago</span>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
              <Chip key={m} active={method === m} onClick={() => setMethod(m)}>
                {PAYMENT_METHOD_LABELS[m]}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
