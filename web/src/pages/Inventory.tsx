import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ChevronRight, Minus, PackagePlus, Pencil, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { ALLERGEN_LABELS, ALLERGENS, UNIT_LABELS, UNITS, type Allergen, type Unit } from '@shared/constants';
import { api, useAction, useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, num, qty, relDay } from '../lib/format';
import type { InventoryItem } from '../lib/types';
import {
  Badge,
  Button,
  Card,
  Chip,
  cx,
  Empty,
  ErrorBox,
  Fab,
  Field,
  Input,
  Loading,
  NumberInput,
  PageHeader,
  SearchInput,
  Section,
  Segmented,
  Select,
  Sheet,
  Textarea,
  Toggle,
  useConfirm,
} from '../components/ui';

export function Inventory() {
  const { permissions } = useAuth();
  const [kind, setKind] = useState<'ingredient' | 'material'>('ingredient');
  const [q, setQ] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [creating, setCreating] = useState(false);
  const res = useApi<InventoryItem[]>('/inventory');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const all = res.data ?? [];
  const list = all.filter((i) => i.kind === kind && (!onlyLow || i.low) && (!q || norm(i.name).includes(norm(q))));
  const lowCount = (k: string) => all.filter((i) => i.kind === k && i.low).length;

  return (
    <div>
      <PageHeader
        title="Inventario"
        back="/mas"
        actions={
          permissions.inventory && (
            <Button className="hidden lg:inline-flex" icon={<Plus size={18} />} onClick={() => setCreating(true)}>
              Nuevo artículo
            </Button>
          )
        }
      />
      <div className="space-y-3 mb-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'ingredient', label: <>🥚 Ingredientes {lowCount('ingredient') > 0 && <span className="text-red-600">({lowCount('ingredient')})</span>}</> },
            { value: 'material', label: <>📦 Materiales {lowCount('material') > 0 && <span className="text-red-600">({lowCount('material')})</span>}</> },
          ]}
        />
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <SearchInput value={q} onChange={setQ} placeholder="Buscar" />
          </div>
          <Chip active={onlyLow} tone="red" onClick={() => setOnlyLow(!onlyLow)}>
            Poco stock
          </Chip>
        </div>
      </div>
      {res.isLoading ? (
        <Loading />
      ) : res.error ? (
        <ErrorBox error={res.error} retry={res.refetch} />
      ) : !list.length ? (
        <Empty icon={kind === 'ingredient' ? '🥚' : '📦'} title="Nada por aquí" text={onlyLow ? 'No hay artículos con poco stock. 👍' : 'Añade tus ingredientes y materiales para controlar el stock.'} />
      ) : (
        <Card className="divide-y divide-cream-200 overflow-hidden">
          {list.map((i) => (
            <Link key={i.id} to={`/inventario/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50">
              <span className={cx('h-3 w-3 rounded-full shrink-0', i.quantity <= 0 ? 'bg-red-500' : i.low ? 'bg-amber-500' : 'bg-emerald-500')} />
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{i.name}</div>
                <div className="text-sm text-choco-500">
                  {i.min_stock > 0 ? `Mínimo ${qty(i.min_stock, i.unit)}` : 'Sin mínimo'}
                  {i.supplier && ` · ${i.supplier}`}
                </div>
              </div>
              <span className={cx('font-extrabold text-lg tabular-nums', i.low && 'text-red-600')}>{qty(i.quantity, i.unit)}</span>
              <ChevronRight size={18} className="text-choco-300" />
            </Link>
          ))}
        </Card>
      )}
      {permissions.inventory && <Fab label="Nuevo artículo" onClick={() => setCreating(true)} />}
      <ItemSheet open={creating} onClose={() => setCreating(false)} defaultKind={kind} />
    </div>
  );
}

const MOVE_LABELS: Record<string, string> = {
  purchase: 'Compra',
  consumption: 'Usado en pedido',
  adjustment: 'Ajuste',
  waste: 'Merma',
};

export function InventoryItemPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const { permissions } = useAuth();
  const res = useApi<InventoryItem & { movements: any[]; usage: { recipes: { id: number; name: string }[]; products: { id: number; name: string }[] } }>(`/inventory/${id}`);
  const [editing, setEditing] = useState(false);
  const [adjust, setAdjust] = useState<'add' | 'remove' | 'count' | null>(null);
  const remove = useAction(() => api(`/inventory/${id}`, { method: 'DELETE' }), {
    success: (r: { archived: boolean }) => (r.archived ? 'Artículo archivado (se usa en recetas)' : 'Artículo borrado'),
    onSuccess: () => nav('/inventario', { replace: true }),
  });
  if (res.isLoading) return <Loading />;
  if (res.error || !res.data) return <ErrorBox error={res.error} />;
  const i = res.data;
  return (
    <div className="space-y-5">
      <PageHeader
        back="/inventario"
        title={i.name}
        subtitle={i.kind === 'ingredient' ? 'Ingrediente' : 'Material'}
        actions={
          permissions.inventory && (
            <Button variant="outline" size="sm" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>
              Editar
            </Button>
          )
        }
      />
      <Card className={cx('p-5 text-center', i.low && 'border-red-200 bg-red-50')}>
        <div className="text-sm font-bold text-choco-500">Hay ahora</div>
        <div className={cx('text-5xl font-extrabold tabular-nums my-1', i.low ? 'text-red-600' : 'text-choco-900')}>{qty(i.quantity, i.unit)}</div>
        {i.min_stock > 0 && <div className="text-choco-500">Mínimo: {qty(i.min_stock, i.unit)}</div>}
        {i.low && (
          <div className="mt-2 inline-flex items-center gap-1 text-red-700 font-bold">
            <TriangleAlert size={18} /> Hay que reponer
          </div>
        )}
        {permissions.inventory && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            <Button variant="success" icon={<Plus size={18} />} onClick={() => setAdjust('add')}>
              Añadir
            </Button>
            <Button variant="secondary" icon={<Minus size={18} />} onClick={() => setAdjust('remove')}>
              Quitar
            </Button>
            <Button variant="secondary" icon={<RefreshCw size={18} />} onClick={() => setAdjust('count')}>
              Recontar
            </Button>
          </div>
        )}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4 space-y-2 text-[15px]">
          <Row label="Unidad" value={UNIT_LABELS[i.unit]} />
          {i.cost_per_unit !== null && <Row label="Precio de compra" value={`${money(i.cost_per_unit)} / ${i.unit}`} />}
          {i.pack_size && <Row label="Se compra en envases de" value={qty(i.pack_size, i.unit)} />}
          <Row label="Proveedor" value={i.supplier || '—'} />
          {i.allergens.length > 0 && <Row label="Alérgenos" value={i.allergens.map((a) => ALLERGEN_LABELS[a as Allergen] ?? a).join(', ')} />}
          {i.notes && <p className="text-choco-700 pt-1">{i.notes}</p>}
        </Card>
        {(i.usage.recipes.length > 0 || i.usage.products.length > 0) && (
          <Card className="p-4 space-y-2">
            <div className="section-title">Se usa en</div>
            <div className="flex flex-wrap gap-2">
              {i.usage.recipes.map((r) => (
                <Link key={`r${r.id}`} to={`/recetas/${r.id}`}>
                  <Badge className="text-sm py-1 px-3">📖 {r.name}</Badge>
                </Link>
              ))}
              {i.usage.products.map((p) => (
                <Link key={`p${p.id}`} to={`/catalogo/${p.id}`}>
                  <Badge tone="berry" className="text-sm py-1 px-3">🎂 {p.name}</Badge>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
      <Section title="Movimientos">
        {i.movements.length ? (
          <Card className="divide-y divide-cream-200">
            {i.movements.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">
                    {MOVE_LABELS[m.type] ?? m.type}
                    {m.order_number && (
                      <Link to={`/pedidos/${m.order_id}`} className="text-berry-600">
                        {' '}
                        #{m.order_number}
                      </Link>
                    )}
                  </div>
                  <div className="text-xs text-choco-500">
                    {relDay(m.created_at.slice(0, 10))} · {m.user_name ?? 'Automático'} {m.note ? `· ${m.note}` : ''}
                  </div>
                </div>
                <span className={cx('font-extrabold tabular-nums', m.quantity < 0 ? 'text-red-600' : 'text-emerald-700')}>
                  {m.quantity > 0 ? '+' : ''}
                  {qty(m.quantity, i.unit)}
                </span>
              </div>
            ))}
          </Card>
        ) : (
          <Card className="p-4 text-choco-500">Sin movimientos todavía.</Card>
        )}
      </Section>
      {permissions.inventory && (
        <Button
          variant="danger"
          icon={<Trash2 size={18} />}
          onClick={async () => (await confirm({ title: `¿Borrar «${i.name}»?`, text: 'Si se usa en recetas, solo se archivará.', ok: 'Borrar', danger: true })) && remove.mutate()}
        >
          Borrar artículo
        </Button>
      )}
      <ItemSheet open={editing} onClose={() => setEditing(false)} item={i} />
      {adjust && <AdjustSheet item={i} mode={adjust} onClose={() => setAdjust(null)} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-choco-500">{label}</span>
      <span className="font-semibold text-right">{value}</span>
    </div>
  );
}

function AdjustSheet({ item, mode, onClose }: { item: InventoryItem; mode: 'add' | 'remove' | 'count'; onClose: () => void }) {
  const [value, setValue] = useState<number | null>(mode === 'count' ? item.quantity : null);
  const [waste, setWaste] = useState(true);
  const [note, setNote] = useState('');
  const run = useAction(
    () => {
      const body =
        mode === 'count'
          ? { set: value, type: 'adjustment', note: note || 'Recuento' }
          : mode === 'add'
            ? { delta: value, type: 'adjustment', note: note || 'Entrada manual' }
            : { delta: -(value ?? 0), type: waste ? 'waste' : 'adjustment', note: note || (waste ? 'Merma' : 'Salida manual') };
      return api(`/inventory/${item.id}/adjust`, { method: 'POST', body });
    },
    { success: 'Stock actualizado', onSuccess: onClose },
  );
  const title = mode === 'add' ? `Añadir ${item.name.toLowerCase()}` : mode === 'remove' ? `Quitar ${item.name.toLowerCase()}` : 'Recontar stock';
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <Button block size="lg" disabled={value === null} loading={run.isPending} onClick={() => run.mutate()}>
          Guardar
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label={mode === 'count' ? `¿Cuánto hay realmente? (${UNIT_LABELS[item.unit]})` : `Cantidad (${UNIT_LABELS[item.unit]})`}>
          <NumberInput value={value} onChange={setValue} suffix={item.unit} autoFocus />
        </Field>
        {mode === 'add' && <p className="text-sm text-choco-500">Si es una compra, mejor regístrala desde «Compras» para que se anote también el gasto.</p>}
        {mode === 'remove' && <Toggle checked={waste} onChange={setWaste} label="Es una merma" hint="Se ha estropeado, caducado o roto." />}
        <Field label="Nota (opcional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

export function ItemSheet({
  open,
  onClose,
  item,
  defaultKind = 'ingredient',
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  item?: InventoryItem;
  defaultKind?: 'ingredient' | 'material';
  onCreated?: (id: number, unit: Unit) => void;
}) {
  const nav = useNavigate();
  const blank = {
    name: '',
    kind: defaultKind,
    unit: (defaultKind === 'ingredient' ? 'kg' : 'ud') as Unit,
    quantity: 0 as number | null,
    min_stock: 0 as number | null,
    cost_per_unit: 0 as number | null,
    pack_size: null as number | null,
    supplier: '',
    allergens: [] as string[],
    notes: '',
  };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (!open) return;
    setF(
      item
        ? {
            name: item.name,
            kind: item.kind,
            unit: item.unit,
            quantity: item.quantity,
            min_stock: item.min_stock,
            cost_per_unit: item.cost_per_unit ?? 0,
            pack_size: item.pack_size,
            supplier: item.supplier ?? '',
            allergens: item.allergens,
            notes: item.notes ?? '',
          }
        : blank,
    );
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(
    () => {
      const body = { ...f, quantity: f.quantity ?? 0, min_stock: f.min_stock ?? 0, cost_per_unit: f.cost_per_unit ?? 0 };
      return item ? api(`/inventory/${item.id}`, { method: 'PUT', body }) : api('/inventory', { method: 'POST', body });
    },
    {
      success: item ? 'Artículo guardado' : 'Artículo creado',
      onSuccess: (r: { id: number }) => {
        onClose();
        if (!item) {
          if (onCreated) onCreated(r.id, f.unit);
          else nav(`/inventario/${r.id}`);
        }
      },
    },
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item ? 'Editar artículo' : 'Nuevo artículo'}
      footer={
        <Button block size="lg" disabled={!f.name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
          Guardar
        </Button>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={f.kind}
          onChange={(kind) => setF({ ...f, kind })}
          options={[
            { value: 'ingredient', label: '🥚 Ingrediente' },
            { value: 'material', label: '📦 Material' },
          ]}
        />
        <Field label="Nombre">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={f.kind === 'ingredient' ? 'Ej. Harina de trigo' : 'Ej. Caja tarta grande'} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Se mide en">
            <Select value={f.unit} onChange={(v) => setF({ ...f, unit: v as Unit })} options={UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] }))} />
          </Field>
          <Field label="Cantidad actual">
            <NumberInput value={f.quantity} onChange={(quantity) => setF({ ...f, quantity })} suffix={f.unit} />
          </Field>
          <Field label="Stock mínimo" hint="Te avisará al bajar de aquí.">
            <NumberInput value={f.min_stock} onChange={(min_stock) => setF({ ...f, min_stock })} suffix={f.unit} />
          </Field>
          <Field label={`Precio por ${f.unit}`}>
            <NumberInput value={f.cost_per_unit} onChange={(cost_per_unit) => setF({ ...f, cost_per_unit })} suffix="€" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Proveedor">
            <Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
          </Field>
          <Field label="Tamaño del envase" hint={`Para redondear la compra (ej. 12 huevos).`}>
            <NumberInput value={f.pack_size} onChange={(pack_size) => setF({ ...f, pack_size })} suffix={f.unit} />
          </Field>
        </div>
        {f.kind === 'ingredient' && (
          <div>
            <span className="label">Alérgenos que contiene</span>
            <div className="flex flex-wrap gap-2">
              {ALLERGENS.map((a) => (
                <Chip key={a} tone="red" active={f.allergens.includes(a)} onClick={() => setF({ ...f, allergens: f.allergens.includes(a) ? f.allergens.filter((x) => x !== a) : [...f.allergens, a] })}>
                  {ALLERGEN_LABELS[a]}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <Field label="Notas">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        {!item && f.quantity ? <p className="text-sm text-choco-500 flex items-center gap-1"><PackagePlus size={16} /> Se registrará {num(f.quantity)} {f.unit} como stock inicial.</p> : null}
      </div>
    </Sheet>
  );
}
