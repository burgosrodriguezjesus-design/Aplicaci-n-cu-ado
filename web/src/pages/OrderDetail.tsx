import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Printer,
  Store,
  Trash2,
  TriangleAlert,
  Truck,
  Undo2,
  X,
} from 'lucide-react';
import {
  ALLERGEN_LABELS,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  STAGE_EMOJI,
  STAGE_LABELS,
  STATUS_LABELS,
  STATUS_RANK,
  type Allergen,
  type OrderStatus,
  type PaymentMethod,
} from '@shared/constants';
import { api, useAction, useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { mapsLink, telLink, waLink } from '../lib/contact';
import { dateLong, money, num, qty, relDay, today } from '../lib/format';
import type { Order } from '../lib/types';
import { PhotoViewer } from '../components/PhotoPicker';
import { imageUrl } from '../lib/image';
import {
  Badge,
  Button,
  Card,
  Chip,
  Collapsible,
  cx,
  ErrorBox,
  Field,
  Input,
  Loading,
  NumberInput,
  PageHeader,
  Section,
  Segmented,
  Sheet,
  STATUS_STYLE,
  StatusBadge,
  Thumb,
  useConfirm,
} from '../components/ui';

const FLOW: OrderStatus[] = ['nuevo', 'confirmado', 'pendiente', 'en_preparacion', 'terminado', 'entregado'];

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  nuevo: { to: 'confirmado', label: 'Confirmar pedido' },
  confirmado: { to: 'en_preparacion', label: 'Empezar a preparar' },
  pendiente: { to: 'en_preparacion', label: 'Empezar a preparar' },
  en_preparacion: { to: 'terminado', label: 'Marcar como terminado' },
  terminado: { to: 'entregado', label: 'Entregar' },
  cancelado: { to: 'nuevo', label: 'Reactivar pedido' },
};

export function orderMessage(o: Order, business: string) {
  const lines = o.items.map((l) => {
    const det = [l.size_name, l.flavor && `sabor ${l.flavor}`, l.filling && `relleno ${l.filling}`, l.coverage && `cobertura ${l.coverage}`]
      .filter(Boolean)
      .join(', ');
    return `• ${num(l.quantity)} × ${l.product_name}${det ? ` (${det})` : ''}${l.custom_text ? `\n   Texto: «${l.custom_text}»` : ''}`;
  });
  const when = `${dateLong(o.delivery_date)}${o.delivery_time ? ` a las ${o.delivery_time}` : ''}`;
  const where = o.delivery_type === 'delivery' ? `Entrega a domicilio${o.delivery_address ? ` en ${o.delivery_address}` : ''}` : 'Recogida en tienda';
  return [
    `¡Hola, ${o.customer_name.split(' ')[0]}! 🧁`,
    `Te confirmamos tu pedido #${o.number} en ${business}:`,
    '',
    ...lines,
    '',
    `📅 ${when.charAt(0).toUpperCase() + when.slice(1)}`,
    `📍 ${where}`,
    `💶 Total: ${money(o.total)}${o.paid > 0 ? ` · Pagado: ${money(o.paid)} · Pendiente: ${money(o.pending)}` : ''}`,
    '',
    '¡Muchas gracias!',
  ].join('\n');
}

export function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const { permissions, businessName } = useAuth();
  const q = useApi<Order>(`/orders/${id}`);
  const [paySheet, setPaySheet] = useState(false);
  const [deliverSheet, setDeliverSheet] = useState(false);
  const [photo, setPhoto] = useState<number | null>(null);

  const setStatus = useAction((status: OrderStatus) => api(`/orders/${id}/status`, { method: 'PATCH', body: { status } }), {
    success: (r: Order) => `Pedido ${STATUS_LABELS[r.status].toLowerCase()}`,
  });
  const toggleTask = useAction((v: { id: number; done: boolean }) => api(`/production/tasks/${v.id}`, { method: 'PATCH', body: { done: v.done } }));
  const duplicate = useAction(() => api(`/orders/${id}/duplicate`, { method: 'POST', body: {} }), {
    success: 'Pedido copiado: revisa la fecha',
    onSuccess: (r: { id: number }) => nav(`/pedidos/${r.id}/editar`),
  });
  const remove = useAction(() => api(`/orders/${id}`, { method: 'DELETE' }), { success: 'Pedido borrado', onSuccess: () => nav('/pedidos', { replace: true }) });
  const delPayment = useAction((pid: number) => api(`/payments/${pid}`, { method: 'DELETE' }), { success: 'Cobro eliminado' });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} retry={q.refetch} />;
  const o = q.data;
  const next = NEXT[o.status];
  const late = o.delivery_date < today() && !['entregado', 'cancelado'].includes(o.status);

  const changeStatus = async (to: OrderStatus) => {
    if (to === o.status) return;
    if (to === 'entregado' && o.pending > 0.005) {
      setDeliverSheet(true);
      return;
    }
    if (to === 'cancelado') {
      const ok = await confirm({
        title: '¿Cancelar este pedido?',
        text: o.paid > 0 ? `Ya ha pagado ${money(o.paid)}. Si le devuelves el dinero, regístralo como devolución en los cobros.` : 'Desaparecerá del calendario y de producción.',
        ok: 'Sí, cancelar',
        danger: true,
      });
      if (!ok) return;
    } else if (o.stock_consumed_at && STATUS_RANK[to] >= 0 && STATUS_RANK[to] < STATUS_RANK.en_preparacion) {
      const ok = await confirm({
        title: `¿Volver a «${STATUS_LABELS[to]}»?`,
        text: 'Los ingredientes que se descontaron volverán al inventario y se desmarcarán las tareas.',
        ok: 'Sí, volver',
      });
      if (!ok) return;
    }
    setStatus.mutate(to);
  };

  const prodTasks = o.tasks.filter((t) => t.stage !== 'entregar');
  const deliverTask = o.tasks.find((t) => t.stage === 'entregar');

  return (
    <div className="space-y-5">
      <PageHeader
        back
        title={
          <span>
            Pedido <span className="text-berry-600">#{o.number}</span>
          </span>
        }
        subtitle={`Hecho el ${relDay(o.order_date).toLowerCase()}${o.quote ? ` · desde el presupuesto #${o.quote.number}` : ''}`}
        actions={
          <Link to={`/pedidos/${o.id}/editar`}>
            <Button variant="outline" size="sm" icon={<Pencil size={16} />}>
              Editar
            </Button>
          </Link>
        }
      />

      {/* Estado */}
      <Card className={cx('p-4 border-l-[6px]', STATUS_STYLE[o.status].bar)}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <StatusBadge status={o.status} long className="text-sm" />
          {late && <Badge tone="red">⚠️ Atrasado</Badge>}
        </div>
        <div className="scroll-x -mx-1 px-1 no-print">
          {FLOW.map((s, i) => {
            const done = o.status !== 'cancelado' && STATUS_RANK[o.status] >= i;
            return (
              <button
                key={s}
                type="button"
                onClick={() => changeStatus(s)}
                className={cx(
                  'shrink-0 flex items-center gap-1.5 rounded-full px-3 h-9 text-xs font-extrabold border transition',
                  o.status === s ? cx(STATUS_STYLE[s].badge, 'ring-2 border-transparent') : done ? 'bg-cream-200 border-cream-200 text-choco-700' : 'bg-white border-cream-300 text-choco-400',
                )}
              >
                {done && o.status !== s ? <Check size={13} /> : <span className={cx('h-2 w-2 rounded-full', STATUS_STYLE[s].dot)} />}
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2 no-print">
          {next && (
            <Button size="lg" className="flex-1" variant={next.to === 'entregado' ? 'success' : 'primary'} loading={setStatus.isPending} onClick={() => changeStatus(next.to)}>
              {next.label}
            </Button>
          )}
          {o.status !== 'cancelado' && o.status !== 'entregado' && (
            <Button size="lg" variant="ghost" onClick={() => changeStatus('cancelado')} icon={<X size={18} />}>
              Cancelar
            </Button>
          )}
        </div>
      </Card>

      {o.allergen_warnings.length > 0 && (
        <div className="rounded-2xl bg-red-600 text-white p-4 font-bold flex gap-3">
          <TriangleAlert className="shrink-0" />
          <div>
            {o.allergen_warnings.map((w) => (
              <div key={w}>¡Cuidado! {w}.</div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Entrega */}
        <Card className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-2xl bg-berry-50 text-berry-600 flex items-center justify-center shrink-0">
              <CalendarDays />
            </div>
            <div>
              <div className={cx('text-xl font-extrabold first-letter:uppercase', late && 'text-red-600')}>
                {relDay(o.delivery_date)} {o.delivery_time ? `· ${o.delivery_time}` : ''}
              </div>
              <div className="text-choco-500 first-letter:uppercase">{dateLong(o.delivery_date)}</div>
              <div className="text-sm text-choco-500 mt-1">Se prepara: {relDay(o.production_day).toLowerCase()}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 font-bold">
            {o.delivery_type === 'delivery' ? <Truck size={20} /> : <Store size={20} />}
            {o.delivery_type === 'delivery' ? 'Entrega a domicilio' : 'Recoge en tienda'}
            {o.delivery_fee > 0 && <span className="text-choco-500 font-semibold">({money(o.delivery_fee)})</span>}
          </div>
          {o.delivery_type === 'delivery' && o.delivery_address && (
            <a href={mapsLink(o.delivery_address)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-berry-600 font-semibold">
              <MapPin size={18} /> {o.delivery_address}
            </a>
          )}
        </Card>

        {/* Cliente */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-berry-100 text-berry-700 text-xl font-extrabold flex items-center justify-center shrink-0">
              {o.customer_name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              {o.customer_id ? (
                <Link to={`/clientes/${o.customer_id}`} className="text-xl font-extrabold hover:underline">
                  {o.customer_name}
                </Link>
              ) : (
                <div className="text-xl font-extrabold">{o.customer_name}</div>
              )}
              <div className="text-choco-500">{o.customer_phone || 'Sin teléfono'}</div>
            </div>
          </div>
          {o.customer_phone && (
            <div className="grid grid-cols-2 gap-2 no-print">
              <a href={telLink(o.customer_phone)}>
                <Button variant="secondary" block icon={<Phone size={18} />}>
                  Llamar
                </Button>
              </a>
              <a href={waLink(o.customer_phone, orderMessage(o, businessName))} target="_blank" rel="noreferrer">
                <Button variant="secondary" block icon={<MessageCircle size={18} />} className="text-emerald-700">
                  WhatsApp
                </Button>
              </a>
            </div>
          )}
        </Card>
      </div>

      {/* Productos */}
      <Section title="Productos">
        <div className="space-y-3">
          {o.items.map((l) => (
            <Card key={l.id} className="p-4">
              <div className="flex gap-3">
                <Thumb photoId={l.product_photo_id} emoji="🎂" className="h-16 w-16 shrink-0 text-sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-lg font-extrabold leading-tight">
                      {num(l.quantity)} × {l.product_name}
                    </div>
                    <div className="font-extrabold tabular-nums">{money(l.line_total ?? 0)}</div>
                  </div>
                  {l.size_name && <div className="text-choco-700 font-semibold">{l.size_name}</div>}
                  {l.servings && <div className="text-sm text-choco-500">{num(l.servings)} raciones/personas{l.quantity > 1 ? ' cada una' : ''}</div>}
                </div>
              </div>
              <dl className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2 text-[15px]">
                <Detail label="Sabor" value={l.flavor} />
                <Detail label="Relleno" value={l.filling} />
                <Detail label="Cobertura" value={l.coverage} />
                <Detail label="Decoración" value={l.decoration} />
                {l.extras.length > 0 && <Detail label="Extras" value={l.extras.map((e) => `${e.name} (+${money(e.price)})`).join(', ')} />}
                <Detail label="Notas" value={l.notes} />
              </dl>
              {l.custom_text && (
                <div className="mt-3 rounded-xl bg-caramel-100 border border-caramel-500/30 px-3 py-2">
                  <div className="text-xs font-extrabold uppercase text-caramel-700">Texto en la tarta</div>
                  <div className="text-lg font-extrabold">«{l.custom_text}»</div>
                </div>
              )}
              {l.contains && l.contains.length > 0 && (
                <div className="mt-2 text-xs text-choco-500">Contiene: {l.contains.map((a) => ALLERGEN_LABELS[a as Allergen] ?? a).join(', ').toLowerCase()}</div>
              )}
            </Card>
          ))}
        </div>
      </Section>

      {(o.allergens.length > 0 || o.notes) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {o.allergens.length > 0 && (
            <Card className="p-4 border-red-200 bg-red-50">
              <div className="font-extrabold text-red-700 flex items-center gap-2 mb-2">
                <TriangleAlert size={20} /> No puede llevar
              </div>
              <div className="flex flex-wrap gap-2">
                {o.allergens.map((a) => (
                  <span key={a} className="rounded-full bg-red-600 text-white px-3 py-1 font-bold text-sm">
                    {ALLERGEN_LABELS[a as Allergen] ?? a}
                  </span>
                ))}
              </div>
            </Card>
          )}
          {o.notes && (
            <Card className="p-4">
              <div className="section-title mb-1">Notas</div>
              <p className="whitespace-pre-line">{o.notes}</p>
            </Card>
          )}
        </div>
      )}

      {o.images.length > 0 && (
        <Section title="Fotos de referencia">
          <div className="flex flex-wrap gap-2.5">
            {o.images.map((img) => (
              <button key={img} type="button" onClick={() => setPhoto(img)}>
                <img src={imageUrl(img)} alt="Foto de referencia" className="h-32 w-32 rounded-2xl object-cover border border-cream-300" />
              </button>
            ))}
          </div>
        </Section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Pagos */}
        <Section title="Pagos">
          <Card className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <MoneyBox label="Total" value={o.total} />
              <MoneyBox label="Pagado" value={o.paid} tone="green" />
              <MoneyBox label="Pendiente" value={o.pending} tone={o.pending > 0.005 ? 'amber' : 'green'} />
            </div>
            {(o.discount > 0 || o.delivery_fee > 0) && (
              <div className="text-sm text-choco-500">
                {o.delivery_fee > 0 && `Incluye envío de ${money(o.delivery_fee)}. `}
                {o.discount > 0 && `Descuento aplicado: ${money(o.discount)}.`}
              </div>
            )}
            {o.payments.length > 0 && (
              <div className="divide-y divide-cream-200 border-y border-cream-200">
                {o.payments.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 py-2 text-[15px]">
                    <span className="flex-1">
                      <b>{PAYMENT_KIND_LABELS[p.kind]}</b> · {PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method}
                      <span className="block text-xs text-choco-500">{relDay(p.paid_at.slice(0, 10))} {p.paid_at.slice(11, 16)}</span>
                    </span>
                    <span className={cx('font-extrabold tabular-nums', p.kind === 'refund' && 'text-red-600')}>
                      {p.kind === 'refund' ? '−' : ''}
                      {money(p.amount)}
                    </span>
                    <button
                      type="button"
                      aria-label="Borrar cobro"
                      className="p-2 text-choco-400 hover:text-red-600 no-print"
                      onClick={async () => (await confirm({ title: '¿Borrar este cobro?', danger: true, ok: 'Borrar' })) && delPayment.mutate(p.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {o.payment_method && <div className="text-sm text-choco-500">Forma de pago acordada: {PAYMENT_METHOD_LABELS[o.payment_method as PaymentMethod] ?? o.payment_method}</div>}
            <Button variant="secondary" block onClick={() => setPaySheet(true)} className="no-print">
              Registrar cobro o señal
            </Button>
            {o.estimated_cost !== null && o.estimated_cost > 0 && (
              <div className="text-sm text-choco-500 border-t border-cream-200 pt-2">
                Coste estimado de producción: <b>{money(o.estimated_cost)}</b> · Beneficio: <b className="text-emerald-700">{money(o.total - o.estimated_cost)}</b>
              </div>
            )}
          </Card>
        </Section>

        {/* Producción */}
        <Section title="Producción">
          <Card className="p-2">
            {o.tasks.length === 0 ? (
              <p className="p-3 text-choco-500">
                {o.status === 'nuevo' ? 'Las tareas aparecerán al confirmar el pedido.' : 'Sin tareas.'}
              </p>
            ) : (
              <ul>
                {[...prodTasks, ...(deliverTask ? [deliverTask] : [])].map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={o.status === 'cancelado'}
                      onClick={() => {
                        if (t.stage === 'entregar' && !t.done && o.pending > 0.005) setDeliverSheet(true);
                        else toggleTask.mutate({ id: t.id, done: !t.done });
                      }}
                      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-cream-100 text-left"
                    >
                      <span className={cx('h-8 w-8 rounded-lg border-2 flex items-center justify-center shrink-0 transition', t.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-cream-300 bg-white')}>
                        {!!t.done && <Check size={18} strokeWidth={3} />}
                      </span>
                      <span className="text-xl">{STAGE_EMOJI[t.stage]}</span>
                      <span className="flex-1">
                        <span className={cx(t.done && 'line-through text-choco-400')}>
                          <b>{STAGE_LABELS[t.stage]}</b> {t.stage !== 'entregar' && `· ${t.title}`}
                        </span>
                        {t.done_by_name && <span className="block text-xs text-choco-400">Hecho por {t.done_by_name}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      </div>

      {o.requirements.length > 0 && (
        <Collapsible
          title="Ingredientes y materiales necesarios"
          right={
            o.stock_consumed_at ? (
              <Badge tone="green">Descontado del inventario</Badge>
            ) : o.requirements.some((r) => r.missing > 0) ? (
              <Badge tone="red">Falta stock</Badge>
            ) : null
          }
        >
          <div className="divide-y divide-cream-200">
            {o.requirements.map((r) => (
              <Link key={r.item_id} to={`/inventario/${r.item_id}`} className="flex items-center gap-2 py-2">
                <span className="flex-1">{r.name}</span>
                <span className="font-bold tabular-nums">{qty(r.needed, r.unit)}</span>
                {!o.stock_consumed_at &&
                  (r.missing > 0 ? <Badge tone="red">Faltan {qty(r.missing, r.unit)}</Badge> : <Badge tone="green">OK</Badge>)}
                <ChevronRight size={16} className="text-choco-300" />
              </Link>
            ))}
          </div>
        </Collapsible>
      )}

      <div className="flex flex-wrap gap-2 no-print">
        <Button variant="outline" icon={<Copy size={18} />} onClick={() => duplicate.mutate()} loading={duplicate.isPending}>
          Repetir pedido
        </Button>
        <Button variant="outline" icon={<Printer size={18} />} onClick={() => window.print()}>
          Imprimir
        </Button>
        {o.status === 'entregado' && (
          <Button variant="outline" icon={<Undo2 size={18} />} onClick={() => changeStatus('terminado')}>
            Deshacer entrega
          </Button>
        )}
        {permissions.delete && (
          <Button
            variant="danger"
            icon={<Trash2 size={18} />}
            onClick={async () =>
              (await confirm({ title: `¿Borrar el pedido #${o.number}?`, text: 'Se borrarán también sus cobros. Esta acción no se puede deshacer.', ok: 'Borrar', danger: true })) &&
              remove.mutate()
            }
          >
            Borrar
          </Button>
        )}
      </div>

      <PaymentSheet open={paySheet} onClose={() => setPaySheet(false)} order={o} />
      <DeliverSheet open={deliverSheet} onClose={() => setDeliverSheet(false)} order={o} />
      {photo && <PhotoViewer id={photo} onClose={() => setPhoto(null)} />}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="text-choco-500 shrink-0">{label}:</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function MoneyBox({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' }) {
  return (
    <div className={cx('rounded-xl py-2', tone === 'amber' ? 'bg-amber-50' : tone === 'green' ? 'bg-emerald-50' : 'bg-cream-100')}>
      <div className="text-xs font-bold text-choco-500">{label}</div>
      <div className={cx('text-lg font-extrabold tabular-nums', tone === 'amber' && 'text-amber-700', tone === 'green' && 'text-emerald-700')}>{money(value)}</div>
    </div>
  );
}

export function PaymentSheet({ open, onClose, order }: { open: boolean; onClose: () => void; order: Order }) {
  const [kind, setKind] = useState<'payment' | 'deposit' | 'refund'>('payment');
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<string>(order.payment_method ?? 'efectivo');
  const [date, setDate] = useState(today());
  const add = useAction((amt: number) => api(`/orders/${order.id}/payments`, { method: 'POST', body: { kind, amount: amt, method, paid_at: date === today() ? undefined : date } }), {
    success: 'Cobro registrado',
    onSuccess: () => {
      setAmount(null);
      onClose();
    },
  });
  const value = amount ?? (kind === 'refund' ? null : order.pending || null);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Registrar pago"
      footer={
        <Button block size="lg" disabled={!value} loading={add.isPending} onClick={() => value && add.mutate(value)}>
          Guardar {value ? money(value) : ''}
        </Button>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'payment', label: 'Cobro' },
            { value: 'deposit', label: 'Señal' },
            { value: 'refund', label: 'Devolución' },
          ]}
        />
        <Field label="Importe" hint={order.pending > 0 ? `Pendiente: ${money(order.pending)}` : undefined}>
          <NumberInput value={value} onChange={setAmount} suffix="€" autoFocus />
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
        <Field label="Fecha">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

/** Al entregar con dinero pendiente se ofrece cobrarlo a la vez. */
function DeliverSheet({ open, onClose, order }: { open: boolean; onClose: () => void; order: Order }) {
  const [method, setMethod] = useState<string>(order.payment_method ?? 'efectivo');
  const deliver = useAction(
    async (collect: boolean) => {
      if (collect) await api(`/orders/${order.id}/payments`, { method: 'POST', body: { kind: 'payment', amount: order.pending, method } });
      return api(`/orders/${order.id}/status`, { method: 'PATCH', body: { status: 'entregado' } });
    },
    { success: '¡Pedido entregado! Registrado como venta 🎉', onSuccess: onClose },
  );
  return (
    <Sheet open={open} onClose={onClose} title="Entregar pedido">
      <div className="space-y-4">
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-center">
          <div className="text-choco-700 font-semibold">Queda por cobrar</div>
          <div className="text-3xl font-extrabold text-amber-700">{money(order.pending)}</div>
        </div>
        <div>
          <span className="label">¿Cómo paga?</span>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
              <Chip key={m} active={method === m} onClick={() => setMethod(m)}>
                {PAYMENT_METHOD_LABELS[m]}
              </Chip>
            ))}
          </div>
        </div>
        <Button block size="lg" variant="success" loading={deliver.isPending} onClick={() => deliver.mutate(true)}>
          Cobrar {money(order.pending)} y entregar
        </Button>
        <Button block variant="ghost" disabled={deliver.isPending} onClick={() => deliver.mutate(false)}>
          Entregar sin cobrar (queda pendiente)
        </Button>
      </div>
    </Sheet>
  );
}
