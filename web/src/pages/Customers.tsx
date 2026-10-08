import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Cake, ChevronRight, Copy, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Trash2, TriangleAlert, UserPlus, Users } from 'lucide-react';
import { ALLERGEN_LABELS, QUOTE_STATUS_LABELS, type Allergen } from '@shared/constants';
import { api, useAction, useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { telLink, waLink } from '../lib/contact';
import { dateShort, money, relDay } from '../lib/format';
import type { Customer, OrderSummary } from '../lib/types';
import { OrderCard } from '../components/OrderCard';
import { AllergenPicker } from './OrderForm';
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Fab,
  Field,
  Input,
  Loading,
  PageHeader,
  SearchInput,
  Section,
  Sheet,
  Textarea,
  useConfirm,
} from '../components/ui';

export function Customers() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const res = useApi<Customer[]>(`/customers${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`);
  return (
    <div>
      <PageHeader
        title="Clientes"
        back="/mas"
        actions={
          <Button className="hidden lg:inline-flex" icon={<UserPlus size={18} />} onClick={() => setCreating(true)}>
            Nuevo cliente
          </Button>
        }
      />
      <div className="mb-4">
        <SearchInput value={q} onChange={setQ} placeholder="Nombre, teléfono o email" />
      </div>
      {res.isLoading ? (
        <Loading />
      ) : res.error ? (
        <ErrorBox error={res.error} retry={res.refetch} />
      ) : !res.data?.length ? (
        <Empty icon={Users} title={debounced ? 'Nadie con ese nombre' : 'Aún no hay clientes'} text="Los clientes se guardan solos al crear pedidos, o puedes añadirlos aquí." />
      ) : (
        <Card className="divide-y divide-cream-200 overflow-hidden">
          {res.data.map((c) => (
            <Link key={c.id} to={`/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-berry-100 to-caramel-100 ring-1 ring-inset ring-berry-100 text-berry-700 font-display text-[18px] flex items-center justify-center shrink-0">{c.name.charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {c.name} {c.allergens.length > 0 && <TriangleAlert size={14} className="inline text-red-600" />}
                </div>
                <div className="text-sm text-choco-500 truncate">
                  {c.phone ?? 'Sin teléfono'} · {c.orders_count} {c.orders_count === 1 ? 'pedido' : 'pedidos'}
                  {c.last_order_date && ` · último ${dateShort(c.last_order_date)}`}
                </div>
              </div>
              {c.total_spent > 0 && <span className="text-sm font-medium text-choco-700 tabular-nums">{money(c.total_spent)}</span>}
              <ChevronRight size={18} className="text-choco-300" />
            </Link>
          ))}
        </Card>
      )}
      <Fab label="Nuevo cliente" onClick={() => setCreating(true)} />
      <CustomerSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

interface CustomerFull extends Customer {
  pending: number;
  orders: OrderSummary[];
  favorites: { name: string; flavor: string | null; times: number; quantity: number }[];
  quotes: { id: number; number: number; date: string; total: number; status: string }[];
}

export function CustomerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const { permissions } = useAuth();
  const [editing, setEditing] = useState(false);
  const res = useApi<CustomerFull>(`/customers/${id}`);
  const remove = useAction(() => api(`/customers/${id}`, { method: 'DELETE' }), { success: 'Cliente borrado', onSuccess: () => nav('/clientes', { replace: true }) });
  if (res.isLoading) return <Loading />;
  if (res.error || !res.data) return <ErrorBox error={res.error} />;
  const c = res.data;
  const birthday = c.birthday ? new Date(`2000-${c.birthday.slice(-5)}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : null;
  return (
    <div className="space-y-5">
      <PageHeader
        back="/clientes"
        title={c.name}
        actions={
          <Button variant="outline" size="sm" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>
            Editar
          </Button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4 space-y-3">
          {c.phone && (
            <div className="grid grid-cols-2 gap-2">
              <a href={telLink(c.phone)}>
                <Button variant="secondary" block icon={<Phone size={18} />}>
                  {c.phone}
                </Button>
              </a>
              <a href={waLink(c.phone, `¡Hola, ${c.name.split(' ')[0]}! `)} target="_blank" rel="noreferrer">
                <Button variant="secondary" block icon={<MessageCircle size={18} />} className="text-emerald-700">
                  WhatsApp
                </Button>
              </a>
            </div>
          )}
          <div className="space-y-1.5 text-[15px]">
            {c.email && (
              <a href={`mailto:${c.email}`} className="flex items-center gap-2">
                <Mail size={17} className="text-choco-400" /> {c.email}
              </a>
            )}
            {c.address && (
              <div className="flex items-center gap-2">
                <MapPin size={17} className="text-choco-400" /> {c.address}
              </div>
            )}
            {birthday && (
              <div className="flex items-center gap-2">
                <Cake size={17} className="text-choco-400" /> Cumpleaños: {birthday}
              </div>
            )}
          </div>
          {c.allergens.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-700 font-medium flex gap-2">
              <TriangleAlert size={20} className="shrink-0" /> Alergias: {c.allergens.map((a) => ALLERGEN_LABELS[a as Allergen] ?? a).join(', ')}
            </div>
          )}
          {c.preferences && (
            <div>
              <div className="section-title">Preferencias</div>
              <p>{c.preferences}</p>
            </div>
          )}
          {c.notes && (
            <div>
              <div className="section-title">Notas</div>
              <p className="whitespace-pre-line">{c.notes}</p>
            </div>
          )}
        </Card>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Pedidos" value={String(c.orders_count)} />
            <Stat label="Ha gastado" value={money(c.total_spent)} />
            <Stat label="Debe" value={money(c.pending)} warn={c.pending > 0.005} />
          </div>
          {c.favorites.length > 0 && (
            <Card className="p-4">
              <div className="section-title mb-2">Suele pedir</div>
              <div className="flex flex-wrap gap-2">
                {c.favorites.map((f) => (
                  <Badge key={`${f.name}-${f.flavor}`} tone="berry" className="text-sm py-1 px-3">
                    {f.name}
                    {f.flavor ? ` · ${f.flavor}` : ''} ×{f.times}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
          <Link to={`/pedidos/nuevo?cliente=${c.id}`}>
            <Button block size="lg" icon={<Plus size={22} />}>
              Nuevo pedido para {c.name.split(' ')[0]}
            </Button>
          </Link>
        </div>
      </div>

      <Section title={`Pedidos anteriores (${c.orders.length})`}>
        {c.orders.length ? (
          <div className="space-y-2.5">
            {c.orders.map((o) => (
              <div key={o.id} className="relative">
                <OrderCard o={o} compact />
                <Link
                  to={`/pedidos/nuevo?repetir=${o.id}`}
                  className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-lg bg-cream-200 px-2.5 py-1.5 text-xs font-semibold text-choco-700 hover:bg-cream-300"
                >
                  <Copy size={13} /> Repetir
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <Card className="p-4 text-choco-500">Todavía no tiene pedidos.</Card>
        )}
      </Section>

      {c.quotes.length > 0 && (
        <Section title="Presupuestos">
          <Card className="divide-y divide-cream-200">
            {c.quotes.map((q) => (
              <Link key={q.id} to={`/presupuestos/${q.id}`} className="flex items-center gap-2 px-4 py-3">
                <span className="flex-1">
                  #{q.number} · {relDay(q.date)}
                </span>
                <Badge>{QUOTE_STATUS_LABELS[q.status as keyof typeof QUOTE_STATUS_LABELS] ?? q.status}</Badge>
                <b>{money(q.total)}</b>
              </Link>
            ))}
          </Card>
        </Section>
      )}

      {permissions.delete && (
        <Button
          variant="danger"
          icon={<Trash2 size={18} />}
          onClick={async () =>
            (await confirm({ title: `¿Borrar a ${c.name}?`, text: 'Sus pedidos se conservan, pero ya no estarán enlazados a la ficha.', ok: 'Borrar', danger: true })) && remove.mutate()
          }
        >
          Borrar cliente
        </Button>
      )}
      <CustomerSheet open={editing} onClose={() => setEditing(false)} customer={c} />
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`card p-3 text-center `}>
      <div className="text-xs font-medium text-choco-500">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${warn ? 'text-amber-700' : ''}`}>{value}</div>
    </div>
  );
}

export function CustomerSheet({ open, onClose, customer }: { open: boolean; onClose: () => void; customer?: Customer }) {
  const nav = useNavigate();
  const empty = { name: '', phone: '', email: '', address: '', birthday: '', allergens: [] as string[], preferences: '', notes: '' };
  const [f, setF] = useState(empty);
  useEffect(() => {
    if (!open) return;
    setF(
      customer
        ? {
            name: customer.name,
            phone: customer.phone ?? '',
            email: customer.email ?? '',
            address: customer.address ?? '',
            birthday: customer.birthday ? (customer.birthday.startsWith('--') ? `2000${customer.birthday.slice(1)}` : customer.birthday) : '',
            allergens: customer.allergens,
            preferences: customer.preferences ?? '',
            notes: customer.notes ?? '',
          }
        : empty,
    );
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(
    () => {
      const body = { ...f, birthday: f.birthday || null };
      return customer ? api(`/customers/${customer.id}`, { method: 'PUT', body }) : api('/customers', { method: 'POST', body });
    },
    {
      success: customer ? 'Cliente guardado' : 'Cliente creado',
      onSuccess: (r: { id: number }) => {
        onClose();
        if (!customer) nav(`/clientes/${r.id}`);
      },
    },
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={customer ? 'Editar cliente' : 'Nuevo cliente'}
      footer={
        <Button block size="lg" disabled={!f.name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
          Guardar
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus={!customer} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono">
            <Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
        </div>
        <Field label="Dirección">
          <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
        <Field label="Cumpleaños" hint="Si no sabes el año, pon cualquiera: solo se usa el día y el mes para avisarte.">
          <Input type="date" value={f.birthday} onChange={(e) => setF({ ...f, birthday: e.target.value })} />
        </Field>
        <div>
          <span className="label">Alergias</span>
          <AllergenPicker value={f.allergens} onChange={(allergens) => setF({ ...f, allergens })} />
        </div>
        <Field label="Preferencias">
          <Textarea value={f.preferences} onChange={(e) => setF({ ...f, preferences: e.target.value })} placeholder="Sabores favoritos, estilo de decoración…" />
        </Field>
        <Field label="Notas">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}
