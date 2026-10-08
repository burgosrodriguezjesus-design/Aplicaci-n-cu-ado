import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { MORE } from '../components/Layout';
import { PageHeader, TintIcon, type Tint } from '../components/ui';

const TINT: Record<string, Tint> = {
  '/clientes': 'sky',
  '/recetas': 'caramel',
  '/inventario': 'cocoa',
  '/compras': 'sage',
  '/finanzas': 'rose',
  '/catalogo': 'rose',
  '/presupuestos': 'plum',
  '/avisos': 'caramel',
  '/ajustes': 'cocoa',
};

export function More() {
  const { permissions, businessName } = useAuth();
  const items = MORE.filter((m) => !m.perm || permissions[m.perm]);
  return (
    <div className="space-y-5">
      <PageHeader title="Más" subtitle={businessName} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((m) => (
          <Link
            key={m.to}
            to={m.to}
            className="card group relative p-4 flex flex-col gap-3 hover:shadow-[var(--shadow-lift)] hover:-translate-y-0.5 transition"
          >
            <TintIcon icon={m.icon} tint={TINT[m.to] ?? 'cocoa'} />
            <span>
              <span className="block font-display text-[18px] leading-tight text-choco-900">{m.label}</span>
              <span className="block text-[12px] text-choco-500 mt-0.5 line-clamp-2">{m.hint}</span>
            </span>
            <ArrowUpRight size={16} className="absolute top-4 right-4 text-choco-300 group-hover:text-berry-500 transition" />
          </Link>
        ))}
      </div>
    </div>
  );
}
