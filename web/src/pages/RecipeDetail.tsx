import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Clock, Flame, Pencil, Thermometer, Trash2, TriangleAlert, Users } from 'lucide-react';
import { ALLERGEN_LABELS, type Allergen, type Unit } from '@shared/constants';
import { api, useAction, useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, num, pct, qty } from '../lib/format';
import { Badge, Button, Card, Chip, cx, ErrorBox, Loading, NumberInput, PageHeader, Section, Thumb, useConfirm } from '../components/ui';

interface RecipeFull {
  id: number;
  name: string;
  category: string | null;
  photo_id: number | null;
  servings: number;
  prep_minutes: number | null;
  bake_minutes: number | null;
  temperature: number | null;
  steps: string[];
  notes: string | null;
  sale_price: number | null;
  ingredients: { id: number; item_id: number; name: string; kind: string; quantity: number; unit: Unit; item_unit: Unit; stock: number; cost_per_unit: number | null }[];
  allergens: string[];
  used_in: { id: number; name: string }[];
  scaled: { servings: number; factor: number; ingredients: { item_id: number; name: string; quantity: number; unit: Unit; cost: number | null }[]; cost: number | null };
  costing: {
    ingredients: number;
    materials: number;
    labor: number;
    labor_minutes: number;
    overhead: number;
    total: number;
    cost_per_serving: number;
    recommended_price: number;
    price: number;
    profit: number | null;
    margin: number | null;
  } | null;
}

/** Cantidad "de cocina": huevos y unidades con aproximación (3,75 ud ≈ 4). */
function kitchenQty(q: number, unit: Unit) {
  if (unit === 'ud') {
    const r = Math.round(q * 10) / 10;
    return Number.isInteger(r) ? `${r}` : `${num(r, 1)} (≈ ${Math.ceil(q)})`;
  }
  return qty(q, unit);
}

export function RecipeDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const { permissions } = useAuth();
  const [servings, setServings] = useState<number | null>(null);
  const base = useApi<RecipeFull>(`/recipes/${id}`);
  const target = servings ?? base.data?.servings ?? null;
  const scaledQ = useApi<RecipeFull>(target && base.data && target !== base.data.servings ? `/recipes/${id}?servings=${target}` : null, {
    placeholderData: (prev) => prev,
  });
  const remove = useAction(() => api(`/recipes/${id}`, { method: 'DELETE' }), { success: 'Receta borrada', onSuccess: () => nav('/recetas', { replace: true }) });

  if (base.isLoading) return <Loading />;
  if (base.error || !base.data) return <ErrorBox error={base.error} />;
  const r = base.data;
  const view = target !== r.servings && scaledQ.data ? scaledQ.data : r;
  const factor = (target ?? r.servings) / r.servings;
  const quick = [0.5, 1, 1.5, 2, 3].map((x) => Math.round(r.servings * x));

  return (
    <div className="space-y-5">
      <PageHeader
        back="/recetas"
        title={r.name}
        subtitle={r.category}
        actions={
          permissions.catalog && (
            <Link to={`/recetas/${r.id}/editar`}>
              <Button variant="outline" size="sm" icon={<Pencil size={16} />}>
                Editar
              </Button>
            </Link>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
        <div className="space-y-4">
          <Thumb photoId={r.photo_id} emoji="📖" className={r.photo_id ? 'w-full h-52 lg:h-64' : 'w-full h-24 lg:h-40'} rounded="rounded-2xl" />
          <div className="grid grid-cols-4 gap-2 text-center">
            <Info icon={<Users size={18} />} label="Raciones" value={num(r.servings)} />
            <Info icon={<Clock size={18} />} label="Preparar" value={r.prep_minutes ? `${r.prep_minutes}′` : '—'} />
            <Info icon={<Flame size={18} />} label="Horno" value={r.bake_minutes ? `${r.bake_minutes}′` : '—'} />
            <Info icon={<Thermometer size={18} />} label="Temp." value={r.temperature ? `${r.temperature}°` : '—'} />
          </div>
          {r.allergens.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-700 font-semibold flex gap-2">
              <TriangleAlert size={20} className="shrink-0" />
              Contiene: {r.allergens.map((a) => ALLERGEN_LABELS[a as Allergen] ?? a).join(', ').toLowerCase()}
            </div>
          )}
          {r.costing && (
            <Card className="p-4 space-y-2">
              <div className="section-title">Costes (receta base)</div>
              <Line label="Ingredientes" value={money(r.costing.ingredients + r.costing.materials)} />
              <Line label={`Mano de obra (${r.costing.labor_minutes} min)`} value={money(r.costing.labor)} />
              <Line label="Gastos generales" value={money(r.costing.overhead)} />
              <Line label={<b>Coste aproximado</b>} value={<b>{money(r.costing.total)}</b>} />
              <Line label="Coste por ración" value={money(r.costing.cost_per_serving)} />
              <div className="rounded-xl bg-emerald-50 p-3 mt-2">
                <Line label={<b>Precio recomendado</b>} value={<b className="text-emerald-700 text-lg">{money(r.costing.recommended_price)}</b>} />
                {r.costing.margin !== null && (
                  <Line label={`Tu precio (${money(r.costing.price)})`} value={<b className={r.costing.margin < 0.3 ? 'text-red-600' : 'text-emerald-700'}>Margen {pct(r.costing.margin)}</b>} />
                )}
              </div>
            </Card>
          )}
          {r.used_in.length > 0 && (
            <div className="text-sm text-choco-500">
              Se usa en:{' '}
              {r.used_in.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <Link to={`/catalogo/${p.id}`} className="font-bold text-berry-600">
                    {p.name}
                  </Link>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-4 space-y-3 border-2 border-berry-100">
            <div className="font-extrabold text-lg">¿Para cuántas personas?</div>
            <div className="flex items-center gap-3">
              <NumberInput value={target} onChange={(v) => setServings(v && v > 0 ? v : null)} suffix="raciones" className="w-48" integer />
              {factor !== 1 && <Badge tone="berry">× {num(factor, 2)}</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              {[...new Set(quick)].map((n) => (
                <Chip key={n} active={target === n} onClick={() => setServings(n)}>
                  {n}
                </Chip>
              ))}
            </div>
          </Card>

          <Section title={`Ingredientes para ${num(target ?? r.servings)} raciones`}>
            <Card className="divide-y divide-cream-200">
              {view.scaled.ingredients.map((i) => {
                return (
                  <div key={i.item_id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex-1">
                      <Link to={`/inventario/${i.item_id}`} className="font-semibold hover:underline">
                        {i.name}
                      </Link>
                    </span>
                    <span className={cx('font-extrabold text-lg tabular-nums', factor !== 1 && 'text-berry-600')}>{kitchenQty(i.quantity, i.unit)}</span>
                    {i.cost !== null && <span className="text-sm text-choco-400 w-16 text-right tabular-nums">{money(i.cost)}</span>}
                  </div>
                );
              })}
              {view.scaled.cost !== null && (
                <div className="flex justify-between px-4 py-3 bg-cream-50 font-bold">
                  <span>Coste total ({num(target ?? r.servings)} raciones)</span>
                  <span>{money(view.scaled.cost)}</span>
                </div>
              )}
            </Card>
          </Section>

          {r.steps.length > 0 && (
            <Section title="Paso a paso">
              <ol className="space-y-2.5">
                {r.steps.map((s, i) => (
                  <li key={i} className="card p-4 flex gap-3">
                    <span className="h-8 w-8 shrink-0 rounded-full bg-berry-500 text-white font-extrabold flex items-center justify-center">{i + 1}</span>
                    <span className="pt-1 text-[16px] leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}
          {r.notes && (
            <Card className="p-4">
              <div className="section-title mb-1">Notas</div>
              <p className="whitespace-pre-line">{r.notes}</p>
            </Card>
          )}
        </div>
      </div>
      {permissions.catalog && (
        <Button
          variant="danger"
          icon={<Trash2 size={18} />}
          onClick={async () => (await confirm({ title: `¿Borrar la receta «${r.name}»?`, ok: 'Borrar', danger: true })) && remove.mutate()}
        >
          Borrar receta
        </Button>
      )}
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card py-2.5">
      <div className="flex justify-center text-berry-500">{icon}</div>
      <div className="font-extrabold">{value}</div>
      <div className="text-[11px] font-bold text-choco-500">{label}</div>
    </div>
  );
}

function Line({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-[15px]">
      <span className="text-choco-700">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
