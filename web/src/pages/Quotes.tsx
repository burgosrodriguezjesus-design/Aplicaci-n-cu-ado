import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowRight, Check, MessageCircle, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, QUOTE_STATUS_LABELS } from '@shared/constants';
import { api, useAction, useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { waLink } from '../lib/contact';
import { dateLong, dateNumeric, money, num, relDay } from '../lib/format';
import type { OrderLine } from '../lib/types';
import { Badge, Button, Card, Chip, cx, Empty, ErrorBox, Fab, Field, Input, Loading, NumberInput, PageHeader, Sheet, useConfirm } from '../components/ui';

type QStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

interface QuoteSummary {
  id: number;
  number: number;
  customer_name: string;
  date: string;
  valid_until: string;
  delivery_date: string | null;
  total: number;
  status: QStatus;
  summary: string | null;
  order_id: number | null;
  order_number: number | null;
}

interface Quote extends QuoteSummary {
  customer_id: number | null;
  customer_phone: string | null;
  delivery_time: string | null;
  delivery_type: 'pickup' | 'delivery';
  delivery_address: string | null;
  delivery_fee: number;
  discount: number;
  notes: string | null;
  allergens: string[];
  items: OrderLine[];
  subtotal: number;
}

const TONE: Record<QStatus, 'amber' | 'green' | 'red' | 'neutral'> = { pending: 'amber', accepted: 'green', rejected: 'red', expired: 'neutral' };

export function Quotes() {
  const [filter, setFilter] = useState<'all' | QStatus>('pending');
  const res = useApi<QuoteSummary[]>('/quotes');
  const list = (res.data ?? []).filter((q) => filter === 'all' || q.status === filter);
  return (
    <div>
      <PageHeader
        title="Presupuestos"
        back="/mas"
        actions={
          <Link to="/presupuestos/nuevo" className="hidden lg:block">
            <Button icon={<Plus size={18} />}>Nuevo presupuesto</Button>
          </Link>
        }
      />
      <div className="scroll-x -mx-4 px-4 mb-4">
        {(['pending', 'accepted', 'rejected', 'expired', 'all'] as const).map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)}>
            {s === 'all' ? 'Todos' : QUOTE_STATUS_LABELS[s]}
          </Chip>
        ))}
      </div>
      {res.isLoading ? (
        <Loading />
      ) : res.error ? (
        <ErrorBox error={res.error} retry={res.refetch} />
      ) : !list.length ? (
        <Empty
          icon="📝"
          title="No hay presupuestos"
          text="Prepara un presupuesto en un momento y, si lo aceptan, conviértelo en pedido con un botón."
          action={
            <Link to="/presupuestos/nuevo">
              <Button icon={<Plus size={18} />}>Nuevo presupuesto</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {list.map((q) => (
            <Link key={q.id} to={`/presupuestos/${q.id}`} className="card flex items-center gap-3 p-4 active:scale-[0.99] transition">
              <div className="flex-1 min-w-0">
                <div className="font-extrabold truncate">
                  {q.customer_name} <span className="text-choco-400 text-sm">#{q.number}</span>
                </div>
                <div className="text-sm text-choco-700 truncate">{q.summary}</div>
                <div className="text-xs text-choco-500 mt-0.5">
                  {relDay(q.date)} · válido hasta {dateNumeric(q.valid_until)}
                  {q.order_number && ` · pedido #${q.order_number}`}
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="font-extrabold tabular-nums">{money(q.total)}</div>
                <Badge tone={TONE[q.status]}>{QUOTE_STATUS_LABELS[q.status]}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Fab to="/presupuestos/nuevo" label="Nuevo presupuesto" />
    </div>
  );
}

function quoteText(q: Quote, business: string) {
  const lines = q.items.map((l) => {
    const det = [l.size_name, l.servings && `${num(l.servings)} raciones`, l.flavor, l.filling && `relleno ${l.filling}`, l.coverage && `cobertura ${l.coverage}`]
      .filter(Boolean)
      .join(', ');
    const ex = l.extras.length ? ` + ${l.extras.map((e) => e.name).join(', ')}` : '';
    return `• ${num(l.quantity)} × ${l.product_name}${det ? ` (${det})` : ''}${ex}: ${money(l.line_total ?? 0)}`;
  });
  return [
    `¡Hola, ${q.customer_name.split(' ')[0]}! 😊 Te paso el presupuesto #${q.number} de ${business}:`,
    '',
    ...lines,
    q.delivery_fee > 0 ? `• Envío: ${money(q.delivery_fee)}` : '',
    q.discount > 0 ? `• Descuento: −${money(q.discount)}` : '',
    '',
    `💶 Total: ${money(q.total)}`,
    q.delivery_date ? `📅 Para el ${dateLong(q.delivery_date)}${q.delivery_time ? ` a las ${q.delivery_time}` : ''}` : '',
    `⏳ Válido hasta el ${dateLong(q.valid_until)}.`,
    '',
    '¿Te lo confirmo? ¡Gracias!',
  ]
    .filter((x, i, arr) => x !== '' || (arr[i - 1] !== '' && i > 0))
    .join('\n');
}

export function QuoteDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const { businessName, settings, permissions } = useAuth();
  const res = useApi<Quote>(`/quotes/${id}`);
  const [convert, setConvert] = useState(false);
  const setStatus = useAction((status: string) => api(`/quotes/${id}/status`, { method: 'PATCH', body: { status } }), { success: 'Presupuesto actualizado' });
  const remove = useAction(() => api(`/quotes/${id}`, { method: 'DELETE' }), { success: 'Presupuesto borrado', onSuccess: () => nav('/presupuestos', { replace: true }) });
  if (res.isLoading) return <Loading />;
  if (res.error || !res.data) return <ErrorBox error={res.error} />;
  const q = res.data;
  const closed = !!q.order_id;
  return (
    <div className="space-y-5">
      <PageHeader
        back="/presupuestos"
        title={
          <span>
            Presupuesto <span className="text-berry-600">#{q.number}</span>
          </span>
        }
        subtitle={`${q.customer_name} · ${relDay(q.date)}`}
        actions={
          !closed && (
            <Link to={`/presupuestos/${q.id}/editar`}>
              <Button variant="outline" size="sm" icon={<Pencil size={16} />}>
                Editar
              </Button>
            </Link>
          )
        }
      />
      <div className="flex items-center gap-2">
        <Badge tone={TONE[q.status]} className="text-sm py-1 px-3">
          {QUOTE_STATUS_LABELS[q.status]}
        </Badge>
        <span className="text-sm text-choco-500">Válido hasta el {dateLong(q.valid_until)}</span>
      </div>

      {closed ? (
        <Link to={`/pedidos/${q.order_id}`}>
          <Button block size="lg" variant="success" icon={<ArrowRight size={20} />}>
            Ver pedido #{q.order_number}
          </Button>
        </Link>
      ) : (
        <div className="space-y-2 no-print">
          <Button block size="lg" icon={<Check size={22} />} onClick={() => setConvert(true)}>
            Aceptado: convertir en pedido
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <a href={waLink(q.customer_phone, quoteText(q, businessName))} target="_blank" rel="noreferrer">
              <Button block variant="secondary" icon={<MessageCircle size={18} />} className="text-emerald-700">
                Enviar por WhatsApp
              </Button>
            </a>
            <Button variant="secondary" icon={<Printer size={18} />} onClick={() => window.print()}>
              Imprimir / PDF
            </Button>
          </div>
          {q.status !== 'rejected' ? (
            <Button block variant="ghost" icon={<X size={18} />} onClick={() => setStatus.mutate('rejected')}>
              Marcar como rechazado
            </Button>
          ) : (
            <Button block variant="ghost" onClick={() => setStatus.mutate('pending')}>
              Volver a pendiente
            </Button>
          )}
        </div>
      )}

      {/* Documento (también para imprimir) */}
      <Card className="p-5 space-y-4">
        <div className="flex justify-between gap-4">
          <div>
            <div className="text-xl font-extrabold">{businessName}</div>
            {settings.business_phone && <div className="text-sm text-choco-500">{settings.business_phone}</div>}
            {settings.business_address && <div className="text-sm text-choco-500">{settings.business_address}</div>}
          </div>
          <div className="text-right text-sm">
            <div className="font-extrabold text-lg">PRESUPUESTO #{q.number}</div>
            <div>Fecha: {dateNumeric(q.date)}</div>
            <div>Válido hasta: {dateNumeric(q.valid_until)}</div>
          </div>
        </div>
        <div className="text-[15px]">
          <b>Cliente:</b> {q.customer_name} {q.customer_phone && `· ${q.customer_phone}`}
          {q.delivery_date && (
            <div>
              <b>Entrega:</b> {dateLong(q.delivery_date)} {q.delivery_time ?? ''} · {q.delivery_type === 'delivery' ? `a domicilio${q.delivery_address ? ` (${q.delivery_address})` : ''}` : 'recogida en tienda'}
            </div>
          )}
        </div>
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b-2 border-cream-300 text-left text-choco-500 text-sm">
              <th className="py-2">Producto</th>
              <th className="py-2 text-right w-24">Importe</th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((l) => (
              <tr key={l.id} className="border-b border-cream-200 align-top">
                <td className="py-2">
                  <div className="font-bold">
                    {num(l.quantity)} × {l.product_name} {l.size_name && <span className="font-semibold text-choco-500">({l.size_name})</span>}
                  </div>
                  <div className="text-sm text-choco-500">
                    {[l.servings && `${num(l.servings)} raciones`, l.flavor, l.filling && `Relleno: ${l.filling}`, l.coverage && `Cobertura: ${l.coverage}`, l.decoration && `Decoración: ${l.decoration}`, l.custom_text && `Texto: «${l.custom_text}»`]
                      .filter(Boolean)
                      .join(' · ')}
                    {l.extras.length > 0 && <div>Extras: {l.extras.map((e) => `${e.name} (${money(e.price)})`).join(', ')}</div>}
                  </div>
                </td>
                <td className="py-2 text-right font-bold tabular-nums">{money(l.line_total ?? 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="tabular-nums">
            <tr>
              <td className="pt-2 text-right">Subtotal</td>
              <td className="pt-2 text-right">{money(q.subtotal)}</td>
            </tr>
            {q.delivery_fee > 0 && (
              <tr>
                <td className="text-right">Envío</td>
                <td className="text-right">{money(q.delivery_fee)}</td>
              </tr>
            )}
            {q.discount > 0 && (
              <tr>
                <td className="text-right">Descuento</td>
                <td className="text-right">−{money(q.discount)}</td>
              </tr>
            )}
            <tr className="text-lg font-extrabold">
              <td className="pt-1 text-right">Total (IVA incluido)</td>
              <td className="pt-1 text-right">{money(q.total)}</td>
            </tr>
          </tfoot>
        </table>
        {q.notes && <p className="text-sm whitespace-pre-line border-t border-cream-200 pt-3">{q.notes}</p>}
      </Card>

      {permissions.delete && (
        <Button variant="danger" icon={<Trash2 size={18} />} className="no-print" onClick={async () => (await confirm({ title: '¿Borrar este presupuesto?', ok: 'Borrar', danger: true })) && remove.mutate()}>
          Borrar presupuesto
        </Button>
      )}
      {convert && <ConvertSheet q={q} onClose={() => setConvert(false)} />}
    </div>
  );
}

function ConvertSheet({ q, onClose }: { q: Quote; onClose: () => void }) {
  const nav = useNavigate();
  const [date, setDate] = useState(q.delivery_date ?? '');
  const [time, setTime] = useState(q.delivery_time ?? '');
  const [deposit, setDeposit] = useState<number | null>(null);
  const [method, setMethod] = useState('bizum');
  const run = useAction(
    () =>
      api(`/quotes/${q.id}/convert`, {
        method: 'POST',
        body: { delivery_date: date, delivery_time: time || null, deposit: deposit ? { amount: deposit, method } : null },
      }),
    { success: '¡Pedido creado y confirmado! 🎉', onSuccess: (r: { order_id: number }) => nav(`/pedidos/${r.order_id}`) },
  );
  return (
    <Sheet
      open
      onClose={onClose}
      title="Convertir en pedido"
      footer={
        <Button block size="lg" disabled={!date} loading={run.isPending} onClick={() => run.mutate()}>
          Crear pedido confirmado
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-choco-700">Se creará el pedido con los mismos productos y precios ({money(q.total)}), confirmado y listo para producción.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Día de entrega">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Hora">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Señal recibida (opcional)">
          <NumberInput value={deposit} onChange={setDeposit} suffix="€" />
        </Field>
        {!!deposit && (
          <div className={cx('flex flex-wrap gap-2')}>
            {PAYMENT_METHODS.map((m) => (
              <Chip key={m} active={method === m} onClick={() => setMethod(m)}>
                {PAYMENT_METHOD_LABELS[m]}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
