import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, Download, Minus, Plus, Table2, Trash2 } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type ExpenseCategory,
  type PaymentKind,
  type PaymentMethod,
} from '@shared/constants';
import { api, useAction, useApi } from '../lib/api';
import { addMonths, monthLabel, money, num, parseDate, relDay, today } from '../lib/format';
import { ColumnChart, HBars, Legend, SERIES } from '../components/Charts';
import {
  Button,
  Card,
  Chip,
  cx,
  ErrorBox,
  Field,
  IconButton,
  Input,
  Loading,
  NumberInput,
  PageHeader,
  Section,
  Sheet,
  useConfirm,
} from '../components/ui';

interface Summary {
  month: string;
  revenue: { orders_count: number; orders: number; direct_sales: number; cancelled_kept: number; total: number };
  expenses: number;
  collected: number;
  profit: number;
  cash_flow: number;
  avg_ticket: number;
  pending: { total: number; orders: number };
  expenses_by_category: { category: ExpenseCategory; amount: number }[];
  collected_by_method: { method: PaymentMethod; amount: number }[];
  top_products: { name: string; quantity: number; revenue: number }[];
}

interface Movement {
  id: number;
  source: 'payment' | 'expense';
  kind: string;
  amount: number;
  method: string | null;
  description: string | null;
  date: string;
  order_id?: number;
  order_number?: number;
  customer_name?: string;
  supplier?: string;
  stock_lines?: number;
}

const shortMonth = (m: string) => parseDate(`${m}-15`).toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');

export function Finance() {
  const confirm = useConfirm();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [sheet, setSheet] = useState<'expense' | 'sale' | null>(null);
  const [table, setTable] = useState(false);
  const summary = useApi<Summary>(`/finance/summary?month=${month}`, { placeholderData: (p) => p });
  const hist = useApi<{ month: string; revenue: number; expenses: number; profit: number }[]>(`/finance/history?months=12&month=${month}`, {
    placeholderData: (p) => p,
  });
  const moves = useApi<Movement[]>(`/finance/movements?month=${month}`, { placeholderData: (p) => p });
  const delExpense = useAction((id: number) => api(`/expenses/${id}`, { method: 'DELETE' }), { success: 'Gasto borrado' });
  const delSale = useAction((id: number) => api(`/finance/sales/${id}`, { method: 'DELETE' }), { success: 'Venta borrada' });

  if (summary.error) return <ErrorBox error={summary.error} retry={summary.refetch} />;
  if (!summary.data) return <Loading />;
  const s = summary.data;
  const chartData = (hist.data ?? []).map((h) => ({ label: shortMonth(h.month), long: monthLabel(h.month), values: [h.revenue, h.expenses], profit: h.profit }));

  return (
    <div className={cx('space-y-6 transition-opacity', summary.isFetching && 'opacity-70')}>
      <PageHeader title="Caja y finanzas" back="/mas" />

      <div className="flex items-center gap-1">
        <IconButton label="Mes anterior" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={26} />
        </IconButton>
        <div className="flex-1 text-center font-semibold text-lg">{monthLabel(month)}</div>
        <IconButton label="Mes siguiente" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= today().slice(0, 7)}>
          <ChevronRight size={26} />
        </IconButton>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button icon={<Minus size={18} />} variant="outline" onClick={() => setSheet('expense')}>
          Anotar gasto
        </Button>
        <Button icon={<Plus size={18} />} variant="outline" onClick={() => setSheet('sale')}>
          Venta suelta
        </Button>
      </div>

      {/* Resultado del mes */}
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="text-[13px] text-choco-500">Beneficio estimado</div>
            <div className={cx('font-display text-[44px] leading-tight tabular-nums mt-0.5', s.profit >= 0 ? 'text-sage-700' : 'text-red-700')}>{money(s.profit)}</div>
          </div>
          <div className="text-[15px] space-y-1 sm:min-w-64">
            <Line label="Ingresos (facturado)" value={money(s.revenue.total)} />
            <Line label="− Gastos" value={money(s.expenses)} />
            <div className="border-t border-cream-200 pt-1">
              <Line label={<b>= Beneficio</b>} value={<b>{money(s.profit)}</b>} />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Facturado" value={money(s.revenue.total)} sub={`${s.revenue.orders_count} pedidos entregados`} />
        <Tile label="Gastos" value={money(s.expenses)} />
        <Tile label="Cobrado (caja)" value={money(s.collected)} sub={`Caja neta ${money(s.cash_flow)}`} />
        <Link to="/pedidos?vista=unpaid" className="block">
          <Tile label="Pendiente de cobrar" value={money(s.pending.total)} sub={`${s.pending.orders} pedidos`} warn={s.pending.total > 0} />
        </Link>
      </div>
      <div className="text-sm text-choco-500 -mt-3 px-1">
        Facturado = pedidos entregados ({money(s.revenue.orders)}) + ventas de mostrador ({money(s.revenue.direct_sales)})
        {s.revenue.cancelled_kept > 0 && ` + señales de pedidos cancelados (${money(s.revenue.cancelled_kept)})`}. Ticket medio: {money(s.avg_ticket)}.
      </div>

      {/* Evolución */}
      <Section
        title="Evolución (12 meses)"
        action={
          <Button variant="ghost" size="sm" icon={<Table2 size={16} />} onClick={() => setTable(!table)}>
            {table ? 'Ver gráfica' : 'Ver tabla'}
          </Button>
        }
      >
        <Card className="p-4 space-y-5">
          {table ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-choco-500">
                    <th className="py-1.5 font-medium">Mes</th>
                    <th className="py-1.5 font-medium text-right">Ingresos</th>
                    <th className="py-1.5 font-medium text-right">Gastos</th>
                    <th className="py-1.5 font-medium text-right">Beneficio</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {(hist.data ?? []).map((h) => (
                    <tr key={h.month} className="border-t border-cream-200">
                      <td className="py-1.5 first-letter:uppercase">{monthLabel(h.month)}</td>
                      <td className="py-1.5 text-right">{money(h.revenue)}</td>
                      <td className="py-1.5 text-right">{money(h.expenses)}</td>
                      <td className={cx('py-1.5 text-right font-medium', h.profit < 0 && 'text-red-600')}>{money(h.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="font-semibold">Ingresos y gastos</div>
                <Legend
                  items={[
                    { name: 'Ingresos', color: SERIES.revenue },
                    { name: 'Gastos', color: SERIES.expenses },
                  ]}
                />
                <ColumnChart
                  data={chartData}
                  series={[
                    { name: 'Ingresos', color: SERIES.revenue },
                    { name: 'Gastos', color: SERIES.expenses },
                  ]}
                  extra={(d) => {
                    const p = d.values[0] - d.values[1];
                    return <div className="mt-1 border-t border-cream-200 pt-1 font-medium">Beneficio {money(p)}</div>;
                  }}
                />
              </div>
              <div className="space-y-2">
                <div className="font-semibold">Beneficio por mes</div>
                <ColumnChart
                  data={chartData.map((d) => ({ ...d, values: [d.profit] }))}
                  series={[{ name: 'Beneficio', color: SERIES.profit }]}
                  colorFor={(v) => (v >= 0 ? SERIES.profit : SERIES.loss)}
                  height={170}
                />
              </div>
            </>
          )}
        </Card>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Gastos por tipo">
          <Card className="p-4">
            {s.expenses_by_category.length ? (
              <HBars rows={s.expenses_by_category.map((e) => ({ label: EXPENSE_CATEGORY_LABELS[e.category] ?? e.category, value: e.amount }))} color={SERIES.expenses} />
            ) : (
              <p className="text-choco-500">Sin gastos este mes.</p>
            )}
          </Card>
        </Section>
        <Section title="Cobros por forma de pago">
          <Card className="p-4">
            {s.collected_by_method.length ? (
              <HBars rows={s.collected_by_method.map((e) => ({ label: PAYMENT_METHOD_LABELS[e.method] ?? e.method, value: e.amount }))} />
            ) : (
              <p className="text-choco-500">Sin cobros este mes.</p>
            )}
          </Card>
        </Section>
      </div>

      {s.top_products.length > 0 && (
        <Section title="Lo más vendido del mes">
          <Card className="divide-y divide-cream-200">
            {s.top_products.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-6 text-choco-400 font-semibold">{i + 1}</span>
                <span className="flex-1 font-semibold">{p.name}</span>
                <span className="text-sm text-choco-500">{num(p.quantity)} uds</span>
                <span className="font-semibold tabular-nums w-24 text-right">{money(p.revenue)}</span>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Movimientos del mes">
        {moves.data?.length ? (
          <Card className="divide-y divide-cream-200">
            {moves.data.map((m) => (
              <div key={`${m.source}-${m.id}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cx('h-9 w-9 shrink-0 rounded-full flex items-center justify-center font-semibold', m.source === 'expense' || m.kind === 'refund' ? 'bg-orange-50 text-orange-700' : 'bg-sky-50 text-sky-700')}>
                  {m.source === 'expense' || m.kind === 'refund' ? '−' : '+'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    {m.source === 'expense'
                      ? m.description
                      : m.order_id
                        ? `${PAYMENT_KIND_LABELS[m.kind as PaymentKind]} · #${m.order_number} ${m.customer_name}`
                        : `Venta: ${m.description ?? ''}`}
                  </div>
                  <div className="text-xs text-choco-500">
                    {relDay(m.date.slice(0, 10))}
                    {m.source === 'expense' ? ` · ${EXPENSE_CATEGORY_LABELS[m.kind as ExpenseCategory] ?? m.kind}` : ''}
                    {m.method ? ` · ${PAYMENT_METHOD_LABELS[m.method as PaymentMethod] ?? m.method}` : ''}
                    {m.supplier ? ` · ${m.supplier}` : ''}
                  </div>
                </div>
                <span className="font-semibold tabular-nums">
                  {m.source === 'expense' || m.kind === 'refund' ? '−' : ''}
                  {money(m.amount)}
                </span>
                {(m.source === 'expense' || m.kind === 'direct_sale') && (
                  <button
                    type="button"
                    aria-label="Borrar"
                    className="p-2 text-choco-400 hover:text-red-600"
                    onClick={async () => {
                      const ok = await confirm({
                        title: m.source === 'expense' ? '¿Borrar este gasto?' : '¿Borrar esta venta?',
                        text: m.stock_lines ? 'Era una compra: también se quitarán esas cantidades del inventario.' : undefined,
                        ok: 'Borrar',
                        danger: true,
                      });
                      if (ok) (m.source === 'expense' ? delExpense : delSale).mutate(m.id);
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            ))}
          </Card>
        ) : (
          <Card className="p-4 text-choco-500">Sin movimientos este mes.</Card>
        )}
      </Section>

      <Section title="Exportar a Excel">
        <div className="flex flex-wrap gap-2">
          {['pedidos', 'cobros', 'gastos', 'clientes', 'inventario'].map((w) => (
            <a key={w} href={`/api/export/${w}`} download>
              <Button variant="outline" size="sm" icon={<Download size={16} />}>
                {w.charAt(0).toUpperCase() + w.slice(1)}
              </Button>
            </a>
          ))}
        </div>
      </Section>

      {sheet === 'expense' && <ExpenseSheet onClose={() => setSheet(null)} />}
      {sheet === 'sale' && <SaleSheet onClose={() => setSheet(null)} />}
    </div>
  );
}

function Line({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-choco-700">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="card p-4 h-full">
      <div className="text-[13px] text-choco-500">{label}</div>
      <div className={cx('font-display text-[27px] leading-tight mt-1 tabular-nums', warn ? 'text-caramel-700' : 'text-choco-900')}>{value}</div>
      {sub && <div className="text-xs text-choco-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ExpenseSheet({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ date: today(), category: 'ingredientes' as ExpenseCategory, description: '', amount: null as number | null, supplier: '', payment_method: 'tarjeta' });
  const save = useAction(() => api('/expenses', { method: 'POST', body: f }), { success: 'Gasto anotado', onSuccess: onClose });
  return (
    <Sheet
      open
      onClose={onClose}
      title="Anotar gasto"
      footer={
        <Button block size="lg" disabled={!f.description.trim() || !f.amount} loading={save.isPending} onClick={() => save.mutate()}>
          Guardar gasto
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Importe">
          <NumberInput value={f.amount} onChange={(amount) => setF({ ...f, amount })} suffix="€" autoFocus />
        </Field>
        <div>
          <span className="label">Tipo de gasto</span>
          <div className="flex flex-wrap gap-2">
            {EXPENSE_CATEGORIES.map((c) => (
              <Chip key={c} active={f.category === c} onClick={() => setF({ ...f, category: c })}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </Chip>
            ))}
          </div>
        </div>
        <Field label="Concepto">
          <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ej. Factura de la luz" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Proveedor">
            <Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
          </Field>
        </div>
        <p className="text-sm text-choco-500">Para compras de ingredientes usa «Compras»: así también se suma al inventario.</p>
      </div>
    </Sheet>
  );
}

function SaleSheet({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ description: '', amount: null as number | null, method: 'efectivo', date: today() });
  const save = useAction(() => api('/finance/sales', { method: 'POST', body: f }), { success: 'Venta registrada', onSuccess: onClose });
  return (
    <Sheet
      open
      onClose={onClose}
      title="Venta de mostrador"
      footer={
        <Button block size="lg" disabled={!f.description.trim() || !f.amount} loading={save.isPending} onClick={() => save.mutate()}>
          Guardar venta
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-choco-500">Para ventas sueltas sin encargo (ej. 3 brownies en la tienda).</p>
        <Field label="Importe">
          <NumberInput value={f.amount} onChange={(amount) => setF({ ...f, amount })} suffix="€" autoFocus />
        </Field>
        <Field label="Qué has vendido">
          <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ej. 3 brownies" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m} active={f.method === m} onClick={() => setF({ ...f, method: m })}>
              {PAYMENT_METHOD_LABELS[m]}
            </Chip>
          ))}
        </div>
        <Field label="Fecha">
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}
