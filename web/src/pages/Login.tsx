import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Input, Toggle } from '../components/ui';

function Shell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-gradient-to-b from-berry-50 to-cream-100">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-6xl mb-2">🧁</div>
          <h1 className="text-2xl font-extrabold text-choco-900">{title}</h1>
          {subtitle && <p className="text-choco-500 mt-1">{subtitle}</p>}
        </div>
        <div className="card p-5">{children}</div>
      </div>
    </div>
  );
}

export function Login() {
  const { refresh, businessName } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/auth/login', { method: 'POST', body: { username, password } });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Shell title={businessName || 'Bienvenida'} subtitle="Entra con tu usuario">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Usuario">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus />
        </Field>
        <Field label="Contraseña">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {error && <p className="text-red-600 font-semibold text-sm">{error}</p>}
        <Button type="submit" block size="lg" loading={loading}>
          Entrar
        </Button>
      </form>
    </Shell>
  );
}

export function Setup() {
  const { refresh } = useAuth();
  const [f, setF] = useState({ business_name: '', name: '', username: '', password: '', demo: true });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/auth/setup', { method: 'POST', body: f });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Shell title="¡Vamos a empezar!" subtitle="Configura tu pastelería en un minuto">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre del negocio">
          <Input value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} placeholder="Ej. Dulces de Ana" autoFocus />
        </Field>
        <Field label="Tu nombre">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej. Ana" />
        </Field>
        <Field label="Usuario para entrar" hint="Sin espacios. Lo usarás para iniciar sesión.">
          <Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.replace(/\s/g, '') })} autoCapitalize="none" autoComplete="username" />
        </Field>
        <Field label="Contraseña" hint="Mínimo 6 caracteres.">
          <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        </Field>
        <Toggle
          checked={f.demo}
          onChange={(demo) => setF({ ...f, demo })}
          label="Cargar datos de ejemplo"
          hint="Pedidos, recetas e inventario de prueba para ver cómo funciona. Puedes borrarlos después."
        />
        {error && <p className="text-red-600 font-semibold text-sm">{error}</p>}
        <Button type="submit" block size="lg" loading={loading}>
          Crear y entrar
        </Button>
      </form>
    </Shell>
  );
}
