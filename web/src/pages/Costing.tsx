import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BookOpen, ChevronDown, Package, Pencil, Wheat } from 'lucide-react';
import { api, useAction, useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, num, pct } from '../lib/format';
import type { Product } from '../lib/types';
import { Button, Card, Chip, cx, ErrorBox, Field, Loading, NumberInput, PageHeader, Section } from '../components/ui';

interface CostLine {
  type: 'recipe' | 'ingredient' | 'material';
  name: string;
  item_id?: number;
  recipe_id?: number;
  component_id?: number;
  quantity: number;
  unit: string;
  unit_cost?: number;
  cost: number;
  children?: CostLine[];
}

interface Breakdown {
  servings: number;
  price: number;
  ingredients: number;
  materials: number;
  labor: number;
  labor_minutes: number;
  other: number;
  overhead: number;
  total: number;
  profit: number;
  margin: number;
  recommended_price: number;
  cost_per_serving: number;
  lines: CostLine[];
}

// Partes del coste (barra apilada): colores categóricos en orden fijo, validados para daltonismo; siempre con leyenda e importes.
const PARTS = [
  { key: 'ingredients', label: 'Ingredientes', color: '#b4405f' },
  { key: 'materials', label: 'Envases y materiales', color: '#c27a1f' },
  { key: 'labor', label: 'Mano de obra', color: '#7d5ba6' },
  { key: 'other', label: 'Otros costes', color: '#3d8a5c' },
  { key: 'overhead', label: 'Gastos generales', color: '#2f74b5' },
] as const;

export function Costing() {
  const { id } = useParams();
  const { permissions, settings } = useAuth();
  const product = useApi<Product>(`/products/${id}`);
  const [sizeId, setSizeId] = useState<number | null>(null);
  useEffect(() => {
    if (product.data && sizeId === null && product.data.sizes.length) setSizeId(product.data.sizes[0].id);
  }, [product.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const cost = useApi<Breakdown>(product.data ? `/products/${id}/costing${sizeId ? `?size_id=${sizeId}` : ''}` : null, { placeholderData: (p) => p });
  const [price, setPrice] = useState<number | null>(null);
  const [labor, setLabor] = useState<number | null>(null);
  const [other, setOther] = useState<number | null>(null);
  useEffect(() => {
    if (!product.data) return;
    const size = product.data.sizes.find((s) => s.id === sizeId);
    setPrice(size ? size.price : product.data.base_price);
    setLabor(product.data.labor_minutes);
    setOther(product.data.other_costs);
  }, [product.data, sizeId]);

  const savePricing = useAction(
    () => api(`/products/${id}/pricing`, { method: 'PATCH', body: { size_id: sizeId, price: price ?? 0, labor_minutes: labor ?? 0, other_costs: other ?? 0 } }),
    { success: 'Precio y costes guardados' },
  );
  const saveItemCost = useAction((v: { id: number; cost: number }) =>
    api(`/inventory/${v.id}`, { method: 'GET' }).then((it: any) => api(`/inventory/${v.id}`, { method: 'PUT', body: { ...it, cost_per_unit: v.cost } })),
    { success: 'Precio de compra actualizado' },
  );

  if (product.error) return <ErrorBox error={product.error} />;
  if (!product.data || !cost.data) return <Loading />;
  const p = product.data;
  const c = cost.data;
  // Simulación en vivo con lo que se está escribiendo (antes de guardar).
  const rate = settings.labor_cost_per_hour ?? 0;
  const laborNow = labor !== null ? ((labor * c.servings) / (p.servings || 1) / 60) * rate : c.labor;
  const totalNow = c.ingredients + c.materials + c.overhead + laborNow + (other ?? c.other);
  const priceNow = price ?? c.price;
  const profitNow = priceNow - totalNow;
  const marginNow = priceNow > 0 ? profitNow / priceNow : 0;
  const target = (settings.target_margin_percent ?? 60) / 100;
  const recommended = totalNow / (1 - Math.min(target, 0.95));
  const dirty = (p.sizes.find((s) => s.id === sizeId)?.price ?? p.base_price) !== price || p.labor_minutes !== labor || p.other_costs !== other;
  const parts = { ingredients: c.ingredients, materials: c.materials, labor: laborNow, other: other ?? c.other, overhead: c.overhead };

  return (
    <div className="space-y-5 pb-8">
      <PageHeader back={`/catalogo/${p.id}`} title="Escandallo" subtitle={p.name} />
      {p.sizes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {p.sizes.map((s) => (
            <Chip key={s.id} active={sizeId === s.id} onClick={() => setSizeId(s.id)}>
              {s.name}
            </Chip>
          ))}
        </div>
      )}

      <Card className="p-5">
        <div className="grid grid-cols-2 gap-4">
          <Big label="Coste de producción" value={money(totalNow)} />
          <Big label="Precio de venta" value={money(priceNow)} />
          <Big label="Beneficio bruto" value={money(profitNow)} tone={profitNow >= 0 ? 'green' : 'red'} />
          <Big label="Margen" value={pct(marginNow)} tone={marginNow >= target ? 'green' : marginNow >= 0.3 ? 'amber' : 'red'} />
        </div>
        <div className="mt-4 text-sm text-choco-500">
          {num(c.servings)} raciones · coste por ración {money(totalNow / c.servings)} · precio por ración {money(priceNow / c.servings)}
        </div>
        {/* Reparto del coste */}
        <div className="mt-4 space-y-2">
          <div className="flex h-4 rounded-full overflow-hidden gap-[2px] bg-white">
            {PARTS.map((part) => {
              const v = parts[part.key];
              return v > 0 ? <div key={part.key} title={`${part.label}: ${money(v)}`} style={{ width: `${(v / totalNow) * 100}%`, background: part.color }} /> : null;
            })}
          </div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[15px]">
            {PARTS.map((part) => (
              <div key={part.key} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm shrink-0" style={{ background: part.color }} />
                <span className="flex-1 text-choco-700">
                  {part.label}
                  {part.key === 'labor' && ` (${Math.round(((labor ?? p.labor_minutes) * c.servings) / (p.servings || 1))} min)`}
                  {part.key === 'overhead' && settings.overhead_percent !== undefined && ` (${settings.overhead_percent} %)`}
                </span>
                <span className="font-medium tabular-nums">{money(parts[part.key])}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {permissions.catalog && (
        <Card className="p-4 space-y-4">
          <h2 className="font-display text-[19px] text-choco-900">Cambiar precio y costes</h2>
          <div className="grid grid-cols-3 gap-3">
            <Field label={p.sizes.length ? 'Precio de este tamaño' : 'Precio'}>
              <NumberInput value={price} onChange={setPrice} suffix="€" />
            </Field>
            <Field label="Trabajo" hint={`para ${num(p.servings)} rac.`}>
              <NumberInput value={labor} onChange={setLabor} suffix="min" />
            </Field>
            <Field label="Otros costes">
              <NumberInput value={other} onChange={setOther} suffix="€" />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sage-50 ring-1 ring-inset ring-sage-100 p-3">
            <span className="flex-1">
              Para un margen del {Math.round(target * 100)} % deberías cobrar <b className="text-emerald-700">{money(recommended)}</b>
            </span>
            <Button variant="secondary" size="sm" onClick={() => setPrice(Math.ceil(recommended))}>
              Usar {money(Math.ceil(recommended))}
            </Button>
          </div>
          <Button block disabled={!dirty} loading={savePricing.isPending} onClick={() => savePricing.mutate()}>
            Guardar cambios
          </Button>
        </Card>
      )}

      <Section
        title="Detalle de costes"
        action={
          permissions.catalog && (
            <Link to={`/catalogo/${p.id}/editar`} className="text-sm font-medium text-berry-600 inline-flex items-center gap-1">
              <Pencil size={14} /> Cambiar composición
            </Link>
          )
        }
      >
        <Card className="divide-y divide-cream-200">
          {c.lines.map((l, i) => (
            <CostRow key={i} l={l} canEdit={permissions.inventory} onCost={(id, v) => saveItemCost.mutate({ id, cost: v })} />
          ))}
          <div className="flex justify-between px-4 py-3 bg-cream-50 font-medium">
            <span>Ingredientes + materiales</span>
            <span className="tabular-nums">{money(c.ingredients + c.materials)}</span>
          </div>
        </Card>
        <p className="text-sm text-choco-500 px-1">
          Mano de obra a {money(rate)}/hora y gastos generales del {settings.overhead_percent ?? 0} % (se cambian en Configuración). Toca un precio de compra para corregirlo.
        </p>
      </Section>
    </div>
  );
}

function Big({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' | 'amber' }) {
  return (
    <div>
      <div className="text-[13px] text-choco-500">{label}</div>
      <div className={cx('font-display text-[32px] leading-tight tabular-nums', tone === 'green' ? 'text-sage-700' : tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-caramel-700' : 'text-choco-900')}>{value}</div>
    </div>
  );
}

function CostRow({ l, canEdit, onCost, child }: { l: CostLine; canEdit: boolean; onCost: (id: number, v: number) => void; child?: boolean }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<number | null>(null);
  if (l.type === 'recipe') {
    return (
      <div>
        <button type="button" className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(!open)}>
          <BookOpen size={16} className="text-choco-400 shrink-0" />
          <span className="flex-1 font-medium">
            {l.name} <span className="text-sm text-choco-500 font-semibold">× {num(l.quantity, 2)}</span>
          </span>
          <span className="font-medium tabular-nums">{money(l.cost)}</span>
          <ChevronDown size={18} className={cx('text-choco-400 transition', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="bg-cream-50 border-t border-cream-200">
            {l.children?.map((ch, i) => <CostRow key={i} l={ch} canEdit={canEdit} onCost={onCost} child />)}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={cx('flex items-center gap-3 px-4 py-2.5', child && 'pl-10 text-[15px]')}>
      {l.type === 'material' ? <Package size={16} className="text-choco-400 shrink-0" /> : <Wheat size={16} className="text-choco-400 shrink-0" />}
      <span className="flex-1 min-w-0">
        <span className="font-semibold">{l.name}</span>
        <span className="block text-xs text-choco-500">
          {num(l.quantity, 2)} {l.unit} ·{' '}
          {edit !== null ? (
            <span className="inline-flex items-center gap-1">
              <NumberInput value={edit} onChange={(v) => setEdit(v ?? 0)} className="w-24 inline-block" />
              <button type="button" className="font-medium text-berry-600" onClick={() => { if (l.item_id) onCost(l.item_id, edit); setEdit(null); }}>
                Guardar
              </button>
            </span>
          ) : canEdit && l.item_id ? (
            <button type="button" className="underline decoration-dotted" onClick={() => setEdit(l.unit_cost ?? 0)}>
              {money(l.unit_cost ?? 0)} por unidad de compra
            </button>
          ) : (
            `${money(l.unit_cost ?? 0)} por unidad de compra`
          )}
        </span>
      </span>
      <span className="font-medium tabular-nums">{money(l.cost)}</span>
    </div>
  );
}
