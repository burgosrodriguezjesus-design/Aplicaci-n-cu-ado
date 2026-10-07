import { useState } from 'react';
import { Link } from 'react-router';
import { Bell, Check, ChefHat, ChevronRight, CircleCheck, CircleHelp, FileText, Gift, Package, Pin, Plus, ShoppingCart, Trash2, TriangleAlert, Truck, Wallet, type LucideIcon } from 'lucide-react';
import { api, useAction, useApi } from '../lib/api';
import { relDay, today } from '../lib/format';
import type { Reminder } from '../lib/types';
import { Button, Card, cx, Empty, ErrorBox, Input, Loading, PageHeader, Section } from '../components/ui';

const ICON: Record<string, LucideIcon> = {
  start: ChefHat,
  delivery: Truck,
  payment: Wallet,
  stock: Package,
  shopping: ShoppingCart,
  unconfirmed: CircleHelp,
  overdue: TriangleAlert,
  birthday: Gift,
  quote: FileText,
  manual: Pin,
};

const SEV_ICON = { urgent: 'text-red-600', warning: 'text-amber-600', info: 'text-choco-400' };

export function ReminderRow({ r, onDone }: { r: Reminder; onDone?: () => void }) {
  const Icon = ICON[r.type] ?? Bell;
  const body = (
    <>
      <Icon size={18} strokeWidth={1.75} className={cx('shrink-0', SEV_ICON[r.severity])} />
      <span className="flex-1 text-sm leading-snug text-choco-800">{r.text.replace(/^⚠️ /, '')}</span>
    </>
  );
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {r.link ? (
        <Link to={r.link} className="flex items-center gap-3 flex-1 min-w-0">
          {body}
          <ChevronRight size={18} className="text-choco-300 shrink-0" />
        </Link>
      ) : (
        <div className="flex items-center gap-3 flex-1 min-w-0">{body}</div>
      )}
      {onDone && (
        <button type="button" aria-label="Hecho" className="h-10 w-10 rounded-full flex items-center justify-center text-emerald-600 hover:bg-emerald-50" onClick={onDone}>
          <Check size={20} />
        </button>
      )}
    </div>
  );
}

export function Reminders() {
  const res = useApi<Reminder[]>('/reminders');
  const manual = useApi<{ id: number; text: string; due_date: string | null; done: number; order_number: number | null }[]>('/reminders/manual');
  const [text, setText] = useState('');
  const [due, setDue] = useState(today());
  const add = useAction(() => api('/reminders', { method: 'POST', body: { text, due_date: due || null } }), {
    success: 'Recordatorio guardado',
    onSuccess: () => setText(''),
  });
  const done = useAction((v: { id: number; done: boolean }) => api(`/reminders/${v.id}`, { method: 'PATCH', body: { done: v.done } }));
  const del = useAction((id: number) => api(`/reminders/${id}`, { method: 'DELETE' }));

  if (res.isLoading) return <Loading />;
  if (res.error) return <ErrorBox error={res.error} retry={res.refetch} />;
  const groups = [
    { key: 'urgent', title: 'Urgente' },
    { key: 'warning', title: 'Atención' },
    { key: 'info', title: 'Para tener en cuenta' },
  ] as const;
  const list = res.data ?? [];
  return (
    <div className="space-y-6">
      <PageHeader title="Recordatorios" back="/mas" subtitle="Se generan solos a partir de pedidos, stock, cobros y clientes." />
      {!list.length && <Empty icon={CircleCheck} title="Todo en orden" text="No hay avisos pendientes." />}
      {groups.map((g) => {
        const items = list.filter((r) => r.severity === g.key);
        if (!items.length) return null;
        return (
          <Section key={g.key} title={`${g.title} (${items.length})`}>
            <Card className="divide-y divide-cream-200 overflow-hidden">
              {items.map((r) => (
                <ReminderRow key={r.id} r={r} onDone={r.manual_id ? () => done.mutate({ id: r.manual_id!, done: true }) : undefined} />
              ))}
            </Card>
          </Section>
        );
      })}

      <Section title="Mis recordatorios">
        <Card className="p-4 space-y-3">
          <form
            className="grid gap-2 sm:grid-cols-[1fr_11rem_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) add.mutate();
            }}
          >
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej. Llamar al proveedor de cajas" />
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <Button type="submit" icon={<Plus size={18} />} disabled={!text.trim()} loading={add.isPending}>
              Añadir
            </Button>
          </form>
          {manual.data && manual.data.length > 0 && (
            <div className="divide-y divide-cream-200">
              {manual.data.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-2">
                  <button
                    type="button"
                    aria-label={m.done ? 'Desmarcar' : 'Marcar como hecho'}
                    onClick={() => done.mutate({ id: m.id, done: !m.done })}
                    className={cx('h-6 w-6 rounded-md border-[1.5px] flex items-center justify-center shrink-0', m.done ? 'bg-choco-900 border-choco-900 text-white' : 'border-cream-300')}
                  >
                    {!!m.done && <Check size={14} strokeWidth={2.5} />}
                  </button>
                  <span className={cx('flex-1', m.done && 'line-through text-choco-400')}>
                    {m.text}
                    {m.due_date && <span className="block text-xs text-choco-500">{relDay(m.due_date)}</span>}
                  </span>
                  <button type="button" aria-label="Borrar" className="p-2 text-choco-400 hover:text-red-600" onClick={() => del.mutate(m.id)}>
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Section>
    </div>
  );
}
