import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BookOpen, CakeSlice, Calculator, Package, Pencil, Plus, TriangleAlert, Wheat } from 'lucide-react';
import { ALLERGEN_LABELS, CATEGORY_LABELS, PRODUCT_CATEGORIES, STAGE_LABELS, type Allergen } from '@shared/constants';
import { useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, num, pct } from '../lib/format';
import type { Product } from '../lib/types';
import { Badge, Button, Card, Chip, cx, Empty, ErrorBox, Fab, Loading, PageHeader, Section, Thumb } from '../components/ui';

export const fromPrice = (p: Product) =>
  p.pricing === 'serving' ? `${money(p.base_price)} / ración` : p.sizes.length ? `${p.sizes.length > 1 ? 'desde ' : ''}${money(Math.min(...p.sizes.map((s) => s.price)))}` : money(p.base_price);

export function Catalog() {
  const { permissions } = useAuth();
  const [cat, setCat] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const res = useApi<Product[]>(`/products${showInactive ? '?all=1' : ''}`);
  const list = (res.data ?? []).filter((p) => !cat || p.category === cat);
  const cats = PRODUCT_CATEGORIES.filter((c) => (res.data ?? []).some((p) => p.category === c));
  return (
    <div>
      <PageHeader
        title="Catálogo"
        back="/mas"
        actions={
          permissions.catalog && (
            <Link to="/catalogo/nuevo" className="hidden lg:block">
              <Button icon={<Plus size={18} />}>Nuevo producto</Button>
            </Link>
          )
        }
      />
      <div className="scroll-x -mx-4 px-4 mb-4">
        <Chip active={!cat} onClick={() => setCat('')}>
          Todo
        </Chip>
        {cats.map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
            {CATEGORY_LABELS[c]}
          </Chip>
        ))}
        {permissions.catalog && (
          <Chip active={showInactive} onClick={() => setShowInactive(!showInactive)}>
            Ver archivados
          </Chip>
        )}
      </div>
      {res.isLoading ? (
        <Loading />
      ) : res.error ? (
        <ErrorBox error={res.error} retry={res.refetch} />
      ) : !list.length ? (
        <Empty icon={CakeSlice} title="Catálogo vacío" text="Añade tus productos con fotos, tamaños y precios." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {list.map((p) => {
            const c = p.costs?.[Math.min(1, p.costs.length - 1)];
            return (
              <Link key={p.id} to={`/catalogo/${p.id}`} className={cx('card overflow-hidden active:scale-[0.98] transition', !p.active && 'opacity-50')}>
                <Thumb photoId={p.photo_id} category={p.category} className="h-32 w-full text-lg" rounded="rounded-none" />
                <div className="p-3">
                  <div className="text-xs font-medium text-berry-600">{CATEGORY_LABELS[p.category]}</div>
                  <div className="font-semibold leading-tight">{p.name}</div>
                  <div className="text-choco-700 font-semibold mt-0.5">{fromPrice(p)}</div>
                  {c && c.price > 0 && (
                    <div className={cx('text-xs font-medium mt-1', c.margin < 0.3 ? 'text-red-600' : 'text-emerald-700')}>Margen {pct(c.margin)}</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {permissions.catalog && <Fab to="/catalogo/nuevo" label="Nuevo producto" />}
    </div>
  );
}

export function ProductDetail() {
  const { id } = useParams();
  const { permissions } = useAuth();
  const res = useApi<Product>(`/products/${id}`);
  if (res.isLoading) return <Loading />;
  if (res.error || !res.data) return <ErrorBox error={res.error} />;
  const p = res.data;
  return (
    <div className="space-y-5">
      <PageHeader
        back="/catalogo"
        title={p.name}
        subtitle={CATEGORY_LABELS[p.category]}
        actions={
          permissions.catalog && (
            <Link to={`/catalogo/${p.id}/editar`}>
              <Button variant="outline" size="sm" icon={<Pencil size={16} />}>
                Editar
              </Button>
            </Link>
          )
        }
      />
      {!p.active && <Badge tone="amber">Archivado: no aparece al crear pedidos</Badge>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Thumb photoId={p.photo_id} category={p.category} className={p.photo_id ? 'w-full h-64' : 'w-full h-32 lg:h-64 text-2xl'} rounded="rounded-xl" />
        <div className="space-y-4">
          {p.description && <p className="text-lg text-choco-700">{p.description}</p>}
          <Card className="divide-y divide-cream-200">
            {p.sizes.length ? (
              p.sizes.map((s) => (
                <div key={s.id} className="flex justify-between px-4 py-3">
                  <span>
                    <b>{s.name}</b> <span className="text-choco-500 text-sm">· {num(s.servings)} raciones</span>
                  </span>
                  <b className="tabular-nums">{money(s.price)}</b>
                </div>
              ))
            ) : (
              <div className="flex justify-between px-4 py-3">
                <span className="font-medium">Precio</span>
                <b>{p.pricing === 'serving' ? `${money(p.base_price)} por ración` : `${money(p.base_price)} / ${p.unit_label}`}</b>
              </div>
            )}
          </Card>
          <Link to={`/pedidos/nuevo?producto=${p.id}`}>
            <Button block size="lg" icon={<Plus size={22} />}>
              Hacer pedido de este producto
            </Button>
          </Link>
          {permissions.costs && (
            <Link to={`/catalogo/${p.id}/escandallo`} className="block mt-2">
              <Button block variant="secondary" icon={<Calculator size={20} />}>
                Ver coste y margen (escandallo)
              </Button>
            </Link>
          )}
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {[
          ['Sabores', p.flavors],
          ['Rellenos', p.fillings],
          ['Coberturas', p.coverings],
        ].map(
          ([title, list]) =>
            (list as string[]).length > 0 && (
              <Section key={title as string} title={title}>
                <div className="flex flex-wrap gap-2">
                  {(list as string[]).map((x) => (
                    <Badge key={x} className="text-sm py-1 px-3">
                      {x}
                    </Badge>
                  ))}
                </div>
              </Section>
            ),
        )}
        {p.extras.length > 0 && (
          <Section title="Extras">
            <div className="flex flex-wrap gap-2">
              {p.extras.map((e) => (
                <Badge key={e.name} tone="berry" className="text-sm py-1 px-3">
                  {e.name} +{money(e.price)}
                </Badge>
              ))}
            </div>
          </Section>
        )}
      </div>
      {p.allergens.length > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-700 font-semibold flex gap-2">
          <TriangleAlert size={20} className="shrink-0" /> Contiene: {p.allergens.map((a) => ALLERGEN_LABELS[a as Allergen] ?? a).join(', ').toLowerCase()}
        </div>
      )}
      <Section title="Cómo se hace">
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {p.stages.map((s) => (
              <Badge key={s} className="text-sm py-1 px-3">
                {STAGE_LABELS[s]}
              </Badge>
            ))}
          </div>
          {p.components.length > 0 && (
            <ul className="space-y-1">
              {p.components.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span className="text-choco-400 mt-0.5">{c.recipe_id ? <BookOpen size={15} /> : c.kind === 'material' ? <Package size={15} /> : <Wheat size={15} />}</span>
                  {c.recipe_id ? (
                    <Link to={`/recetas/${c.recipe_id}`} className="font-semibold text-berry-600">
                      {c.name}
                    </Link>
                  ) : (
                    <span className="font-semibold">{c.name}</span>
                  )}
                  <span className="text-choco-500 text-sm">
                    {c.recipe_id
                      ? c.quantity !== 1
                        ? `× ${num(c.quantity)} (ajustada a las raciones)`
                        : '(ajustada a las raciones)'
                      : `${num(c.quantity)} ${c.unit}${c.per_serving ? ' por ración' : ` por ${p.unit_label}`}`}
                    {c.size_id && ` · solo ${p.sizes.find((s) => s.id === c.size_id)?.name ?? ''}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </div>
  );
}
