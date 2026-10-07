import { useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, Clock, Flame, Plus, Users } from 'lucide-react';
import { useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, num } from '../lib/format';
import { Button, Empty, ErrorBox, Fab, Loading, PageHeader, SearchInput, Thumb } from '../components/ui';

export interface RecipeSummary {
  id: number;
  name: string;
  category: string | null;
  photo_id: number | null;
  servings: number;
  prep_minutes: number | null;
  bake_minutes: number | null;
  temperature: number | null;
  ingredients_count: number;
  allergens: string[];
  cost: number | null;
  recommended_price: number | null;
}

export function Recipes() {
  const { permissions } = useAuth();
  const [q, setQ] = useState('');
  const res = useApi<RecipeSummary[]>('/recipes');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = (res.data ?? []).filter((r) => !q || norm(r.name).includes(norm(q)) || norm(r.category ?? '').includes(norm(q)));
  const groups = new Map<string, RecipeSummary[]>();
  for (const r of list) {
    const k = r.category || 'Otras';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return (
    <div>
      <PageHeader
        title="Recetas"
        back="/mas"
        actions={
          permissions.catalog && (
            <Link to="/recetas/nueva" className="hidden lg:block">
              <Button icon={<Plus size={18} />}>Nueva receta</Button>
            </Link>
          )
        }
      />
      <div className="mb-4">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar receta" />
      </div>
      {res.isLoading ? (
        <Loading />
      ) : res.error ? (
        <ErrorBox error={res.error} retry={res.refetch} />
      ) : !list.length ? (
        <Empty icon={BookOpen} title="No hay recetas" text="Guarda aquí tus recetas: la aplicación calculará cantidades, costes y la lista de la compra." />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([cat, rs]) => (
            <section key={cat} className="space-y-2">
              <h2 className="section-title px-1">{cat}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {rs.map((r) => (
                  <Link key={r.id} to={`/recetas/${r.id}`} className="card overflow-hidden active:scale-[0.98] transition">
                    <Thumb photoId={r.photo_id} icon={BookOpen} className="h-28 w-full" rounded="rounded-none" />
                    <div className="p-3">
                      <div className="font-semibold leading-tight">{r.name}</div>
                      <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-choco-500 font-semibold">
                        <span className="inline-flex items-center gap-0.5">
                          <Users size={12} /> {num(r.servings)}
                        </span>
                        {(r.prep_minutes || r.bake_minutes) && (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock size={12} /> {(r.prep_minutes ?? 0) + (r.bake_minutes ?? 0)} min
                          </span>
                        )}
                        {r.temperature && (
                          <span className="inline-flex items-center gap-0.5">
                            <Flame size={12} /> {r.temperature}°
                          </span>
                        )}
                      </div>
                      {r.cost !== null && <div className="text-sm font-medium text-choco-700 mt-1">Coste {money(r.cost)}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {permissions.catalog && <Fab to="/recetas/nueva" label="Nueva receta" />}
    </div>
  );
}
