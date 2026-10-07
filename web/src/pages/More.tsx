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
      <div className="card divide-y divide-cream-200 overflow-hidden">
        {items.map((m) => (
          <Link key={m.to} to={m.to} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-cream-50 transition">
            <span className="h-9 w-9 shrink-0 rounded-lg border border-cream-200 bg-cream-50 flex items-center justify-center text-choco-700">
              <m.icon size={18} strokeWidth={1.75} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-choco-900">{m.label}</span>
              <span className="block text-[13px] text-choco-500 truncate">{m.hint}</span>
            </span>
            <ChevronRight size={16} className="text-choco-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}
