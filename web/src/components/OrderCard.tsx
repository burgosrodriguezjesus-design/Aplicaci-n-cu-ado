import { Link } from 'react-router';
import { MapPin, Store, Truck, TriangleAlert } from 'lucide-react';
import { ALLERGEN_LABELS, type Allergen, type OrderStatus } from '@shared/constants';
import type { OrderSummary } from '../lib/types';
import { money, relDay, today } from '../lib/format';
import { Badge, cx, StatusBadge, TINTS, type Tint } from './ui';

/** Color del bloque de la hora según el estado del pedido. */
const STATUS_TINT: Record<OrderStatus, Tint> = {
  nuevo: 'sky',
  confirmado: 'plum',
  pendiente: 'caramel',
  en_preparacion: 'caramel',
  terminado: 'sage',
  entregado: 'sage',
  cancelado: 'cocoa',
};

export function OrderCard({ o, showDate = true, compact }: { o: OrderSummary; showDate?: boolean; compact?: boolean }) {
  const late = o.delivery_date < today() && !['entregado', 'cancelado'].includes(o.status);
  const tint: Tint = late ? 'rose' : STATUS_TINT[o.status];
  const progress = o.tasks_total > 0 && !['entregado', 'cancelado'].includes(o.status) ? o.tasks_done / o.tasks_total : null;
  return (
    <Link
      to={`/pedidos/${o.id}`}
      className={cx('card flex min-w-0 gap-3.5 p-3 hover:shadow-[var(--shadow-lift)] hover:-translate-y-px transition group', o.status === 'cancelado' && 'opacity-60')}
    >
      <div className={cx('w-[60px] shrink-0 rounded-xl ring-1 ring-inset flex flex-col items-center justify-center text-center px-1 py-2', TINTS[tint])}>
        {showDate && <span className="text-[9.5px] uppercase tracking-[0.1em] font-semibold leading-tight line-clamp-1">{relDay(o.delivery_date)}</span>}
        <span className={cx('font-display leading-none tabular-nums', showDate ? 'text-[17px] mt-1' : 'text-[19px]', !o.delivery_time && 'text-[15px]')}>
          {o.delivery_time ?? 'S/h'}
        </span>
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-choco-900 truncate">
              {o.customer_name} <span className="text-choco-400 font-normal text-[13px]">#{o.number}</span>
            </div>
            <div className="text-[13.5px] text-choco-700 line-clamp-1 mt-0.5">{o.summary || '—'}</div>
          </div>
          <StatusBadge status={o.status} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-choco-500">
          <span className="inline-flex items-center gap-1">
            {o.delivery_type === 'delivery' ? <Truck size={14} strokeWidth={1.75} /> : <Store size={14} strokeWidth={1.75} />}
            {o.delivery_type === 'delivery' ? 'A domicilio' : 'Recogida'}
          </span>
          {late && <Badge tone="red">Atrasado</Badge>}
          {o.pending > 0.005 && o.status !== 'cancelado' && <Badge tone="amber">Debe {money(o.pending)}</Badge>}
          {o.allergens.length > 0 && (
            <Badge tone="red" className="whitespace-normal">
              <TriangleAlert size={11} className="shrink-0" /> {o.allergens.map((a) => ALLERGEN_LABELS[a as Allergen] ?? a).join(', ')}
            </Badge>
          )}
          {!compact && o.delivery_type === 'delivery' && o.delivery_address && (
            <span className="flex min-w-0 max-w-full items-center gap-1"><span className="contents">
              <MapPin size={13} strokeWidth={1.75} className="shrink-0" /> <span className="truncate">{o.delivery_address}</span></span>
            </span>
          )}
        </div>
        {progress !== null && (
          <div className="mt-2.5 flex w-full min-w-0 items-center gap-2">
            <div className="h-1.5 min-w-0 flex-1 rounded-full bg-cream-200/80 overflow-hidden">
              <div
                className={cx('h-full rounded-full', progress >= 1 ? 'bg-sage-500' : 'bg-gradient-to-r from-berry-500 to-caramel-500')}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-choco-500 tabular-nums">
              {o.tasks_done}/{o.tasks_total}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
