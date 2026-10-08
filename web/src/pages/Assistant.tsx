import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArrowUp,
  CalendarDays,
  ChartNoAxesColumn,
  ChevronRight,
  Layers,
  LoaderCircle,
  MessageCircle,
  Package,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  TriangleAlert,
  Wheat,
} from 'lucide-react';
import { CATEGORY_LABELS, type ProductCategory } from '@shared/constants';
import { useApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateLong, money, num, pct, qty, relDay } from '../lib/format';
import { Badge, Card, Chip, cx, Empty, ErrorBox, Loading, PageHeader, Section, Segmented, TintIcon } from '../components/ui';

type Tab = 'chat' | 'prevision' | 'rentabilidad' | 'plan';

export function AssistantPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('vista') as Tab) || 'chat';
  const setTab = (t: Tab) => setParams((p) => (p.set('vista', t), p), { replace: true });
  return (
    <div className="space-y-5">
      <PageHeader title="Asistente" subtitle="Pregunta por tu negocio y mira las previsiones" />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'chat', label: 'Preguntar' },
          { value: 'prevision', label: 'Ingredientes' },
          { value: 'rentabilidad', label: 'Rentabilidad' },
          { value: 'plan', label: 'Plan' },
        ]}
      />
      {tab === 'chat' && <Chat />}
      {tab === 'prevision' && <Forecast />}
      {tab === 'rentabilidad' && <Profitability />}
      {tab === 'plan' && <Plan />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat con IA
// ---------------------------------------------------------------------------

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
}

const SUGGESTIONS = [
  '¿Cuánto he facturado este mes y cuánto me queda por cobrar?',
  '¿Qué ingredientes me van a faltar esta semana?',
  '¿Qué productos me dejan menos margen y qué precio les pondrías?',
  'Hazme un plan de producción para los próximos 5 días',
  '¿Quiénes son mis mejores clientes?',
  '¿Qué pedidos tengo sin cobrar?',
];

const STORE_KEY = 'asistente-conversacion';
function loadConversation(): Msg[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function Chat() {
  const status = useApi<{ ai: boolean }>('/assistant/status', { staleTime: 60_000 });
  const [params] = useSearchParams();
  const [msgs, setMsgs] = useState<Msg[]>(loadConversation);
  const [input, setInput] = useState(params.get('q') ?? '');
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-30)));
    } catch {
      /* sin almacenamiento: la conversación no se guarda */
    }
  }, [msgs]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [msgs.length, working]);
  useEffect(() => () => abortRef.current?.abort(), []);

  if (status.isLoading) return <Loading />;
  if (status.data && !status.data.ai) return <AiOff />;

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history = msgs.filter((m) => !m.error).slice(-12);
    setMsgs((m) => [...m, { role: 'user', text: q }, { role: 'assistant', text: '' }]);
    setInput('');
    setBusy(true);
    setWorking('Pensando');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const append = (delta: string) =>
      setMsgs((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, text: last.text + delta };
        return copy;
      });
    const fail = (message: string) =>
      setMsgs((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', text: message, error: true };
        return copy;
      });
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ question: q, history: history.map(({ role, text }) => ({ role, text })) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        fail(data?.error || 'No se ha podido preguntar al asistente.');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let gotText = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.type === 'text') {
            gotText = true;
            setWorking(null);
            append(ev.delta);
          } else if (ev.type === 'tool') {
            setWorking(ev.label);
            if (gotText) append('\n\n');
          } else if (ev.type === 'error') fail(ev.message);
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') fail('Se ha cortado la conexión. Prueba otra vez.');
    } finally {
      setBusy(false);
      setWorking(null);
      abortRef.current = null;
    }
  };

  return (
    <div className="pb-28">
      {msgs.length === 0 ? (
        <div className="space-y-5">
          <Card className="hero relative overflow-hidden text-white p-5">
            <div className="absolute inset-0 hero-dots pointer-events-none" />
            <div className="relative flex gap-3.5">
              <span className="h-11 w-11 shrink-0 rounded-2xl glass flex items-center justify-center">
                <Sparkles size={20} />
              </span>
              <div>
                <div className="font-display text-[22px] leading-tight">¿En qué te ayudo?</div>
                <p className="text-sm text-white/70 mt-1">
                  Pregúntame con tus palabras: miro tus pedidos, ventas, clientes, inventario y costes reales para responderte.
                </p>
              </div>
            </div>
          </Card>
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="card text-left px-4 py-3 text-sm text-choco-800 hover:shadow-[var(--shadow-lift)] transition flex items-center gap-3"
              >
                <MessageCircle size={16} className="text-berry-500 shrink-0" />
                <span className="flex-1">{s}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => setMsgs([])}
              className="inline-flex items-center gap-1.5 text-[13px] text-choco-500 hover:text-choco-900 disabled:opacity-40"
            >
              <RotateCcw size={14} /> Nueva conversación
            </button>
          </div>
          {msgs.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-choco-900 text-white px-4 py-2.5 text-[15px] whitespace-pre-wrap">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="flex gap-2.5">
                <span className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-berry-100 to-caramel-100 ring-1 ring-inset ring-berry-100 text-berry-700 flex items-center justify-center">
                  <Sparkles size={15} />
                </span>
                <div
                  className={cx(
                    'min-w-0 flex-1 rounded-2xl rounded-tl-md px-4 py-3 text-[15px] leading-relaxed',
                    m.error ? 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200' : 'bg-white border border-cream-200 shadow-[var(--shadow-card)]',
                  )}
                >
                  {m.text ? <RichText text={m.text} /> : null}
                  {i === msgs.length - 1 && working && (
                    <div className={cx('flex items-center gap-2 text-[13px] text-choco-500', m.text && 'mt-2')}>
                      <LoaderCircle size={14} className="animate-spin text-berry-500" /> {working}…
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>
      )}

      <form
        className="action-bar no-print"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <div className="mx-auto max-w-5xl px-3 lg:px-10 py-2.5 flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={1}
            placeholder="Pregunta lo que quieras…"
            className="input flex-1 resize-none max-h-32 min-h-11 py-2.5"
            aria-label="Pregunta para el asistente"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Enviar"
            className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-b from-berry-500 to-berry-600 text-white flex items-center justify-center disabled:opacity-40 transition active:scale-95"
          >
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowUp size={19} />}
          </button>
        </div>
      </form>
    </div>
  );
}

function AiOff() {
  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex gap-3">
          <TintIcon icon={Sparkles} tint="plum" />
          <div>
            <div className="font-display text-xl text-choco-900">Las preguntas con IA aún no están activadas</div>
            <p className="text-sm text-choco-500 mt-1">
              Para preguntar en lenguaje normal hace falta conectar la aplicación con la IA de Anthropic (Claude). Mientras tanto, las pestañas de
              ingredientes, rentabilidad y plan funcionan igual con tus datos.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Texto con **negrita**, listas con guiones o números y párrafos (sin HTML). */
function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={blocks.length} className={cx('pl-5 space-y-1 my-1.5', list.ordered ? 'list-decimal' : 'list-disc marker:text-berry-500')}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    blocks.push(
      <p key={blocks.length} className={cx('my-1.5 first:mt-0 last:mb-0', heading && 'font-semibold text-choco-900 mt-3')}>
        {inline(heading ? heading[1] : line)}
      </p>,
    );
  }
  flush();
  return <div className="text-choco-800">{blocks}</div>;
}

function inline(s: string): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <strong key={i} className="text-choco-900">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{p.replace(/(^|\s)\*([^*]+)\*/g, '$1$2')}</Fragment>
    ),
  );
}

// ---------------------------------------------------------------------------
// Previsión de ingredientes
// ---------------------------------------------------------------------------

interface ForecastItem {
  item_id: number;
  name: string;
  kind: string;
  unit: string;
  stock: number;
  committed: number;
  committed_unconfirmed: number;
  avg_daily: number;
  forecast: number;
  coverage_days: number | null;
  runs_out: string | null;
  shortfall: number;
  suggested_purchase: number;
  est_cost: number;
  supplier: string | null;
  status: 'falta' | 'justo' | 'ok';
}

function DaysChips({ value, onChange, options }: { value: number; onChange: (n: number) => void; options: number[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((d) => (
        <Chip key={d} active={value === d} onClick={() => onChange(d)}>
          {d} días
        </Chip>
      ))}
    </div>
  );
}

function Forecast() {
  const [days, setDays] = useState(14);
  const q = useApi<{ items: ForecastItem[]; orders_considered: number; unconfirmed_orders: number; has_history: boolean; total_est_cost: number; until: string }>(
    `/assistant/forecast?days=${days}`,
  );
  const { permissions } = useAuth();
  if (q.error) return <ErrorBox error={q.error} retry={q.refetch} />;
  const d = q.data;
  const missing = d?.items.filter((i) => i.status === 'falta') ?? [];
  const tight = d?.items.filter((i) => i.status === 'justo') ?? [];
  return (
    <div className="space-y-5">
      <DaysChips value={days} onChange={setDays} options={[7, 14, 30]} />
      {!d ? (
        <Loading />
      ) : !d.items.length ? (
        <Empty icon={Wheat} title="Nada que prever todavía" text="Cuando tengas pedidos con productos que lleven receta o ingredientes, verás aquí qué vas a necesitar y cuándo se acaba cada cosa." />
      ) : (
        <>
          <Card className="p-5">
            <div className="text-[13px] text-choco-500">Hasta el {dateLong(d.until)}</div>
            <div className="font-display text-[26px] leading-tight text-choco-900 mt-1">
              {missing.length ? `Te faltarán ${missing.length} ${missing.length === 1 ? 'artículo' : 'artículos'}` : 'Tienes lo necesario'}
            </div>
            <p className="text-sm text-choco-500 mt-1.5">
              Según {d.orders_considered} {d.orders_considered === 1 ? 'pedido apuntado' : 'pedidos apuntados'}
              {d.unconfirmed_orders ? ` (${d.unconfirmed_orders} sin confirmar)` : ''}
              {d.has_history ? ' y lo que sueles gastar.' : '. Cuando haya historial, también se tendrá en cuenta lo que sueles gastar.'}
              {tight.length ? ` ${tight.length} más van justos.` : ''}
            </p>
            {permissions.costs && d.total_est_cost > 0 && <div className="mt-3 text-sm">Compra estimada: <b>{money(d.total_est_cost)}</b></div>}
            <Link to="/compras" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-berry-600">
              <ShoppingCart size={15} /> Ir a la lista de la compra <ChevronRight size={14} />
            </Link>
          </Card>
          <Card className="divide-y divide-cream-200/80 overflow-hidden">
            {d.items.map((i) => (
              <Link key={i.item_id} to={`/inventario/${i.item_id}`} className="flex items-start gap-3 px-4 py-3.5 hover:bg-cream-50 transition">
                <TintIcon icon={i.kind === 'material' ? Package : Wheat} tint={i.status === 'falta' ? 'rose' : i.status === 'justo' ? 'caramel' : 'sage'} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-choco-900 truncate">{i.name}</span>
                    {i.status === 'falta' && <Badge tone="red">Falta</Badge>}
                    {i.status === 'justo' && <Badge tone="amber">Justo</Badge>}
                  </div>
                  <div className="text-[13px] text-choco-500 mt-0.5">
                    Tienes {qty(i.stock, i.unit)} · necesitarás {qty(i.forecast, i.unit)}
                    {i.committed_unconfirmed > 0 && ` (${qty(i.committed_unconfirmed, i.unit)} de pedidos sin confirmar)`}
                  </div>
                  {i.status === 'falta' ? (
                    <div className="text-[13px] text-red-700">
                      Te faltan {qty(Math.max(0, i.forecast - i.stock), i.unit)} para {i.committed >= i.forecast ? 'los pedidos apuntados' : 'lo que sueles gastar'}
                    </div>
                  ) : i.coverage_days !== null && (
                    <div className="text-[13px] text-choco-500">
                      Al ritmo habitual te dura {i.coverage_days === 0 ? 'menos de un día' : `${num(i.coverage_days, 0)} días`}
                      {i.runs_out ? ` (hasta el ${relDay(i.runs_out).toLowerCase()})` : ''}
                    </div>
                  )}
                </div>
                {i.suggested_purchase > 0 && (
                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-choco-500">Comprar</div>
                    <div className="font-semibold text-choco-900 tabular-nums">{qty(i.suggested_purchase, i.unit)}</div>
                  </div>
                )}
              </Link>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rentabilidad
// ---------------------------------------------------------------------------

interface ProfitRow {
  product_id: number;
  name: string;
  category: string;
  variant: string | null;
  price: number;
  cost: number;
  profit: number;
  margin: number;
  recommended_price: number;
  has_costing: boolean;
  units_sold: number;
  revenue: number;
  total_profit: number;
  flags: string[];
}

const FLAG: Record<string, { label: string; tone: 'red' | 'amber' | 'neutral' | 'blue' }> = {
  pierde_dinero: { label: 'Pierde dinero', tone: 'red' },
  margen_bajo: { label: 'Margen bajo', tone: 'amber' },
  precio_bajo: { label: 'Precio por debajo del recomendado', tone: 'amber' },
  sin_escandallo: { label: 'Sin escandallo', tone: 'neutral' },
  no_se_vende: { label: 'Sin ventas', tone: 'blue' },
};

function Profitability() {
  const [days, setDays] = useState(90);
  const { permissions } = useAuth();
  const q = useApi<{ products: ProfitRow[]; worst: ProfitRow[]; target_margin: number }>(`/assistant/profitability?days=${days}`);
  if (!permissions.costs) return <Empty icon={ChartNoAxesColumn} title="Sin acceso a costes" />;
  if (q.error) return <ErrorBox error={q.error} retry={q.refetch} />;
  const d = q.data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-choco-500 mr-1">Ventas de los últimos</span>
        <DaysChips value={days} onChange={setDays} options={[30, 90, 365]} />
      </div>
      {!d ? (
        <Loading />
      ) : !d.products.length ? (
        <Empty icon={ChartNoAxesColumn} title="Aún no hay productos" text="Añade productos con su escandallo (receta, envases y tiempo) y verás aquí cuánto te deja cada uno." />
      ) : (
        <>
          <Card className="p-5">
            <div className="font-display text-[24px] leading-tight text-choco-900">
              {d.worst.length ? `${d.worst.length} ${d.worst.length === 1 ? 'producto rinde' : 'productos rinden'} poco` : 'Todos tus productos tienen buen margen'}
            </div>
            <p className="text-sm text-choco-500 mt-1.5">
              Ordenados de menor a mayor margen. Tu margen objetivo es {pct(d.target_margin)}; el precio recomendado lo alcanza.
            </p>
          </Card>
          <div className="grid gap-3 lg:grid-cols-2">
            {d.products.map((p) => (
              <Link
                key={`${p.product_id}-${p.variant}`}
                to={`/catalogo/${p.product_id}/escandallo`}
                className="card p-4 hover:shadow-[var(--shadow-lift)] transition block"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-choco-900">
                      {p.name}
                      {p.variant && <span className="text-choco-500 font-normal"> · {p.variant}</span>}
                    </div>
                    <div className="text-[12px] text-choco-500">{CATEGORY_LABELS[p.category as ProductCategory] ?? p.category}</div>
                  </div>
                  {p.has_costing && (
                    <div className={cx('font-display text-[24px] leading-none tabular-nums', p.margin < 0 ? 'text-red-700' : p.flags.includes('margen_bajo') ? 'text-caramel-700' : 'text-sage-700')}>
                      {pct(p.margin)}
                    </div>
                  )}
                </div>
                {p.has_costing && (
                  <>
                    <div className="mt-3 h-1.5 rounded-full bg-cream-200 overflow-hidden">
                      <div
                        className={cx('h-full rounded-full', p.margin < 0 ? 'bg-red-500' : p.flags.includes('margen_bajo') ? 'bg-caramel-500' : 'bg-sage-500')}
                        style={{ width: `${Math.max(3, Math.min(100, p.margin * 100))}%` }}
                      />
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-2 text-[12px] text-choco-500">
                      <span>
                        Precio <b className="block text-[14px] text-choco-900 font-semibold tabular-nums">{money(p.price)}</b>
                      </span>
                      <span>
                        Coste <b className="block text-[14px] text-choco-900 font-semibold tabular-nums">{money(p.cost)}</b>
                      </span>
                      <span>
                        Recomendado <b className="block text-[14px] text-choco-900 font-semibold tabular-nums">{money(p.recommended_price)}</b>
                      </span>
                    </div>
                  </>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-choco-500">
                  {p.flags.map((f) => (
                    <Badge key={f} tone={FLAG[f]?.tone ?? 'neutral'}>
                      {FLAG[f]?.label ?? f}
                    </Badge>
                  ))}
                  {p.units_sold > 0 && (
                    <span>
                      {num(p.units_sold)} vendidos · {money(p.revenue)}
                      {p.has_costing && ` · beneficio ${money(p.total_profit)}`}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan de producción
// ---------------------------------------------------------------------------

interface PlanDay {
  date: string;
  orders: { id: number; number: number; customer_name: string; status: string; delivery_date: string; delivery_time: string | null; overdue: boolean; tasks_left: number }[];
  products: { name: string; quantity: number }[];
  batches: { recipe: string; batches: number; orders: number[] }[];
  minutes: number;
  shortages: { item_id: number; name: string; unit: string; missing: number }[];
}

const hours = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

function Plan() {
  const [days, setDays] = useState(7);
  const q = useApi<{ plan: PlanDay[]; busiest_day: string | null; unconfirmed: number[]; total_minutes: number }>(`/assistant/plan?days=${days}`);
  if (q.error) return <ErrorBox error={q.error} retry={q.refetch} />;
  const d = q.data;
  const active = d?.plan.filter((p) => p.orders.length) ?? [];
  return (
    <div className="space-y-5">
      <DaysChips value={days} onChange={setDays} options={[3, 7, 14]} />
      {!d ? (
        <Loading />
      ) : !active.length ? (
        <Empty icon={CalendarDays} title="No hay nada que producir" text="En estos días no hay pedidos pendientes de preparar." />
      ) : (
        <>
          <Card className="p-5">
            <div className="font-display text-[24px] leading-tight text-choco-900">
              {active.length} {active.length === 1 ? 'día con trabajo' : 'días con trabajo'} · ≈ {hours(d.total_minutes)}
            </div>
            <p className="text-sm text-choco-500 mt-1.5">
              {d.busiest_day ? `El día más cargado es el ${dateLong(d.busiest_day)}. ` : ''}
              {d.unconfirmed.length ? `Hay ${d.unconfirmed.length} sin confirmar (#${d.unconfirmed.join(', #')}): confírmalos para que cuenten seguro.` : ''}
            </p>
          </Card>
          <div className="space-y-4">
            {active.map((day) => (
              <Section
                key={day.date}
                title={<span className="first-letter:uppercase inline-block">{relDay(day.date)}</span>}
                action={
                  <span className="flex items-center gap-2">
                    {day.date === d.busiest_day && <Badge tone="amber">Día más cargado</Badge>}
                    <span className="text-[13px] text-choco-500 tabular-nums">≈ {hours(day.minutes)}</span>
                  </span>
                }
              >
                <Card className="p-4 space-y-3.5">
                  <div className="flex flex-wrap gap-1.5">
                    {day.products.map((p) => (
                      <span key={p.name} className="rounded-full bg-cream-100 ring-1 ring-inset ring-cream-200 px-2.5 py-1 text-[13px] text-choco-800">
                        <b className="font-semibold">{num(p.quantity)}</b> × {p.name}
                      </span>
                    ))}
                  </div>
                  {day.batches.length > 0 && (
                    <div className="rounded-xl bg-plum-50 ring-1 ring-inset ring-plum-100 px-3.5 py-2.5 text-sm text-plum-700 space-y-1">
                      {day.batches.map((b) => (
                        <div key={b.recipe} className="flex gap-2">
                          <Layers size={15} className="mt-0.5 shrink-0" />
                          <span>
                            Haz <b>{b.recipe}</b> de una vez ({num(b.batches, 1)} tandas) para los pedidos #{b.orders.join(', #')}.
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {day.shortages.length > 0 && (
                    <div className="rounded-xl bg-red-50 ring-1 ring-inset ring-red-200 px-3.5 py-2.5 text-sm text-red-800 space-y-1">
                      {day.shortages.map((s) => (
                        <div key={s.item_id} className="flex gap-2">
                          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                          <span>
                            Te faltará <b>{qty(s.missing, s.unit)}</b> de {s.name.toLowerCase()}.
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="divide-y divide-cream-200/80 -mx-4 border-t border-cream-200/80">
                    {day.orders.map((o) => (
                      <Link key={o.id} to={`/pedidos/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-cream-50 text-sm">
                        <span className="text-choco-400 tabular-nums">#{o.number}</span>
                        <span className="flex-1 min-w-0 truncate text-choco-900">{o.customer_name}</span>
                        {o.overdue && <Badge tone="red">Atrasado</Badge>}
                        {o.status === 'nuevo' && <Badge tone="blue">Sin confirmar</Badge>}
                        <span className="text-choco-500 text-[13px] whitespace-nowrap">
                          Entrega {relDay(o.delivery_date).toLowerCase()} {o.delivery_time ?? ''}
                        </span>
                      </Link>
                    ))}
                  </div>
                </Card>
              </Section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
