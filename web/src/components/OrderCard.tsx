import { Link } from 'react-router';
import { Clock, MapPin, Store, Truck, TriangleAlert } from 'lucide-react';
import { ALLERGEN_LABELS, type Allergen } from '@shared/constants';
import type { OrderSummary } from '../lib/types';
import { money, relDay, today } from '../lib/format';
import { Badge, cx, StatusBadge, STATUS_STYLE, Thumb } from './ui';

export function OrderCard({ o, showDate = true, compact }: { o: OrderSummary; showDate?: boolean; compact?: boolean }) {
  const late = o.delivery_date < today() && !['entregado', 'cancelado'].includes(o.status);
  return (
    <Link
      to={`/pedidos/${o.id}`}
      className={cx(
        'card flex gap-3 p-3 border-l-[6px] hover:border-cream-300 active:scale-[0.995] transition',
        STATUS_STYLE[o.status].bar,
        o.status === 'cancelado' && 'opacity-60',
      )}
    >
      {!compact && o.image_id && <Thumb photoId={o.image_id} className="h-16 w-16 shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-choco-900 truncate">
              {o.customer_name} <span className="text-choco-400 font-bold text-sm">#{o.number}</span>
            </div>
            <div className="text-sm text-choco-700 line-clamp-2">{o.summary || '—'}</div>
          </div>
          <StatusBadge status={o.status} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-choco-500">
          <span className={cx('inline-flex items-center gap-1 font-bold', late ? 'text-red-600' : 'text-choco-700')}>
            <Clock size={15} />
            {showDate && `${relDay(o.delivery_date)} `}
            {o.delivery_time ?? 'sin hora'}
          </span>
          <span className="inline-flex items-center gap-1">
            {o.delivery_type === 'delivery' ? <Truck size={15} /> : <Store size={15} />}
            {o.delivery_type === 'delivery' ? 'A domicilio' : 'Recogida'}
          </span>
          {o.pending > 0.005 && o.status !== 'cancelado' && <Badge tone="amber">Debe {money(o.pending)}</Badge>}
          {o.allergens.length > 0 && (
            <Badge tone="red">
              <TriangleAlert size={12} /> {o.allergens.map((a) => ALLERGEN_LABELS[a as Allergen] ?? a).join(', ')}
            </Badge>
          )}
          {!compact && o.delivery_type === 'delivery' && o.delivery_address && (
            <span className="inline-flex items-center gap-1 truncate max-w-full">
              <MapPin size={14} /> {o.delivery_address}
            </span>
          )}
        </div>
        {o.tasks_total > 0 && !['entregado', 'cancelado'].includes(o.status) && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-cream-200 overflow-hidden">
              <div className="h-full bg-berry-500 rounded-full" style={{ width: `${(o.tasks_done / o.tasks_total) * 100}%` }} />
            </div>
            <span className="text-xs font-bold text-choco-500">
              {o.tasks_done}/{o.tasks_total}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
