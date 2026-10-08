import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { createPortal } from 'react-dom';
import { ArrowLeft, BookOpen, Package, Wheat } from 'lucide-react';
import { useApi } from '../lib/api';
import { qty, money } from '../lib/format';
import type { OrderSummary } from '../lib/types';
import { OrderCard } from './OrderCard';
import { Loading, SearchInput, Thumb } from './ui';

interface Results {
  orders: OrderSummary[];
  customers: { id: number; name: string; phone: string | null; orders_count: number }[];
  products: { id: number; name: string; category: string; photo_id: number | null; base_price: number }[];
  recipes: { id: number; name: string; photo_id: number | null; servings: number }[];
  items: { id: number; name: string; kind: string; quantity: number; unit: string }[];
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const res = useApi<Results>(open && debounced ? `/search?q=${encodeURIComponent(debounced)}` : null);
  if (!open) return null;
  const close = () => {
    onClose();
    setQ('');
  };
  const r = res.data;
  const empty = r && !r.orders.length && !r.customers.length && !r.products.length && !r.recipes.length && !r.items.length;
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-cream-100 flex flex-col anim-fade" role="dialog" aria-modal="true" aria-label="Buscador">
      <div className="flex items-center gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] border-b border-cream-200 bg-white">
        <button type="button" className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-cream-200" onClick={onClose} aria-label="Cerrar">
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 max-w-3xl">
          <SearchInput value={q} onChange={setQ} autoFocus placeholder="Cliente, teléfono, nº de pedido, producto o fecha (12/10)" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div
          className="max-w-3xl mx-auto p-4 space-y-5"
          onClick={(e) => {
            // Al pulsar un resultado (enlace), se cierra el buscador; la navegación la hace el enlace.
            if ((e.target as HTMLElement).closest('a')) close();
          }}
        >
          {!debounced && (
            <p className="text-center text-choco-500 pt-10">
              Escribe el nombre de un cliente, su teléfono, el número de pedido (#12), un producto o una fecha (12/10).
            </p>
          )}
          {res.isLoading && <Loading text="Buscando…" />}
          {empty && <p className="text-center text-choco-500 pt-10">No hay resultados para «{debounced}».</p>}
          {r && r.orders.length > 0 && (
            <Group title="Pedidos">
              {r.orders.map((o) => (
                <OrderCard key={o.id} o={o} compact />
              ))}
            </Group>
          )}
          {r && r.customers.length > 0 && (
            <Group title="Clientes">
              <div className="card divide-y divide-cream-200">
                {r.customers.map((c) => (
                  <Link key={c.id} to={`/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-berry-100 to-caramel-100 ring-1 ring-inset ring-berry-100 text-berry-700 font-display text-[18px] flex items-center justify-center">{c.name.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-sm text-choco-500">{c.phone ?? 'Sin teléfono'} · {c.orders_count} pedidos</div>
                    </div>
                  </Link>
                ))}
              </div>
            </Group>
          )}
          {r && r.products.length > 0 && (
            <Group title="Catálogo">
              <div className="card divide-y divide-cream-200">
                {r.products.map((p) => (
                  <Link key={p.id} to={`/catalogo/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50">
                    <Thumb photoId={p.photo_id} category={p.category} className="h-10 w-10 text-[10px]" />
                    <div className="flex-1 font-medium">{p.name}</div>
                    {p.base_price > 0 && <span className="text-choco-500">{money(p.base_price)}</span>}
                  </Link>
                ))}
              </div>
            </Group>
          )}
          {r && r.recipes.length > 0 && (
            <Group title="Recetas">
              <div className="card divide-y divide-cream-200">
                {r.recipes.map((p) => (
                  <Link key={p.id} to={`/recetas/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50">
                    <Thumb photoId={p.photo_id} icon={BookOpen} className="h-10 w-10" />
                    <div className="flex-1 font-medium">{p.name}</div>
                    <span className="text-choco-500 text-sm">{p.servings} raciones</span>
                  </Link>
                ))}
              </div>
            </Group>
          )}
          {r && r.items.length > 0 && (
            <Group title="Inventario">
              <div className="card divide-y divide-cream-200">
                {r.items.map((i) => (
                  <Link key={i.id} to={`/inventario/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50">
                    <span className="h-10 w-10 rounded-lg border border-cream-200 bg-cream-50 flex items-center justify-center text-choco-400">{i.kind === 'ingredient' ? <Wheat size={18} strokeWidth={1.75} /> : <Package size={18} strokeWidth={1.75} />}</span>
                    <div className="flex-1 font-medium">{i.name}</div>
                    <span className="text-choco-500 text-sm">{qty(i.quantity, i.unit)}</span>
                  </Link>
                ))}
              </div>
            </Group>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="section-title px-1">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
