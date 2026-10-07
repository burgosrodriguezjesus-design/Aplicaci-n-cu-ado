import { useState, type FormEvent } from 'react';
import { CakeSlice, Link2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Input } from '../components/ui';

/** Primera vez en este dispositivo: crear su pastelería o abrir una que ya tiene. */
export function Welcome() {
  const { refresh, linkError } = useAuth();
  const [mode, setMode] = useState<'create' | 'link'>(linkError ? 'link' : 'create');
  const [f, setF] = useState({ business_name: '', name: '' });
  const [key, setKey] = useState('');
  const [error, setError] = useState(linkError);
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setLoading(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    run(() => api('/auth/create', { method: 'POST', body: f }));
  };
  const enter = (e: FormEvent) => {
    e.preventDefault();
    run(() => api('/auth/enter', { method: 'POST', body: { key } }));
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-cream-100">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <span className="h-10 w-10 rounded-lg bg-choco-900 text-white flex items-center justify-center mb-5">
            <CakeSlice size={20} strokeWidth={1.75} />
          </span>
          <h1 className="text-[22px] font-semibold text-choco-900">{mode === 'create' ? 'Crea tu pastelería' : 'Abrir mi pastelería'}</h1>
          <p className="text-sm text-choco-500 mt-1">
            {mode === 'create'
              ? 'Pedidos, producción, recetas, inventario y finanzas en un solo sitio. Sin registro ni contraseña.'
              : 'Pega el enlace de acceso que guardaste.'}
          </p>
        </div>
        <div className="card p-5">
          {mode === 'create' ? (
            <form onSubmit={create} className="space-y-4">
              <Field label="Nombre de tu pastelería">
                <Input value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} placeholder="Ej. Dulces de Ana" autoFocus />
              </Field>
              <Field label="Tu nombre" hint="Opcional.">
                <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej. Ana" />
              </Field>
              {error && <p className="text-red-600 font-semibold text-sm">{error}</p>}
              <Button type="submit" block size="lg" loading={loading} disabled={!f.business_name.trim()}>
                Empezar
              </Button>
            </form>
          ) : (
            <form onSubmit={enter} className="space-y-4">
              <Field label="Enlace de acceso" hint="Lo encuentras en Configuración → «Usarla en otro móvil u ordenador» del dispositivo donde ya la usas.">
                <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="https://…/entrar#…" autoCapitalize="none" autoFocus />
              </Field>
              {error && <p className="text-red-600 font-semibold text-sm">{error}</p>}
              <Button type="submit" block size="lg" loading={loading} disabled={!key.trim()}>
                Abrir
              </Button>
            </form>
          )}
        </div>
        <button
          type="button"
          className="mt-5 w-full flex items-center justify-center gap-2 text-sm font-medium text-choco-500 hover:text-choco-900"
          onClick={() => {
            setMode(mode === 'create' ? 'link' : 'create');
            setError('');
          }}
        >
          {mode === 'create' ? (
            <>
              <Link2 size={15} /> Ya tengo una pastelería en otro dispositivo
            </>
          ) : (
            'Crear una pastelería nueva'
          )}
        </button>
      </div>
    </div>
  );
}
