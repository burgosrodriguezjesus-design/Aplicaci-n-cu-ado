import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { BookOpen, Package, Plus, Trash2, X } from 'lucide-react';
import {
  CATEGORY_LABELS,
  compatibleUnits,
  DEFAULT_STAGES,
  PRODUCT_CATEGORIES,
  STAGE_LABELS,
  STAGES,
  UNIT_LABELS,
  type ProductCategory,
  type Stage,
  type Unit,
} from '@shared/constants';
import { api, useAction, useApi } from '../lib/api';
import type { InventoryItem, Product } from '../lib/types';
import type { RecipeSummary } from './Recipes';
import { PhotoPicker } from '../components/PhotoPicker';
import {
  Button,
  Card,
  Chip,
  ErrorBox,
  Field,
  IconButton,
  Input,
  Loading,
  NumberInput,
  PageHeader,
  Segmented,
  Select,
  Textarea,
  Toggle,
  useConfirm,
} from '../components/ui';

let seq = 0;
const k = () => ++seq;

interface SizeRow {
  key: number;
  id?: number;
  name: string;
  servings: number | null;
  price: number | null;
}
interface CompRow {
  key: number;
  type: 'recipe' | 'item';
  recipe_id: number | null;
  item_id: number | null;
  quantity: number | null;
  unit: Unit | null;
  per_serving: boolean;
  sizeKey: number | null;
}

export function ProductForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const existing = useApi<Product>(id ? `/products/${id}` : null, { staleTime: Infinity });
  const recipes = useApi<RecipeSummary[]>('/recipes');
  const items = useApi<InventoryItem[]>('/inventory');
  const [ready, setReady] = useState(!id);
  const [f, setF] = useState({
    name: '',
    category: 'tartas' as ProductCategory,
    description: '',
    photo: [] as number[],
    pricing: 'unit' as 'unit' | 'serving',
    base_price: null as number | null,
    unit_label: 'ud',
    servings: 1 as number | null,
    flavors: [] as string[],
    fillings: [] as string[],
    coverings: [] as string[],
    extras: [] as { key: number; name: string; price: number | null }[],
    sizes: [] as SizeRow[],
    components: [] as CompRow[],
    labor_minutes: 0 as number | null,
    other_costs: 0 as number | null,
    stages: null as Stage[] | null,
    active: true,
  });

  useEffect(() => {
    if (!id || ready || !existing.data) return;
    const p = existing.data;
    const sizes = p.sizes.map((s) => ({ key: k(), id: s.id, name: s.name, servings: s.servings, price: s.price }));
    setF({
      name: p.name,
      category: p.category,
      description: p.description ?? '',
      photo: p.photo_id ? [p.photo_id] : [],
      pricing: p.pricing,
      base_price: p.base_price,
      unit_label: p.unit_label,
      servings: p.servings,
      flavors: p.flavors,
      fillings: p.fillings,
      coverings: p.coverings,
      extras: p.extras.map((e) => ({ key: k(), ...e })),
      sizes,
      components: p.components.map((c) => ({
        key: k(),
        type: c.recipe_id ? 'recipe' : 'item',
        recipe_id: c.recipe_id,
        item_id: c.item_id,
        quantity: c.quantity,
        unit: c.unit,
        per_serving: !!c.per_serving,
        sizeKey: c.size_id ? (sizes.find((s) => s.id === c.size_id)?.key ?? null) : null,
      })),
      labor_minutes: p.labor_minutes,
      other_costs: p.other_costs,
      stages: p.custom_stages ? p.stages : null,
      active: !!p.active,
    });
    setReady(true);
  }, [existing.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAction(
    () => {
      const body = {
        name: f.name,
        category: f.category,
        description: f.description || null,
        photo_id: f.photo[0] ?? null,
        pricing: f.pricing,
        base_price: f.base_price ?? 0,
        unit_label: f.unit_label || 'ud',
        servings: f.servings || 1,
        flavors: f.flavors,
        fillings: f.fillings,
        coverings: f.coverings,
        extras: f.extras.filter((e) => e.name.trim()).map((e) => ({ name: e.name.trim(), price: e.price ?? 0 })),
        sizes: f.sizes.filter((s) => s.name.trim()).map((s) => ({ id: s.id, name: s.name.trim(), servings: s.servings || 1, price: s.price ?? 0 })),
        components: f.components
          .filter((c) => (c.type === 'recipe' ? c.recipe_id : c.item_id) && c.quantity)
          .map((c) => {
            const validSizes = f.sizes.filter((s) => s.name.trim());
            const idx = c.sizeKey ? validSizes.findIndex((s) => s.key === c.sizeKey) : -1;
            return c.type === 'recipe'
              ? { recipe_id: c.recipe_id, quantity: c.quantity, size_index: idx >= 0 ? idx : null }
              : { item_id: c.item_id, quantity: c.quantity, unit: c.unit, per_serving: c.per_serving, size_index: idx >= 0 ? idx : null };
          }),
        labor_minutes: f.labor_minutes ?? 0,
        other_costs: f.other_costs ?? 0,
        stages: f.stages,
        active: f.active,
      };
      return id ? api(`/products/${id}`, { method: 'PUT', body }) : api('/products', { method: 'POST', body });
    },
    { success: 'Producto guardado', onSuccess: (r: { id: number }) => nav(`/catalogo/${r.id}`, { replace: true }) },
  );
  const remove = useAction(() => api(`/products/${id}`, { method: 'DELETE' }), {
    success: (r: { archived: boolean }) => (r.archived ? 'Producto archivado (tiene pedidos)' : 'Producto borrado'),
    onSuccess: () => nav('/catalogo', { replace: true }),
  });

  if (recipes.error || items.error) return <ErrorBox error={recipes.error || items.error} />;
  if (!ready || !recipes.data || !items.data) return <Loading />;
  const itemMap = new Map(items.data.map((i) => [i.id, i]));
  const stages = f.stages ?? DEFAULT_STAGES[f.category];
  const setComp = (key: number, patch: Partial<CompRow>) =>
    setF((s) => ({
      ...s,
      components: s.components.map((c) => {
        if (c.key !== key) return c;
        const next = { ...c, ...patch };
        if (patch.item_id) {
          const it = itemMap.get(patch.item_id);
          if (it && (!next.unit || !compatibleUnits(it.unit).includes(next.unit))) next.unit = it.unit;
        }
        return next;
      }),
    }));

  return (
    <div className="pb-24 space-y-5">
      <PageHeader back title={id ? 'Editar producto' : 'Nuevo producto'} />

      <Card className="p-4 space-y-4">
        <Field label="Nombre">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej. Tarta de zanahoria" />
        </Field>
        <div>
          <span className="label">Categoría</span>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_CATEGORIES.map((c) => (
              <Chip key={c} active={f.category === c} onClick={() => setF({ ...f, category: c })}>
                {CATEGORY_LABELS[c]}
              </Chip>
            ))}
          </div>
        </div>
        <Field label="Descripción">
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <div>
          <span className="label">Foto</span>
          <PhotoPicker value={f.photo} onChange={(photo) => setF({ ...f, photo })} multiple={false} />
        </div>
        <Toggle checked={f.active} onChange={(active) => setF({ ...f, active })} label="Disponible para pedidos" />
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-display text-[19px] text-choco-900">Precio y tamaños</h2>
        <Segmented
          value={f.pricing}
          onChange={(pricing) => setF({ ...f, pricing })}
          options={[
            { value: 'unit', label: 'Precio por unidad' },
            { value: 'serving', label: 'Precio por ración' },
          ]}
        />
        <div className="grid grid-cols-3 gap-3">
          <Field label={f.pricing === 'serving' ? 'Precio/ración' : 'Precio base'} hint={f.sizes.length ? 'Si eliges tamaño, manda su precio.' : undefined}>
            <NumberInput value={f.base_price} onChange={(base_price) => setF({ ...f, base_price })} suffix="€" />
          </Field>
          <Field label="Se vende por" hint="tarta, ud, caja…">
            <Input value={f.unit_label} onChange={(e) => setF({ ...f, unit_label: e.target.value })} />
          </Field>
          <Field label="Raciones" hint="De referencia, sin tamaño.">
            <NumberInput value={f.servings} onChange={(servings) => setF({ ...f, servings })} />
          </Field>
        </div>
        <div className="space-y-2">
          <span className="label">Tamaños (opcional)</span>
          {f.sizes.map((s) => (
            <div key={s.key} className="grid grid-cols-[1fr_6rem_6.5rem_auto] gap-2 items-center">
              <Input value={s.name} onChange={(e) => setF({ ...f, sizes: f.sizes.map((x) => (x.key === s.key ? { ...x, name: e.target.value } : x)) })} placeholder="Ej. Mediana" />
              <NumberInput value={s.servings} onChange={(servings) => setF({ ...f, sizes: f.sizes.map((x) => (x.key === s.key ? { ...x, servings } : x)) })} suffix="rac." />
              <NumberInput value={s.price} onChange={(price) => setF({ ...f, sizes: f.sizes.map((x) => (x.key === s.key ? { ...x, price } : x)) })} suffix="€" />
              <IconButton label="Quitar tamaño" onClick={() => setF({ ...f, sizes: f.sizes.filter((x) => x.key !== s.key), components: f.components.map((c) => (c.sizeKey === s.key ? { ...c, sizeKey: null } : c)) })}>
                <Trash2 size={18} />
              </IconButton>
            </div>
          ))}
          <Button variant="secondary" size="sm" icon={<Plus size={16} />} onClick={() => setF({ ...f, sizes: [...f.sizes, { key: k(), name: '', servings: null, price: null }] })}>
            Añadir tamaño
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-display text-[19px] text-choco-900">Opciones para el cliente</h2>
        <TagInput label="Sabores" value={f.flavors} onChange={(flavors) => setF({ ...f, flavors })} />
        <TagInput label="Rellenos" value={f.fillings} onChange={(fillings) => setF({ ...f, fillings })} />
        <TagInput label="Coberturas" value={f.coverings} onChange={(coverings) => setF({ ...f, coverings })} />
        <div className="space-y-2">
          <span className="label">Extras con precio</span>
          {f.extras.map((e) => (
            <div key={e.key} className="grid grid-cols-[1fr_7rem_auto] gap-2">
              <Input value={e.name} onChange={(ev) => setF({ ...f, extras: f.extras.map((x) => (x.key === e.key ? { ...x, name: ev.target.value } : x)) })} placeholder="Ej. Topper" />
              <NumberInput value={e.price} onChange={(price) => setF({ ...f, extras: f.extras.map((x) => (x.key === e.key ? { ...x, price } : x)) })} suffix="€" />
              <IconButton label="Quitar extra" onClick={() => setF({ ...f, extras: f.extras.filter((x) => x.key !== e.key) })}>
                <Trash2 size={18} />
              </IconButton>
            </div>
          ))}
          <Button variant="secondary" size="sm" icon={<Plus size={16} />} onClick={() => setF({ ...f, extras: [...f.extras, { key: k(), name: '', price: null }] })}>
            Añadir extra
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div>
          <h2 className="font-display text-[19px] text-choco-900">Composición (escandallo)</h2>
          <p className="text-sm text-choco-500">
            Recetas que lleva (se ajustan solas a las raciones) y envases o decoración. Con esto se calculan el coste, los ingredientes de cada pedido y la lista de la compra.
          </p>
        </div>
        {f.components.map((c) => {
          const it = c.item_id ? itemMap.get(c.item_id) : undefined;
          return (
            <div key={c.key} className="rounded-xl bg-cream-50 border border-cream-200 p-3 space-y-2">
              <div className="flex gap-2 items-center">
                <span className="text-choco-400">{c.type === 'recipe' ? <BookOpen size={18} /> : <Package size={18} />}</span>
                {c.type === 'recipe' ? (
                  <Select className="flex-1" value={c.recipe_id ?? ''} placeholder="Elige receta…" options={recipes.data!.map((r) => ({ value: r.id, label: `${r.name} (${r.servings} rac.)` }))} onChange={(v) => setComp(c.key, { recipe_id: v ? Number(v) : null })} />
                ) : (
                  <Select
                    className="flex-1"
                    value={c.item_id ?? ''}
                    placeholder="Elige artículo…"
                    options={[...items.data!.filter((i) => i.kind === 'material'), ...items.data!.filter((i) => i.kind === 'ingredient')].map((i) => ({ value: i.id, label: `${i.kind === 'material' ? '📦' : '🥚'} ${i.name}` }))}
                    onChange={(v) => setComp(c.key, { item_id: v ? Number(v) : null })}
                  />
                )}
                <IconButton label="Quitar" onClick={() => setF({ ...f, components: f.components.filter((x) => x.key !== c.key) })}>
                  <Trash2 size={18} />
                </IconButton>
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                {c.type === 'recipe' ? (
                  <Field label="Multiplicador" hint="1 = la receta tal cual, ajustada a las raciones" className="w-48">
                    <NumberInput value={c.quantity} onChange={(quantity) => setComp(c.key, { quantity })} suffix="×" />
                  </Field>
                ) : (
                  <>
                    <Field label="Cantidad" className="w-32">
                      <NumberInput value={c.quantity} onChange={(quantity) => setComp(c.key, { quantity })} />
                    </Field>
                    <Field label="Unidad" className="w-32">
                      <Select value={c.unit ?? it?.unit ?? 'ud'} options={(it ? compatibleUnits(it.unit) : (['ud'] as Unit[])).map((u) => ({ value: u, label: UNIT_LABELS[u] }))} onChange={(v) => setComp(c.key, { unit: v as Unit })} />
                    </Field>
                    <Field label="Por" className="w-36">
                      <Select value={c.per_serving ? 's' : 'u'} options={[{ value: 'u', label: `cada ${f.unit_label || 'ud'}` }, { value: 's', label: 'cada ración' }]} onChange={(v) => setComp(c.key, { per_serving: v === 's' })} />
                    </Field>
                  </>
                )}
                {f.sizes.length > 0 && (
                  <Field label="Tamaño" className="w-40">
                    <Select value={c.sizeKey ?? ''} placeholder="Todos" options={f.sizes.filter((s) => s.name.trim()).map((s) => ({ value: s.key, label: `Solo ${s.name}` }))} onChange={(v) => setComp(c.key, { sizeKey: v ? Number(v) : null })} />
                  </Field>
                )}
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={<Plus size={16} />} onClick={() => setF({ ...f, components: [...f.components, { key: k(), type: 'recipe', recipe_id: null, item_id: null, quantity: 1, unit: null, per_serving: false, sizeKey: null }] })}>
            Añadir receta
          </Button>
          <Button variant="secondary" size="sm" icon={<Plus size={16} />} onClick={() => setF({ ...f, components: [...f.components, { key: k(), type: 'item', recipe_id: null, item_id: null, quantity: 1, unit: null, per_serving: false, sizeKey: null }] })}>
            Añadir envase / decoración
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tiempo de trabajo" hint={`Minutos de mano de obra para ${f.servings || 1} raciones; se ajusta al tamaño.`}>
            <NumberInput value={f.labor_minutes} onChange={(labor_minutes) => setF({ ...f, labor_minutes })} suffix="min" />
          </Field>
          <Field label="Otros costes por unidad" hint="Gas, transporte, cintas…">
            <NumberInput value={f.other_costs} onChange={(other_costs) => setF({ ...f, other_costs })} suffix="€" />
          </Field>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-display text-[19px] text-choco-900">Fases de producción</h2>
        <p className="text-sm text-choco-500">Tareas que aparecerán en Producción para este producto (además de «Entregar»).</p>
        <div className="flex flex-wrap gap-2">
          {STAGES.filter((s) => s !== 'entregar').map((s) => (
            <Chip key={s} active={stages.includes(s)} onClick={() => setF({ ...f, stages: stages.includes(s) ? stages.filter((x) => x !== s) : STAGES.filter((x) => x === s || stages.includes(x)) })}>
              {STAGE_LABELS[s]}
            </Chip>
          ))}
        </div>
      </Card>

      {id && (
        <Button variant="danger" icon={<Trash2 size={18} />} onClick={async () => (await confirm({ title: `¿Borrar «${f.name}»?`, text: 'Si ya tiene pedidos, se archivará en vez de borrarse.', ok: 'Borrar', danger: true })) && remove.mutate()}>
          Borrar producto
        </Button>
      )}

      <div className="action-bar">
        <div className="mx-auto max-w-5xl px-3.5 lg:px-10 py-2.5 lg:py-3">
          <Button block size="lg" loading={save.isPending} disabled={!f.name.trim()} onClick={() => save.mutate()}>
            Guardar producto
          </Button>
        </div>
      </div>
    </div>
  );
}

function TagInput({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText('');
  };
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-cream-50 text-choco-800 border border-cream-200 pl-2.5 pr-1 h-8 font-medium text-[13px]">
            {v}
            <button type="button" aria-label={`Quitar ${v}`} className="h-7 w-7 flex items-center justify-center rounded hover:bg-cream-200" onClick={() => onChange(value.filter((x) => x !== v))}>
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Escribe y pulsa Añadir"
        />
        <Button variant="secondary" onClick={add} disabled={!text.trim()}>
          Añadir
        </Button>
      </div>
    </div>
  );
}
