import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { compatibleUnits, UNIT_LABELS, type Unit } from '@shared/constants';
import { api, useAction, useApi } from '../lib/api';
import type { InventoryItem } from '../lib/types';
import { PhotoPicker } from '../components/PhotoPicker';
import { Button, Card, ErrorBox, Field, IconButton, Input, Loading, NumberInput, PageHeader, Select, Textarea } from '../components/ui';
import { ItemSheet } from './Inventory';

interface Ing {
  key: number;
  item_id: number | null;
  quantity: number | null;
  unit: Unit;
}

let seq = 0;

export function RecipeForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const items = useApi<InventoryItem[]>('/inventory');
  const existing = useApi<any>(id ? `/recipes/${id}` : null, { staleTime: Infinity });
  const [newItem, setNewItem] = useState<number | null>(null);
  const [f, setF] = useState({
    name: '',
    category: '',
    photo: [] as number[],
    servings: 10 as number | null,
    prep_minutes: null as number | null,
    bake_minutes: null as number | null,
    temperature: null as number | null,
    sale_price: null as number | null,
    notes: '',
    steps: [''] as string[],
    ingredients: [] as Ing[],
  });
  const [ready, setReady] = useState(!id);

  useEffect(() => {
    if (!id || !existing.data || ready) return;
    const r = existing.data;
    setF({
      name: r.name,
      category: r.category ?? '',
      photo: r.photo_id ? [r.photo_id] : [],
      servings: r.servings,
      prep_minutes: r.prep_minutes,
      bake_minutes: r.bake_minutes,
      temperature: r.temperature,
      sale_price: r.sale_price,
      notes: r.notes ?? '',
      steps: r.steps.length ? r.steps : [''],
      ingredients: r.ingredients.map((i: any) => ({ key: ++seq, item_id: i.item_id, quantity: i.quantity, unit: i.unit })),
    });
    setReady(true);
  }, [existing.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAction(
    () => {
      const body = {
        name: f.name,
        category: f.category || null,
        photo_id: f.photo[0] ?? null,
        servings: f.servings,
        prep_minutes: f.prep_minutes,
        bake_minutes: f.bake_minutes,
        temperature: f.temperature,
        sale_price: f.sale_price,
        notes: f.notes || null,
        steps: f.steps.map((s) => s.trim()).filter(Boolean),
        ingredients: f.ingredients.filter((i) => i.item_id && i.quantity).map((i) => ({ item_id: i.item_id, quantity: i.quantity, unit: i.unit })),
      };
      return id ? api(`/recipes/${id}`, { method: 'PUT', body }) : api('/recipes', { method: 'POST', body });
    },
    { success: 'Receta guardada', onSuccess: (r: { id: number }) => nav(`/recetas/${r.id}`, { replace: true }) },
  );

  if (items.error) return <ErrorBox error={items.error} />;
  if (!ready || !items.data) return <Loading />;
  const itemMap = new Map(items.data.map((i) => [i.id, i]));
  const setIng = (key: number, patch: Partial<Ing>) =>
    setF((s) => ({
      ...s,
      ingredients: s.ingredients.map((i) => {
        if (i.key !== key) return i;
        const next = { ...i, ...patch };
        if (patch.item_id) {
          const it = itemMap.get(patch.item_id);
          // Unidad por defecto: gramos/ml para kilos/litros (más cómodo en recetas).
          if (it && !compatibleUnits(it.unit).includes(next.unit)) next.unit = it.unit === 'kg' ? 'g' : it.unit === 'l' ? 'ml' : it.unit;
        }
        return next;
      }),
    }));
  const moveStep = (i: number, d: number) =>
    setF((s) => {
      const steps = [...s.steps];
      const j = i + d;
      if (j < 0 || j >= steps.length) return s;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...s, steps };
    });

  const options = [
    ...items.data.filter((i) => i.kind === 'ingredient').map((i) => ({ value: i.id, label: i.name })),
    ...items.data.filter((i) => i.kind === 'material').map((i) => ({ value: i.id, label: `📦 ${i.name}` })),
  ];

  return (
    <div className="pb-24 space-y-5">
      <PageHeader back title={id ? 'Editar receta' : 'Nueva receta'} />
      <Card className="p-4 space-y-4">
        <Field label="Nombre">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej. Bizcocho de vainilla" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoría" hint="Para agruparlas: Bizcochos, Cremas, Galletas…">
            <Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} list="recipe-cats" />
            <datalist id="recipe-cats">
              {['Bizcochos', 'Rellenos y coberturas', 'Galletas', 'Cupcakes', 'Brownies', 'Cheesecakes', 'Masas'].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Raciones que salen" hint="Las cantidades de abajo son para estas raciones.">
            <NumberInput value={f.servings} onChange={(servings) => setF({ ...f, servings })} integer />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Preparación">
            <NumberInput value={f.prep_minutes} onChange={(prep_minutes) => setF({ ...f, prep_minutes })} suffix="min" integer />
          </Field>
          <Field label="Horno">
            <NumberInput value={f.bake_minutes} onChange={(bake_minutes) => setF({ ...f, bake_minutes })} suffix="min" integer />
          </Field>
          <Field label="Temperatura">
            <NumberInput value={f.temperature} onChange={(temperature) => setF({ ...f, temperature })} suffix="°C" integer />
          </Field>
        </div>
        <div>
          <span className="label">Foto</span>
          <PhotoPicker value={f.photo} onChange={(photo) => setF({ ...f, photo })} multiple={false} />
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-extrabold text-lg">Ingredientes</h2>
        {f.ingredients.map((ing) => {
          const it = ing.item_id ? itemMap.get(ing.item_id) : undefined;
          const units = it ? compatibleUnits(it.unit) : (['g', 'kg', 'ml', 'l', 'ud'] as Unit[]);
          return (
            <div key={ing.key} className="rounded-xl bg-cream-50 border border-cream-200 p-2.5 space-y-2">
              <div className="flex gap-2">
                <Select
                  className="flex-1"
                  value={ing.item_id ?? ''}
                  placeholder="Elige ingrediente…"
                  options={options}
                  onChange={(v) => setIng(ing.key, { item_id: v ? Number(v) : null })}
                />
                <IconButton label="Quitar" onClick={() => setF({ ...f, ingredients: f.ingredients.filter((x) => x.key !== ing.key) })}>
                  <Trash2 size={20} />
                </IconButton>
              </div>
              <div className="flex gap-2">
                <NumberInput className="flex-1" value={ing.quantity} onChange={(quantity) => setIng(ing.key, { quantity })} placeholder="Cantidad" />
                <Select className="w-36" value={ing.unit} options={units.map((u) => ({ value: u, label: UNIT_LABELS[u] }))} onChange={(v) => setIng(ing.key, { unit: v as Unit })} />
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Plus size={18} />} onClick={() => setF({ ...f, ingredients: [...f.ingredients, { key: ++seq, item_id: null, quantity: null, unit: 'g' }] })}>
            Añadir ingrediente
          </Button>
          <Button variant="ghost" onClick={() => setNewItem(++seq)}>
            ¿No está en la lista? Créalo
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-extrabold text-lg">Paso a paso</h2>
        {f.steps.map((s, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="h-8 w-8 mt-2 shrink-0 rounded-full bg-berry-100 text-berry-700 font-extrabold flex items-center justify-center">{i + 1}</span>
            <Textarea rows={2} value={s} onChange={(e) => setF({ ...f, steps: f.steps.map((x, j) => (j === i ? e.target.value : x)) })} placeholder="Describe este paso" />
            <div className="flex flex-col">
              <IconButton label="Subir" className="h-8 w-8" onClick={() => moveStep(i, -1)} disabled={i === 0}>
                <ArrowUp size={16} />
              </IconButton>
              <IconButton label="Bajar" className="h-8 w-8" onClick={() => moveStep(i, 1)} disabled={i === f.steps.length - 1}>
                <ArrowDown size={16} />
              </IconButton>
              <IconButton label="Quitar paso" className="h-8 w-8" onClick={() => setF({ ...f, steps: f.steps.filter((_, j) => j !== i) })}>
                <Trash2 size={16} />
              </IconButton>
            </div>
          </div>
        ))}
        <Button variant="secondary" icon={<Plus size={18} />} onClick={() => setF({ ...f, steps: [...f.steps, ''] })}>
          Añadir paso
        </Button>
      </Card>

      <Card className="p-4 space-y-4">
        <Field label="Precio de venta de la receta completa (opcional)" hint="Para ver el margen. Los precios de lo que vendes se ponen en el Catálogo.">
          <NumberInput value={f.sale_price} onChange={(sale_price) => setF({ ...f, sale_price })} suffix="€" />
        </Field>
        <Field label="Notas">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Trucos, variantes, conservación…" />
        </Field>
      </Card>

      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:bottom-0 lg:left-64 z-30 bg-white/95 backdrop-blur border-t border-cream-200">
        <div className="mx-auto max-w-5xl px-4 lg:px-8 py-3">
          <Button block size="lg" loading={save.isPending} disabled={!f.name.trim() || !f.servings} onClick={() => save.mutate()}>
            Guardar receta
          </Button>
        </div>
      </div>
      <ItemSheet
        key={newItem ?? 0}
        open={newItem !== null}
        onClose={() => setNewItem(null)}
        onCreated={(itemId, unit) =>
          setF((s) => ({
            ...s,
            ingredients: [...s.ingredients, { key: ++seq, item_id: itemId, quantity: null, unit: unit === 'kg' ? 'g' : unit === 'l' ? 'ml' : unit }],
          }))
        }
      />
    </div>
  );
}
