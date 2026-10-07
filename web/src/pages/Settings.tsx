import { useEffect, useRef, useState } from 'react';
import { Copy, DatabaseBackup, Download, LogOut, RotateCcw, Share2, Upload } from 'lucide-react';
import type { Settings } from '@shared/constants';
import { api, useAction, useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';
import { Button, Card, Field, Input, Loading, NumberInput, PageHeader, Section, Sheet, useConfirm } from '../components/ui';

export function SettingsPage() {
  return (
    <div className="space-y-6 pb-8">
      <PageHeader title="Configuración" back="/mas" />
      <BusinessSettings />
      <OtherDeviceSection />
      <BackupSection />
      <ResetSection />
      <LeaveSection />
    </div>
  );
}

/** Enlace para abrir la misma pastelería en otro móvil u ordenador. */
function OtherDeviceSection() {
  const toast = useToast();
  const res = useApi<{ key: string }>('/auth/link');
  const link = res.data ? `${window.location.origin}/entrar#${res.data.key}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.show('Enlace copiado');
    } catch {
      window.prompt('Copia este enlace:', link);
    }
  };
  return (
    <Section title="Usarla en otro móvil u ordenador">
      <Card className="p-4 space-y-3">
        <p className="text-sm text-choco-700">
          Cada móvil tiene su propia pastelería. Para abrir <b>esta misma</b> en otro dispositivo (o si se borran los datos del navegador), abre este
          enlace allí. Guárdalo en un sitio seguro: <b>quien tenga el enlace puede ver y cambiar tus datos</b>.
        </p>
        {link ? (
          <>
            <div className="rounded-xl bg-cream-100 px-3 py-2.5 text-sm font-mono break-all select-all">{link}</div>
            <div className="flex flex-wrap gap-2">
              <Button icon={<Copy size={18} />} onClick={copy}>
                Copiar enlace
              </Button>
              <Button
                variant="secondary"
                icon={<Share2 size={18} />}
                onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Enlace para abrir mi pastelería: ${link}`)}`, '_blank')}
              >
                Enviármelo por WhatsApp
              </Button>
            </div>
          </>
        ) : (
          <Loading />
        )}
      </Card>
    </Section>
  );
}

function LeaveSection() {
  const { leave } = useAuth();
  const confirm = useConfirm();
  return (
    <Section title="Este dispositivo">
      <Card className="p-4 space-y-3">
        <p className="text-sm text-choco-700">
          Deja de usar esta pastelería en este dispositivo. Los datos <b>no se borran</b>: puedes volver a abrirla con el enlace de arriba.
        </p>
        <Button
          variant="outline"
          block
          icon={<LogOut size={18} />}
          onClick={async () =>
            (await confirm({
              title: '¿Salir en este dispositivo?',
              text: 'Antes, guarda el enlace de acceso: sin él no podrás volver a abrir esta pastelería aquí.',
              ok: 'Salir',
              danger: true,
            })) && leave()
          }
        >
          Salir de esta pastelería
        </Button>
      </Card>
    </Section>
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

interface BackupRow {
  id: number;
  name: string;
  kind: 'auto' | 'manual' | 'antes-de-restaurar' | 'antes-de-borrar';
  size: number;
  created_at: string;
}

function BackupSection() {
  const confirm = useConfirm();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const res = useApi<BackupRow[]>('/backups');
  const create = useAction(() => api('/backups', { method: 'POST' }), { success: 'Copia de seguridad creada' });
  const restoreOne = useAction((id: number) => api(`/backups/restore/${id}`, { method: 'POST' }), {
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
      await api('/backups/restore', { method: 'POST', raw: new Blob([await f.arrayBuffer()], { type: 'application/gzip' }) });
      toast.show('Copia restaurada');
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };
  const label = (b: BackupRow) => {
    const d = new Date(b.created_at);
    const when = d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const kind =
      b.kind === 'auto' ? 'automática' : b.kind === 'antes-de-restaurar' ? 'antes de restaurar' : b.kind === 'antes-de-borrar' ? 'antes de borrar todo' : 'manual';
    return `${when} · ${kind}`;
  };
  return (
    <Section title="Copias de seguridad">
      <Card className="p-4 space-y-3">
        <p className="text-sm text-choco-500">
          Cada noche se hace una copia automática (se guardan las últimas 30). Descarga una de vez en cuando y guárdala en otro sitio
          (tu ordenador, Google Drive…). Las copias incluyen todos los datos; las fotos se quedan en la base de datos.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <a href="/api/backups/download/current">
            <Button block icon={<Download size={18} />}>
              Descargar copia ahora
            </Button>
          </a>
          <Button variant="secondary" icon={<DatabaseBackup size={18} />} loading={create.isPending} onClick={() => create.mutate()}>
            Guardar copia en la app
          </Button>
          <Button variant="outline" icon={<Upload size={18} />} loading={busy} onClick={() => file.current?.click()}>
            Restaurar desde archivo
          </Button>
          <input ref={file} type="file" accept=".gz,.json,application/gzip,application/json" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
        {res.data && res.data.length > 0 && (
          <div className="divide-y divide-cream-200 border-t border-cream-200">
            {res.data.slice(0, 15).map((b) => (
              <div key={b.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1">
                  {label(b)} <span className="text-choco-400">· {Math.max(1, Math.round(b.size / 1024))} KB</span>
                </span>
                <a href={`/api/backups/download/${b.id}`} className="p-2 text-choco-500 hover:text-berry-600" aria-label="Descargar" title="Descargar">
                  <Download size={17} />
                </a>
                <button
                  type="button"
                  className="p-2 text-choco-500 hover:text-red-600"
                  aria-label="Restaurar"
                  title="Restaurar"
                  onClick={async () =>
                    (await confirm({ title: '¿Volver a esta copia?', text: `Los datos volverán a como estaban el ${label(b)}. Antes se guarda una copia del estado actual.`, ok: 'Restaurar', danger: true })) &&
                    restoreOne.mutate(b.id)
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

function ResetSection() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const reset = useAction(() => api('/reset', { method: 'POST', body: { confirm: text.trim().toUpperCase(), keep_backups: true } }), {
    success: 'Datos borrados',
    onSuccess: () => setTimeout(() => window.location.reload(), 600),
  });
  return (
    <Section title="Empezar de cero">
      <Card className="p-4 space-y-3 border-red-200">
        <p className="text-sm text-choco-700">
          Borra todos los pedidos, clientes, recetas, inventario y demás datos (por ejemplo, para quitar los datos de ejemplo) y deja tu pastelería
          vacía. Antes se guarda una copia de seguridad que podrás restaurar después.
        </p>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Borrar todos los datos
        </Button>
      </Card>
      {open && (
        <Sheet
          open
          onClose={() => setOpen(false)}
          title="¿Borrar todos los datos?"
          footer={
            <Button block size="lg" variant="danger" disabled={text.trim().toUpperCase() !== 'BORRAR'} loading={reset.isPending} onClick={() => reset.mutate()}>
              Borrar todo
            </Button>
          }
        >
          <div className="space-y-3">
            <p>Se borrará todo y tendrás que volver a crear tu usuario. Escribe <b>BORRAR</b> para confirmar.</p>
            <Input value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" autoFocus />
          </div>
        </Sheet>
      )}
    </Section>
  );
}
