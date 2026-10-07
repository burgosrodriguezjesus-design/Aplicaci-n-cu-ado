import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { MORE } from '../components/Layout';
import { PageHeader } from '../components/ui';

export function More() {
  const { permissions, businessName } = useAuth();
  const items = MORE.filter((m) => !m.perm || permissions[m.perm]);
  return (
    <div className="space-y-5">
      <PageHeader title="Más" subtitle={businessName} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((m) => (
          <Link key={m.to} to={m.to} className="card p-4 flex flex-col gap-2 active:scale-[0.98] transition hover:border-berry-200">
            <span className="text-4xl">{m.emoji}</span>
            <span className="font-extrabold text-lg flex items-center justify-between">
              {m.label}
              <ChevronRight size={18} className="text-choco-300" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
