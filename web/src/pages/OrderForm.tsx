import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Copy, Plus, Store, Trash2, TriangleAlert, Truck, UserRound, X } from 'lucide-react';
import {
  ALLERGEN_LABELS,
  ALLERGENS,
  CATEGORY_LABELS,
  COMMON_ALLERGENS,
  PRODUCT_CATEGORIES,
  type Allergen,
} from '@shared/constants';
import { api, useAction, useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { addDays, money, relDay, today } from '../lib/format';
import type { Customer, Extra, Order, OrderLine, OrderSummary, Product } from '../lib/types';
import { PhotoPicker } from '../components/PhotoPicker';
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipInput,
  Collapsible,
  cx,
  ErrorBox,
  Field,
  Input,
  Loading,
  NumberInput,
  PageHeader,
  SearchInput,
  Segmented,
  Sheet,
  Stepper,
  Textarea,
  Thumb,
  Toggle,
} from '../components/ui';

type Mode = 'order' | 'quote';

interface Line extends OrderLine {
  key: string;
  manualPrice: boolean;
  /** Lo que cuesta este producto (total de la línea). */
  price: number;
}

interface FormState {
  customer_id: number | null;
  customer_name: string;
  customer_phone: string;
  save_customer: boolean;
  order_date: string;
  delivery_date: string;
  delivery_time: string;
  production_date: string;
  delivery_type: 'pickup' | 'delivery';
  delivery_address: string;
  delivery_fee: number;
  payment_method: string | null;
  allergens: string[];
  notes: string;
  items: Line[];
  image_ids: number[];
  confirmed: boolean;
  valid_until: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
let keySeq = 0;
const newKey = () => `l${++keySeq}`;

export function autoPrice(p: Product, sizeId: number | null, servings: number | null) {
  const size = p.sizes.find((s) => s.id === sizeId);
  if (size) {
    if (servings && servings !== size.servings && p.pricing === 'serving') return round2((size.price / size.servings) * servings);
    return size.price;
  }
  if (p.pricing === 'serving') return round2(p.base_price * (servings || p.servings));
  return p.base_price;
}

const extrasSum = (l: { extras: Extra[] }) => l.extras.reduce((s, e) => s + e.price, 0);

/** Precio de catálogo de la línea entera (cantidad, tamaño, raciones y extras). */
export function catalogPrice(p: Product, l: Pick<Line, 'size_id' | 'servings' | 'quantity' | 'extras'>) {
  return round2(autoPrice(p, l.size_id, l.servings) * l.quantity + extrasSum(l));
}

function lineFromProduct(p: Product): Line {
  const size = p.sizes[0] ?? null;
  const servings = size ? size.servings : p.servings;
  const unit_price = autoPrice(p, size?.id ?? null, servings);
  return {
    key: newKey(),
    manualPrice: false,
    product_id: p.id,
    product_name: p.name,
    size_id: size?.id ?? null,
    quantity: 1,
    servings,
    flavor: p.flavors.length === 1 ? p.flavors[0] : null,
    filling: null,
    coverage: null,
    decoration: null,
    custom_text: null,
    notes: null,
    extras: [],
    unit_price,
    price: unit_price,
  };
}

function lineFromExisting(l: OrderLine, keepId: boolean): Line {
  return {
    key: newKey(),
    manualPrice: true,
    id: keepId ? l.id : undefined,
    product_id: l.product_id,
    product_name: l.product_name,
    size_id: l.size_id,
    quantity: l.quantity,
    servings: l.servings,
    flavor: l.flavor,
    filling: l.filling,
    coverage: l.coverage,
    decoration: l.decoration,
    custom_text: l.custom_text,
    notes: l.notes,
    extras: l.extras ?? [],
    unit_price: l.unit_price,
    price: l.line_total ?? round2(l.unit_price * l.quantity + extrasSum({ extras: l.extras ?? [] })),
  };
}

export function OrderForm({ mode }: { mode: Mode }) {
  const { id } = useParams();
  const editing = !!id;
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { settings } = useAuth();
  const products = useApi<Product[]>('/products');
  const existing = useApi<Order & { valid_until?: string; date?: string }>(editing ? (mode === 'order' ? `/orders/${id}` : `/quotes/${id}`) : null, {
    staleTime: Infinity,
  });

  const [f, setF] = useState<FormState | null>(null);
  const [picker, setPicker] = useState(false);

  // Estado inicial: nuevo, edición, repetir pedido o desde un cliente/producto.
  useEffect(() => {
    if (f || !products.data) return;
    const base: FormState = {
      customer_id: null,
      customer_name: '',
      customer_phone: '',
      save_customer: true,
      order_date: today(),
      delivery_date: params.get('fecha') || (mode === 'order' ? addDays(today(), 1) : ''),
      delivery_time: '',
      production_date: '',
      delivery_type: 'pickup',
      delivery_address: '',
      delivery_fee: settings.default_delivery_fee ?? 0,
      payment_method: null,
      allergens: [],
      notes: '',
      items: [],
      image_ids: [],
      confirmed: false,
      valid_until: '',
    };
    if (editing) {
      const o = existing.data;
      if (!o) return;
      setF({
        ...base,
        customer_id: o.customer_id,
        customer_name: o.customer_name,
        customer_phone: o.customer_phone ?? '',
        order_date: o.order_date ?? o.date ?? today(),
        delivery_date: o.delivery_date ?? '',
        delivery_time: o.delivery_time ?? '',
        production_date: o.production_date ?? '',
        delivery_type: o.delivery_type,
        delivery_address: o.delivery_address ?? '',
        delivery_fee: o.delivery_fee || (settings.default_delivery_fee ?? 0),
        payment_method: o.payment_method ?? null,
        allergens: o.allergens,
        notes: o.notes ?? '',
        items: o.items.map((l) => lineFromExisting(l, true)),
        image_ids: o.images ?? [],
        valid_until: o.valid_until ?? '',
      });
      return;
    }
    const productId = Number(params.get('producto'));
    const p = products.data.find((x) => x.id === productId);
    if (p) base.items = [lineFromProduct(p)];
    const repeat = Number(params.get('repetir'));
    const customerId = Number(params.get('cliente'));
    (async () => {
      if (repeat) {
        const o = await api<Order>(`/orders/${repeat}`).catch(() => null);
        if (o) {
          Object.assign(base, {
            customer_id: o.customer_id,
            customer_name: o.customer_name,
            customer_phone: o.customer_phone ?? '',
            delivery_type: o.delivery_type,
            delivery_address: o.delivery_address ?? '',
            allergens: o.allergens,
            items: o.items.map((l) => lineFromExisting(l, false)),
          });
        }
      } else if (customerId) {
        const c = await api<Customer>(`/customers/${customerId}`).catch(() => null);
        if (c) {
          Object.assign(base, {
            customer_id: c.id,
            customer_name: c.name,
            customer_phone: c.phone ?? '',
            delivery_address: c.address ?? '',
            allergens: c.allergens,
          });
        }
      }
      setF(base);
    })();
  }, [products.data, existing.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const productMap = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);

  const save = useAction(
    async (form: FormState) => {
      const items = form.items.map((l) => ({
        id: l.id,
        product_id: l.product_id,
        product_name: l.product_name,
        size_id: l.size_id,
        quantity: l.quantity,
        servings: l.servings,
        flavor: l.flavor,
        filling: l.filling,
        coverage: l.coverage,
        decoration: l.decoration,
        custom_text: l.custom_text,
        notes: l.notes,
        extras: l.extras,
        line_total: l.price,
      }));
      const common = {
        customer_id: form.customer_id,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim() || null,
        save_customer: form.save_customer,
        delivery_time: form.delivery_time || null,
        delivery_type: form.delivery_type,
        delivery_address: form.delivery_address || null,
        delivery_fee: form.delivery_fee,
        discount: 0,
        allergens: form.allergens,
        notes: form.notes || null,
        items,
      };
      if (mode === 'quote') {
        const body = { ...common, date: form.order_date, valid_until: form.valid_until || undefined, delivery_date: form.delivery_date || null };
        return editing ? api(`/quotes/${id}`, { method: 'PUT', body }) : api('/quotes', { method: 'POST', body });
      }
      const body = {
        ...common,
        order_date: form.order_date,
        delivery_date: form.delivery_date,
        production_date: form.production_date || null,
        payment_method: form.payment_method,
        image_ids: form.image_ids,
        ...(editing
          ? {}
          : {
              status: form.confirmed ? 'confirmado' : 'nuevo',
            }),
      };
      return editing ? api(`/orders/${id}`, { method: 'PUT', body }) : api('/orders', { method: 'POST', body });
    },
    {
      success: (r: any) =>
        mode === 'quote' ? (editing ? 'Presupuesto guardado' : `Presupuesto #${r.number} creado`) : editing ? 'Pedido guardado' : `Pedido #${r.number} creado y añadido al calendario`,
      onSuccess: (r: any) => nav(mode === 'quote' ? `/presupuestos/${r.id}` : `/pedidos/${r.id}`, { replace: true }),
    },
  );

  if (products.error) return <ErrorBox error={products.error} retry={products.refetch} />;
  if (existing.error) return <ErrorBox error={existing.error} />;
  if (!f) return <Loading />;

  const set = (patch: Partial<FormState>) => setF((s) => ({ ...s!, ...patch }));
  const setLine = (key: string, patch: Partial<Line>) =>
    setF((s) => {
      const items = s!.items.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        const p = next.product_id ? productMap.get(next.product_id) : null;
        // Si el precio era el de catálogo, se recalcula al cambiar cantidad, tamaño o extras.
        if (p && !('price' in patch) && (!next.manualPrice || l.price === catalogPrice(p, l))) {
          next.price = catalogPrice(p, next);
          next.manualPrice = false;
        }
        return next;
      });
      return { ...s!, items };
    });

  const subtotal = round2(f.items.reduce((s, l) => s + l.price, 0));
  const total = round2(subtotal + (f.delivery_type === 'delivery' ? f.delivery_fee : 0));

  // Alérgenos de los productos elegidos que choca con lo que hay que evitar.
  const contains = new Set<string>();
  f.items.forEach((l) => l.product_id && productMap.get(l.product_id)?.allergens.forEach((a) => contains.add(a)));
  const clash = f.allergens.filter((a) => contains.has(a));

  const canSave = f.customer_name.trim() && f.items.length > 0 && (mode === 'quote' || f.delivery_date);
  const title = mode === 'quote' ? (editing ? `Editar presupuesto` : 'Nuevo presupuesto') : editing ? `Editar pedido #${existing.data?.number}` : 'Nuevo pedido';

  return (
    <div className="pb-24">
      <PageHeader title={title} back />
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save.mutate(f);
        }}
      >
        {/* Cliente */}
        <FormSection n={1} title="Cliente">
          <CustomerPicker f={f} set={set} onRepeat={(items) => set({ items: [...f.items, ...items] })} mode={mode} />
        </FormSection>

        {/* Entrega */}
        <FormSection n={2} title={mode === 'quote' ? 'Entrega (si ya se sabe)' : 'Entrega o recogida'}>
          <div className="space-y-4">
            <div>
              <span className="label">Día</span>
              <div className="flex flex-wrap gap-2 mb-2">
                {[0, 1, 2].map((d) => {
                  const date = addDays(today(), d);
                  return (
                    <Chip key={d} active={f.delivery_date === date} onClick={() => set({ delivery_date: date })}>
                      {relDay(date)}
                    </Chip>
                  );
                })}
              </div>
              <Input type="date" value={f.delivery_date} onChange={(e) => set({ delivery_date: e.target.value })} required={mode === 'order'} />
            </div>
            <div>
              <span className="label">Hora</span>
              <div className="flex flex-wrap gap-2 mb-2">
                {['10:00', '12:00', '13:30', '17:00', '19:00'].map((t) => (
                  <Chip key={t} active={f.delivery_time === t} onClick={() => set({ delivery_time: f.delivery_time === t ? '' : t })}>
                    {t}
                  </Chip>
                ))}
              </div>
              <Input type="time" value={f.delivery_time} onChange={(e) => set({ delivery_time: e.target.value })} />
            </div>
            <Segmented
              value={f.delivery_type}
              onChange={(v) => set({ delivery_type: v })}
              options={[
                { value: 'pickup', label: <span className="inline-flex items-center gap-1.5"><Store size={18} /> Recoge en tienda</span> },
                { value: 'delivery', label: <span className="inline-flex items-center gap-1.5"><Truck size={18} /> A domicilio</span> },
              ]}
            />
            {f.delivery_type === 'delivery' && (
              <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                <Field label="Dirección de entrega">
                  <Input value={f.delivery_address} onChange={(e) => set({ delivery_address: e.target.value })} placeholder="Calle, número, piso…" />
                </Field>
                <Field label="Gastos de envío">
                  <NumberInput value={f.delivery_fee} onChange={(v) => set({ delivery_fee: v ?? 0 })} suffix="€" />
                </Field>
              </div>
            )}
          </div>
        </FormSection>

        {/* Productos */}
        <FormSection n={3} title="Qué quiere">
          <div className="space-y-3">
            {f.items.map((l) => (
              <LineEditor
                key={l.key}
                line={l}
                product={l.product_id ? productMap.get(l.product_id) : undefined}
                onChange={(patch) => setLine(l.key, patch)}
                onRemove={() => set({ items: f.items.filter((x) => x.key !== l.key) })}
              />
            ))}
            <Button variant="outline" block size="lg" icon={<Plus size={18} />} onClick={() => setPicker(true)} className="border-dashed">
              {f.items.length ? 'Añadir otro producto' : 'Elegir producto'}
            </Button>
          </div>
        </FormSection>

        {/* Alérgenos */}
        <FormSection n={4} title="Alergias e intolerancias">
          <AllergenPicker value={f.allergens} onChange={(allergens) => set({ allergens })} />
          {clash.length > 0 && (
            <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3 text-red-700 font-semibold flex gap-2">
              <TriangleAlert className="shrink-0" />
              <span>
                ¡Atención! Los productos elegidos llevan: {clash.map((a) => ALLERGEN_LABELS[a as Allergen]).join(', ').toLowerCase()}.
              </span>
            </div>
          )}
        </FormSection>

        {mode === 'order' && (
          <FormSection n={5} title="Foto de referencia">
            <PhotoPicker value={f.image_ids} onChange={(image_ids) => set({ image_ids })} label="Foto" />
          </FormSection>
        )}

        <FormSection n={mode === 'order' ? 6 : 5} title="Notas">
          <Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Cualquier detalle importante: quién recoge, horario, sorpresas…" />
        </FormSection>

        <Collapsible title="Más opciones">
          <div className="space-y-4">
            {mode === 'order' && !editing && (
              <Toggle
                checked={f.confirmed}
                onChange={(confirmed) => set({ confirmed })}
                label="El pedido ya está confirmado"
                hint="Se calcularán los ingredientes y aparecerá en producción cuando toque."
              />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={mode === 'order' ? 'Fecha del pedido' : 'Fecha del presupuesto'}>
                <Input type="date" value={f.order_date} onChange={(e) => set({ order_date: e.target.value })} />
              </Field>
              {mode === 'order' ? (
                <Field label="Día de producción" hint={`Si lo dejas vacío: ${settings.production_lead_days ?? 1} día(s) antes de la entrega.`}>
                  <Input type="date" value={f.production_date} onChange={(e) => set({ production_date: e.target.value })} />
                </Field>
              ) : (
                <Field label="Válido hasta" hint={`Por defecto: ${settings.quote_validity_days ?? 15} días.`}>
                  <Input type="date" value={f.valid_until} onChange={(e) => set({ valid_until: e.target.value })} />
                </Field>
              )}
            </div>
            {!f.customer_id && (
              <Toggle checked={f.save_customer} onChange={(save_customer) => set({ save_customer })} label="Guardar en mi lista de clientes" />
            )}
          </div>
        </Collapsible>

        {/* Barra fija de guardar */}
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:bottom-0 lg:left-64 z-30 bg-white/95 backdrop-blur border-t border-cream-200 no-print">
          <div className="mx-auto max-w-5xl px-4 lg:px-8 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-choco-500">Total</div>
              <div className="text-lg font-semibold text-choco-900 tabular-nums leading-tight">{money(total)}</div>
            </div>
            <Button type="submit" size="lg" loading={save.isPending} disabled={!canSave} className="min-w-44">
              {mode === 'quote' ? 'Guardar presupuesto' : editing ? 'Guardar cambios' : 'Guardar pedido'}
            </Button>
          </div>
        </div>
      </form>

      <ProductPickerSheet
        open={picker}
        onClose={() => setPicker(false)}
        products={products.data ?? []}
        onPick={(line) => {
          set({ items: [...f.items, line] });
          setPicker(false);
        }}
      />
    </div>
  );
}

function FormSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 lg:p-5">
      <h2 className="flex items-center gap-2.5 font-semibold text-[15px] text-choco-900 mb-4">
        <span className="h-6 w-6 rounded-md border border-cream-200 bg-cream-50 text-choco-500 text-xs font-medium flex items-center justify-center tabular-nums">{n}</span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cliente: buscar uno existente o escribir uno nuevo
// ---------------------------------------------------------------------------

function CustomerPicker({
  f,
  set,
  onRepeat,
  mode,
}: {
  f: FormState;
  set: (p: Partial<FormState>) => void;
  onRepeat: (items: Line[]) => void;
  mode: Mode;
}) {
  const [focused, setFocused] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(f.customer_name.trim()), 200);
    return () => clearTimeout(t);
  }, [f.customer_name]);
  const matches = useApi<Customer[]>(!f.customer_id && q.length >= 2 ? `/customers?q=${encodeURIComponent(q)}` : null);
  const detail = useApi<Customer & { orders: OrderSummary[]; favorites: { name: string; times: number }[] }>(
    f.customer_id ? `/customers/${f.customer_id}` : null,
  );

  if (f.customer_id) {
    const c = detail.data;
    const last = c?.orders.filter((o) => o.status !== 'cancelado').slice(0, 3) ?? [];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-lg bg-cream-50 border border-cream-200 p-3">
          <div className="h-10 w-10 rounded-full bg-white border border-cream-200 text-choco-500 flex items-center justify-center">
            <UserRound />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{f.customer_name}</div>
            <div className="text-sm text-choco-500">{f.customer_phone || 'Sin teléfono'} {c ? `· ${c.orders_count} pedidos` : ''}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => set({ customer_id: null, customer_name: '', customer_phone: '' })}>
            Cambiar
          </Button>
        </div>
        {c && c.allergens.length > 0 && (
          <div className="rounded-xl bg-red-50 text-red-700 p-2.5 text-sm font-medium flex gap-2">
            <TriangleAlert size={18} /> Alergias: {c.allergens.map((a) => ALLERGEN_LABELS[a as Allergen] ?? a).join(', ')}
          </div>
        )}
        {c?.preferences && <div className="text-sm text-choco-700 bg-cream-100 rounded-lg p-2.5">{c.preferences}</div>}
        {mode === 'order' && last.length > 0 && (
          <div>
            <div className="text-sm font-medium text-choco-500 mb-1.5">Sus últimos pedidos:</div>
            <div className="space-y-1.5">
              {last.map((o) => (
                <div key={o.id} className="flex items-center gap-2 text-sm bg-white border border-cream-200 rounded-xl px-3 py-2">
                  <span className="flex-1 min-w-0 truncate">
                    <b>{relDay(o.delivery_date)}</b> · {o.summary}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Copy size={15} />}
                    onClick={async () => {
                      const full = await api<Order>(`/orders/${o.id}`);
                      onRepeat(full.items.map((l) => lineFromExisting(l, false)));
                    }}
                  >
                    Repetir
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const list = matches.data ?? [];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="relative">
        <Field label="Nombre">
          <Input
            value={f.customer_name}
            onChange={(e) => set({ customer_name: e.target.value })}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            placeholder="Busca o escribe un cliente nuevo"
            autoComplete="off"
          />
        </Field>
        {focused && list.length > 0 && (
          <div className="absolute z-20 mt-1 w-full card overflow-hidden shadow-xl">
            {list.slice(0, 6).map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-4 py-3 hover:bg-cream-100 border-b border-cream-200 last:border-0"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  set({
                    customer_id: c.id,
                    customer_name: c.name,
                    customer_phone: c.phone ?? '',
                    delivery_address: f.delivery_address || c.address || '',
                    allergens: f.allergens.length ? f.allergens : c.allergens,
                  });
                  setFocused(false);
                }}
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-choco-500">
                  {c.phone ?? 'Sin teléfono'} · {c.orders_count} pedidos
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <Field label="Teléfono">
        <Input type="tel" inputMode="tel" value={f.customer_phone} onChange={(e) => set({ customer_phone: e.target.value })} placeholder="600 000 000" autoComplete="off" />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Línea de producto
// ---------------------------------------------------------------------------

const CAKE_LIKE = ['tartas', 'tartas_personalizadas', 'cupcakes', 'cheesecakes'];

function LineEditor({
  line,
  product,
  onChange,
  onRemove,
}: {
  line: Line;
  product?: Product;
  onChange: (p: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const cakeLike = !product || CAKE_LIKE.includes(product.category);
  const writable = !product || [...CAKE_LIKE, 'galletas'].includes(product.category);
  const size = product?.sizes.find((s) => s.id === line.size_id);
  const toggleExtra = (e: Extra) =>
    onChange({ extras: line.extras.some((x) => x.name === e.name) ? line.extras.filter((x) => x.name !== e.name) : [...line.extras, e] });

  return (
    <div className="rounded-xl border-2 border-cream-200 bg-cream-50 p-3.5 space-y-3.5">
      <div className="flex items-center gap-3">
        <Thumb photoId={product?.photo_id} category={product?.category} className="h-14 w-14 shrink-0 text-xs" />
        <div className="flex-1 min-w-0">
          {product ? (
            <div className="font-semibold text-base leading-tight">{line.product_name}</div>
          ) : (
            <Input value={line.product_name} onChange={(e) => onChange({ product_name: e.target.value })} placeholder="Nombre del producto" />
          )}
          {product && product.allergens.length > 0 && (
            <div className="text-xs text-choco-500 mt-0.5">Contiene: {product.allergens.map((a) => ALLERGEN_LABELS[a as Allergen] ?? a).join(', ').toLowerCase()}</div>
          )}
        </div>
        <button type="button" aria-label="Quitar producto" onClick={onRemove} className="h-10 w-10 flex items-center justify-center rounded-full text-choco-400 hover:bg-red-50 hover:text-red-600">
          <Trash2 size={20} />
        </button>
      </div>

      {product && product.sizes.length > 0 && (
        <div>
          <span className="label">Tamaño</span>
          <div className="flex flex-wrap gap-2">
            {product.sizes.map((s) => (
              <Chip key={s.id} active={line.size_id === s.id} onClick={() => onChange({ size_id: s.id, servings: s.servings })}>
                {s.name} · {money(s.price)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <span className="label">Cantidad</span>
          <Stepper value={line.quantity} min={1} onChange={(quantity) => onChange({ quantity })} label="Cantidad" />
        </div>
        {(cakeLike || product?.pricing === 'serving') && (
          <Field label="Personas / raciones" className="w-40">
            <NumberInput value={line.servings} onChange={(servings) => onChange({ servings })} integer placeholder={size ? String(size.servings) : ''} />
          </Field>
        )}
      </div>

      <Field label="Sabor" group>
        <ChipInput options={product?.flavors ?? []} value={line.flavor} onChange={(flavor) => onChange({ flavor })} />
      </Field>
      {cakeLike && (
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Relleno" group>
            <ChipInput options={product?.fillings ?? []} value={line.filling} onChange={(filling) => onChange({ filling })} />
          </Field>
          <Field label="Cobertura" group>
            <ChipInput options={product?.coverings ?? []} value={line.coverage} onChange={(coverage) => onChange({ coverage })} />
          </Field>
        </div>
      )}
      {writable && (
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Decoración">
            <Input value={line.decoration ?? ''} onChange={(e) => onChange({ decoration: e.target.value || null })} placeholder="Colores, temática, figuras…" />
          </Field>
          <Field label="Texto que debe llevar">
            <Input value={line.custom_text ?? ''} onChange={(e) => onChange({ custom_text: e.target.value || null })} placeholder="Ej. ¡Feliz cumple, Lucía!" />
          </Field>
        </div>
      )}
      {product && product.extras.length > 0 && (
        <div>
          <span className="label">Extras</span>
          <div className="flex flex-wrap gap-2">
            {product.extras.map((e) => (
              <Chip key={e.name} active={line.extras.some((x) => x.name === e.name)} onClick={() => toggleExtra(e)}>
                {e.name} +{money(e.price)}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <Field label="Notas de este producto">
        <Input value={line.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || null })} placeholder="Opcional" />
      </Field>

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white border border-cream-200 px-3 py-2.5">
        <span className="font-medium text-choco-700">Precio</span>
        <NumberInput
          value={line.price}
          onChange={(v) => onChange({ price: v ?? 0, manualPrice: true })}
          suffix="€"
          className="max-w-40"
          aria-label="Precio"
        />
        {product && line.manualPrice && line.price !== catalogPrice(product, line) && (
          <button type="button" className="text-sm font-medium text-berry-600" onClick={() => onChange({ manualPrice: false })}>
            Poner precio de catálogo ({money(catalogPrice(product, line))})
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selector de productos del catálogo
// ---------------------------------------------------------------------------

function ProductPickerSheet({
  open,
  onClose,
  products,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  onPick: (l: Line) => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = products.filter((p) => (!cat || p.category === cat) && (!q || norm(p.name).includes(norm(q))));
  const cats = PRODUCT_CATEGORIES.filter((c) => products.some((p) => p.category === c));
  const fromPrice = (p: Product) => (p.sizes.length ? Math.min(...p.sizes.map((s) => s.price)) : p.base_price);
  return (
    <Sheet open={open} onClose={onClose} title="Elige un producto" wide>
      <div className="space-y-3">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar en el catálogo" />
        <div className="scroll-x">
          <Chip active={!cat} onClick={() => setCat('')}>
            Todo
          </Chip>
          {cats.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {list.map((p) => (
            <button key={p.id} type="button" onClick={() => onPick(lineFromProduct(p))} className="card overflow-hidden text-left active:scale-[0.98] transition">
              <Thumb photoId={p.photo_id} category={p.category} className="h-24 w-full text-sm" rounded="rounded-none" />
              <div className="p-2.5">
                <div className="font-medium leading-tight">{p.name}</div>
                <div className="text-sm text-choco-500">
                  {p.pricing === 'serving' ? `${money(p.base_price)}/ración` : `${p.sizes.length > 1 ? 'desde ' : ''}${money(fromPrice(p))}`}
                </div>
              </div>
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              onPick({
                key: newKey(),
                manualPrice: true,
                product_id: null,
                product_name: q || '',
                size_id: null,
                quantity: 1,
                servings: null,
                flavor: null,
                filling: null,
                coverage: null,
                decoration: null,
                custom_text: null,
                notes: null,
                extras: [],
                unit_price: 0,
                price: 0,
              })
            }
            className={cx('rounded-xl border-2 border-dashed border-cream-300 p-3 flex flex-col items-center justify-center gap-1 text-choco-500 font-medium min-h-36')}
          >
            <Plus size={28} />
            Otro producto
            <span className="text-xs font-semibold">(fuera de catálogo)</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Alérgenos
// ---------------------------------------------------------------------------

export function AllergenPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [all, setAll] = useState(value.some((a) => !COMMON_ALLERGENS.includes(a as Allergen)));
  const list = all ? ALLERGENS : COMMON_ALLERGENS;
  const toggle = (a: string) => onChange(value.includes(a) ? value.filter((x) => x !== a) : [...value, a]);
  return (
    <div>
      <p className="text-sm text-choco-500 mb-2">Marca lo que <b>no puede llevar</b>:</p>
      <div className="flex flex-wrap gap-2">
        {list.map((a) => (
          <Chip key={a} tone="red" active={value.includes(a)} onClick={() => toggle(a)}>
            {value.includes(a) && <X size={14} />}
            {ALLERGEN_LABELS[a]}
          </Chip>
        ))}
        {!all && (
          <Chip onClick={() => setAll(true)}>
            Ver los 14…
          </Chip>
        )}
      </div>
      {value.length === 0 && <Badge className="mt-2">Sin alergias indicadas</Badge>}
    </div>
  );
}
