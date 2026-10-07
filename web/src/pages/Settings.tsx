import { useEffect, useRef, useState } from 'react';
import { DatabaseBackup, Download, KeyRound, LogOut, Pencil, RotateCcw, Upload, UserPlus } from 'lucide-react';
import { EMPLOYEE_PERMISSIONS, type Permission, type Settings } from '@shared/constants';
import { api, useAction, useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { User } from '../lib/types';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, Field, Input, Loading, NumberInput, PageHeader, Section, Segmented, Sheet, Toggle, useConfirm } from '../components/ui';

export function SettingsPage() {
  const { user, logout } = useAuth();
  const admin = user?.role === 'admin';
  return (
    <div className="space-y-6 pb-8">
      <PageHeader title="Configuración" back="/mas" />
      {admin && <BusinessSettings />}
      {admin && <UsersSection />}
      {admin && <BackupSection />}
      <Section title="Mi cuenta">
        <Card className="p-4 space-y-3">
          <div>
            <div className="font-extrabold">{user?.name}</div>
            <div className="text-sm text-choco-500">
              Usuario «{user?.username}» · {admin ? 'Administrador' : 'Empleado'}
            </div>
          </div>
          <PasswordForm />
          <Button variant="outline" block icon={<LogOut size={18} />} onClick={logout}>
            Cerrar sesión
          </Button>
        </Card>
      </Section>
    </div>
  );
}

function BusinessSettings() {
  const { settings, refresh } = useAuth();
  const [f, setF] = useState<Partial<Settings>>(settings);
  useEffect(() => setF(settings), [settings]);
  const save = useAction(() => api('/settings', { method: 'PUT', body: f }), { success: 'Configuración guardada', onSuccess: () => refresh() });
  const num = (k: keyof Settings) => ({
    value: (f[k] as number | undefined) ?? null,
    onChange: (v: number | null) => setF({ ...f, [k]: v ?? 0 }),
  });
  const dirty = JSON.stringify(f) !== JSON.stringify(settings);
  return (
    <>
      <Section title="Mi negocio">
        <Card className="p-4 space-y-4">
          <Field label="Nombre del negocio">
            <Input value={f.business_name ?? ''} onChange={(e) => setF({ ...f, business_name: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono">
              <Input value={f.business_phone ?? ''} onChange={(e) => setF({ ...f, business_phone: e.target.value })} />
            </Field>
            <Field label="Dirección">
              <Input value={f.business_address ?? ''} onChange={(e) => setF({ ...f, business_address: e.target.value })} />
            </Field>
          </div>
          <p className="text-sm text-choco-500">Aparecen en los presupuestos y en los mensajes de WhatsApp.</p>
        </Card>
      </Section>

      <Section title="Pedidos y producción">
        <Card className="p-4 grid gap-4 sm:grid-cols-2">
          <Field label="Días de antelación para producir" hint="Un pedido entra en Producción estos días antes de la entrega.">
            <NumberInput {...num('production_lead_days')} integer suffix="días" />
          </Field>
          <Field label="Lista de la compra: días a mirar" hint="Pedidos que se tienen en cuenta por defecto.">
            <NumberInput {...num('shopping_horizon_days')} integer suffix="días" />
          </Field>
          <Field label="Gastos de envío por defecto">
            <NumberInput {...num('default_delivery_fee')} suffix="€" />
          </Field>
          <Field label="Señal recomendada" hint="Botón rápido al crear un pedido.">
            <NumberInput {...num('deposit_percent')} suffix="%" />
          </Field>
          <Field label="Validez de los presupuestos">
            <NumberInput {...num('quote_validity_days')} integer suffix="días" />
          </Field>
        </Card>
      </Section>

      <Section title="Costes y precios">
        <Card className="p-4 grid gap-4 sm:grid-cols-3">
          <Field label="Precio de la hora de trabajo" hint="Para el coste de mano de obra.">
            <NumberInput {...num('labor_cost_per_hour')} suffix="€/h" />
          </Field>
          <Field label="Gastos generales" hint="Luz, gas, alquiler… sobre ingredientes y envases.">
            <NumberInput {...num('overhead_percent')} suffix="%" />
          </Field>
          <Field label="Margen objetivo" hint="Para calcular el precio recomendado.">
            <NumberInput {...num('target_margin_percent')} suffix="%" />
          </Field>
        </Card>
      </Section>

      <Section title="Qué pueden hacer los empleados">
        <Card className="p-4 divide-y divide-cream-200">
          {(Object.keys(EMPLOYEE_PERMISSIONS) as Permission[]).map((p) => (
            <Toggle key={p} checked={!!f[p]} onChange={(v) => setF({ ...f, [p]: v })} label={EMPLOYEE_PERMISSIONS[p]} />
          ))}
          <p className="text-sm text-choco-500 pt-3">Los empleados siempre pueden ver y actualizar pedidos, calendario, producción, clientes y la lista de la compra.</p>
        </Card>
      </Section>

      {dirty && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-4 z-20">
          <Button block size="lg" loading={save.isPending} onClick={() => save.mutate()} className="shadow-[var(--shadow-float)]">
            Guardar configuración
          </Button>
        </div>
      )}
    </>
  );
}

function UsersSection() {
  const { user: me } = useAuth();
  const res = useApi<(User & { active: number })[]>('/users');
  const [editing, setEditing] = useState<(User & { active: number }) | 'new' | null>(null);
  return (
    <Section
      title="Usuarios"
      action={
        <Button size="sm" variant="secondary" icon={<UserPlus size={16} />} onClick={() => setEditing('new')}>
          Añadir
        </Button>
      }
    >
      <Card className="divide-y divide-cream-200">
        {res.isLoading && <Loading />}
        {res.data?.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3">
            <div className="h-10 w-10 rounded-full bg-berry-100 text-berry-700 font-extrabold flex items-center justify-center">{u.name.charAt(0)}</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold">
                {u.name} {u.id === me?.id && <span className="text-choco-400 font-semibold">(tú)</span>}
              </div>
              <div className="text-sm text-choco-500">«{u.username}»</div>
            </div>
            {!u.active && <Badge tone="red">Desactivado</Badge>}
            <Badge tone={u.role === 'admin' ? 'berry' : 'neutral'}>{u.role === 'admin' ? 'Administrador' : 'Empleado'}</Badge>
            <button type="button" className="p-2 text-choco-500 hover:text-berry-600" aria-label="Editar usuario" onClick={() => setEditing(u)}>
              <Pencil size={18} />
            </button>
          </div>
        ))}
      </Card>
      {editing && <UserSheet user={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

function UserSheet({ user, onClose }: { user?: User & { active: number }; onClose: () => void }) {
  const confirm = useConfirm();
  const { user: me } = useAuth();
  const [f, setF] = useState({ name: user?.name ?? '', username: user?.username ?? '', password: '', role: user?.role ?? 'employee', active: user ? !!user.active : true });
  const save = useAction(
    () => {
      const body = { ...f, password: f.password || undefined };
      return user ? api(`/users/${user.id}`, { method: 'PUT', body }) : api('/users', { method: 'POST', body });
    },
    { success: user ? 'Usuario guardado' : 'Usuario creado', onSuccess: onClose },
  );
  const remove = useAction(() => api(`/users/${user!.id}`, { method: 'DELETE' }), { success: 'Usuario borrado', onSuccess: onClose });
  return (
    <Sheet
      open
      onClose={onClose}
      title={user ? 'Editar usuario' : 'Nuevo usuario'}
      footer={
        <Button block size="lg" disabled={!f.name.trim() || !f.username.trim() || (!user && f.password.length < 6)} loading={save.isPending} onClick={() => save.mutate()}>
          Guardar
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Usuario para entrar">
          <Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.replace(/\s/g, '') })} autoCapitalize="none" />
        </Field>
        <Field label={user ? 'Nueva contraseña (déjalo vacío para no cambiarla)' : 'Contraseña'} hint="Mínimo 6 caracteres.">
          <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        </Field>
        <Segmented
          value={f.role}
          onChange={(role) => setF({ ...f, role })}
          options={[
            { value: 'employee', label: 'Empleado' },
            { value: 'admin', label: 'Administrador' },
          ]}
        />
        {user && user.id !== me?.id && <Toggle checked={f.active} onChange={(active) => setF({ ...f, active })} label="Puede entrar en la aplicación" />}
        {user && user.id !== me?.id && (
          <Button variant="danger" block onClick={async () => (await confirm({ title: `¿Borrar a ${user.name}?`, ok: 'Borrar', danger: true })) && remove.mutate()}>
            Borrar usuario
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function BackupSection() {
  const confirm = useConfirm();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const res = useApi<{ name: string; size: number; created_at: string }[]>('/backups');
  const create = useAction(() => api('/backups', { method: 'POST' }), { success: 'Copia de seguridad creada' });
  const restoreNamed = useAction((name: string) => api(`/backups/restore/${encodeURIComponent(name)}`, { method: 'POST' }), {
    success: 'Copia restaurada',
    onSuccess: () => setTimeout(() => window.location.reload(), 600),
  });
  const upload = async (f: File | undefined) => {
    if (!f) return;
    const ok = await confirm({
      title: '¿Restaurar esta copia?',
      text: 'Se sustituirán TODOS los datos actuales por los de la copia. Antes se guardará una copia de seguridad del estado actual.',
      ok: 'Restaurar',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api('/backups/restore', { method: 'POST', raw: f });
      toast.show('Copia restaurada');
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };
  const label = (n: string) => {
    const m = n.match(/copia_(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})_(.+)\.sqlite/);
    if (!m) return n;
    const kind = m[4].startsWith('auto') ? 'automática' : m[4].startsWith('antes') ? 'antes de restaurar' : 'manual';
    return `${m[1].split('-').reverse().join('/')} ${m[2]}:${m[3]} · ${kind}`;
  };
  return (
    <Section title="Copias de seguridad">
      <Card className="p-4 space-y-3">
        <p className="text-sm text-choco-500">
          Se hace una copia automática cada día (se guardan las últimas 30). Descarga una de vez en cuando y guárdala en otro sitio (tu ordenador, Google Drive…).
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <a href="/api/backups/download/current">
            <Button block icon={<Download size={18} />}>
              Descargar copia ahora
            </Button>
          </a>
          <Button variant="secondary" icon={<DatabaseBackup size={18} />} loading={create.isPending} onClick={() => create.mutate()}>
            Guardar copia en el servidor
          </Button>
          <Button variant="outline" icon={<Upload size={18} />} loading={busy} onClick={() => file.current?.click()}>
            Restaurar desde archivo
          </Button>
          <input ref={file} type="file" accept=".sqlite,.db,application/octet-stream" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
        {res.data && res.data.length > 0 && (
          <div className="divide-y divide-cream-200 border-t border-cream-200">
            {res.data.slice(0, 12).map((b) => (
              <div key={b.name} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1">
                  {label(b.name)} <span className="text-choco-400">· {(b.size / 1024 / 1024).toFixed(1)} MB</span>
                </span>
                <a href={`/api/backups/download/${encodeURIComponent(b.name)}`} className="p-2 text-choco-500 hover:text-berry-600" aria-label="Descargar" title="Descargar">
                  <Download size={17} />
                </a>
                <button
                  type="button"
                  className="p-2 text-choco-500 hover:text-red-600"
                  aria-label="Restaurar"
                  title="Restaurar"
                  onClick={async () =>
                    (await confirm({ title: '¿Volver a esta copia?', text: `Los datos volverán a como estaban el ${label(b.name)}. Se guarda antes una copia del estado actual.`, ok: 'Restaurar', danger: true })) &&
                    restoreNamed.mutate(b.name)
                  }
                >
                  <RotateCcw size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Section>
  );
}

function PasswordForm() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ current: '', next: '' });
  const save = useAction(() => api('/auth/password', { method: 'POST', body: f }), {
    success: 'Contraseña cambiada',
    onSuccess: () => {
      setOpen(false);
      setF({ current: '', next: '' });
    },
  });
  if (!open)
    return (
      <Button variant="secondary" block icon={<KeyRound size={18} />} onClick={() => setOpen(true)}>
        Cambiar mi contraseña
      </Button>
    );
  return (
    <div className="space-y-3 rounded-xl bg-cream-50 p-3">
      <Field label="Contraseña actual">
        <Input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" />
      </Field>
      <Field label="Nueva contraseña" hint="Mínimo 6 caracteres.">
        <Input type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" />
      </Field>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button className="flex-1" disabled={!f.current || f.next.length < 6} loading={save.isPending} onClick={() => save.mutate()}>
          Guardar
        </Button>
      </div>
    </div>
  );
}
