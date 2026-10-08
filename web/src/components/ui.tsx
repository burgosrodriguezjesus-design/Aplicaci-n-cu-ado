import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import { CakeSlice, ChevronDown, ChevronLeft, CircleAlert, Cookie, Flame, Gift, Layers, LoaderCircle, Minus, Package, Paintbrush, Plus, Search, Truck, Utensils, X, type LucideIcon } from 'lucide-react';
import { STATUS_LABELS, STATUS_SHORT, type OrderStatus, type ProductCategory, type Stage } from '@shared/constants';
import { imageUrl } from '../lib/image';
import { num, parseNum } from '../lib/format';

export function cx(...c: (string | number | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-choco-800 to-choco-900 text-white hover:from-choco-700 hover:to-choco-800 shadow-[0_1px_0_rgb(255_255_255/0.08)_inset,0_6px_16px_-6px_rgb(42_29_24/0.55)]',
  accent:
    'bg-gradient-to-b from-berry-500 to-berry-600 text-white hover:from-berry-600 hover:to-berry-700 shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_6px_16px_-6px_rgb(149_83_63/0.6)]',
  secondary: 'bg-white text-choco-800 border border-cream-300 hover:border-choco-400/60 hover:bg-cream-50 shadow-[0_1px_2px_rgb(42_29_24/0.04)]',
  outline: 'bg-white text-choco-800 border border-cream-300 hover:border-choco-400/60 hover:bg-cream-50 shadow-[0_1px_2px_rgb(42_29_24/0.04)]',
  ghost: 'bg-transparent text-choco-700 hover:bg-cream-200/70',
  danger: 'bg-white text-red-700 hover:bg-red-50 border border-red-200',
  success:
    'bg-gradient-to-b from-sage-500 to-sage-700 text-white shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_6px_16px_-6px_rgb(43_98_67/0.6)]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  block,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}) {
  const sizes = { sm: 'h-9 px-3.5 text-[13px] gap-1.5', md: 'h-11 px-4 text-sm gap-2', lg: 'h-12 px-5 text-[15px] gap-2' };
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-xl font-medium whitespace-nowrap transition active:scale-[0.98] select-none disabled:opacity-40 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
    >
      {loading ? <LoaderCircle className="animate-spin" size={16} /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        'inline-flex h-10 w-10 items-center justify-center rounded-xl text-choco-700 hover:bg-cream-200/70 active:bg-cream-200 transition disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Estructura
// ---------------------------------------------------------------------------

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div className={cx('card', onClick && 'cursor-pointer hover:shadow-[var(--shadow-lift)] transition', className)} onClick={onClick}>
      {children}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('min-w-0 space-y-3', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title && <h2 className="section-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string | boolean;
  actions?: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <div className="flex items-center gap-2 mb-6">
      {back && (
        <IconButton
          label="Volver"
          className="-ml-2 shrink-0"
          onClick={() => (typeof back === 'string' ? nav(back) : window.history.length > 1 ? nav(-1) : nav('/'))}
        >
          <ChevronLeft size={22} />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-[28px] font-medium text-choco-900 leading-tight truncate">{title}</h1>
        {subtitle && <div className="text-sm text-choco-500 mt-1">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }: { icon?: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center text-center px-6 py-12 gap-1.5">
      {Icon && (
        <div className="mb-3 h-14 w-14 rounded-2xl bg-gradient-to-br from-berry-50 to-caramel-50 border border-berry-100 flex items-center justify-center text-berry-500">
          <Icon size={24} strokeWidth={1.6} />
        </div>
      )}
      <div className="font-display text-xl font-medium text-choco-900">{title}</div>
      {text && <p className="text-sm text-choco-500 max-w-sm">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-choco-500">
      <LoaderCircle className="animate-spin" size={18} /> <span className="text-sm">{text}</span>
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="card p-5 text-center space-y-3">
      <CircleAlert className="mx-auto text-choco-400" size={24} strokeWidth={1.75} />
      <p className="font-medium">{(error as Error)?.message || 'No se ha podido cargar'}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function Collapsible({
  title,
  children,
  defaultOpen = false,
  right,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  right?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button type="button" className="w-full flex items-center gap-2 px-4 py-3.5 text-left" onClick={() => setOpen(!open)}>
        <span className="flex-1 font-medium">{title}</span>
        {right}
        <ChevronDown size={18} className={cx('transition text-choco-500', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4 anim-fade">{children}</div>}
    </div>
  );
}

export function ProgressBar({ value, total, className }: { value: number; total: number; className?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className={cx('h-1.5 rounded-full bg-cream-200 overflow-hidden', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all', pct === 100 ? 'bg-sage-500' : 'bg-gradient-to-r from-berry-500 to-caramel-500')} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estados y etiquetas
// ---------------------------------------------------------------------------

export const STATUS_STYLE: Record<OrderStatus, { badge: string; dot: string; bar: string }> = {
  nuevo: { badge: 'bg-sky-50 text-sky-800 ring-sky-600/20', dot: 'bg-sky-500', bar: 'border-l-sky-500' },
  confirmado: { badge: 'bg-indigo-50 text-indigo-800 ring-indigo-600/20', dot: 'bg-indigo-500', bar: 'border-l-indigo-500' },
  pendiente: { badge: 'bg-amber-50 text-amber-800 ring-amber-600/25', dot: 'bg-amber-500', bar: 'border-l-amber-500' },
  en_preparacion: { badge: 'bg-orange-50 text-orange-800 ring-orange-600/20', dot: 'bg-orange-500', bar: 'border-l-orange-500' },
  terminado: { badge: 'bg-teal-50 text-teal-800 ring-teal-600/20', dot: 'bg-teal-500', bar: 'border-l-teal-500' },
  entregado: { badge: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20', dot: 'bg-emerald-500', bar: 'border-l-emerald-500' },
  cancelado: { badge: 'bg-stone-50 text-stone-500 ring-stone-500/20 line-through', dot: 'bg-stone-400', bar: 'border-l-stone-300' },
};

export function StatusBadge({ status, long, className }: { status: OrderStatus; long?: boolean; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        STATUS_STYLE[status].badge,
        className,
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', STATUS_STYLE[status].dot)} />
      {long ? STATUS_LABELS[status] : STATUS_SHORT[status]}
    </span>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'red' | 'amber' | 'green' | 'berry' | 'blue'; className?: string }) {
  const tones = {
    neutral: 'bg-cream-100 text-choco-700 ring-choco-500/15',
    red: 'bg-red-50 text-red-700 ring-red-600/20',
    amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
    green: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
    berry: 'bg-berry-50 text-berry-700 ring-berry-600/20',
    blue: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  };
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

export const STAGE_ICON: Record<Stage, LucideIcon> = {
  preparar: Utensils,
  hornear: Flame,
  rellenar: Layers,
  decorar: Paintbrush,
  empaquetar: Package,
  entregar: Truck,
};

export const CATEGORY_ICON: Record<ProductCategory, LucideIcon> = {
  tartas: CakeSlice,
  tartas_personalizadas: CakeSlice,
  cupcakes: CakeSlice,
  galletas: Cookie,
  brownies: Package,
  cheesecakes: CakeSlice,
  packs: Gift,
  otros: Package,
};

/** Tonos suaves (fondo + icono) para dar color sin estridencias. */
export const TINTS = {
  rose: 'bg-berry-50 text-berry-700 ring-berry-100',
  caramel: 'bg-caramel-50 text-caramel-700 ring-caramel-100/80',
  sage: 'bg-sage-50 text-sage-700 ring-sage-100',
  plum: 'bg-plum-50 text-plum-700 ring-plum-100',
  sky: 'bg-sky-50 text-sky-700 ring-sky-100',
  cocoa: 'bg-cream-100 text-choco-700 ring-cream-200',
} as const;
export type Tint = keyof typeof TINTS;

export const STAGE_TINT: Record<Stage, Tint> = {
  preparar: 'caramel',
  hornear: 'rose',
  rellenar: 'plum',
  decorar: 'rose',
  empaquetar: 'sage',
  entregar: 'sky',
};
export const CATEGORY_TINT: Record<ProductCategory, Tint> = {
  tartas: 'rose',
  tartas_personalizadas: 'plum',
  cupcakes: 'rose',
  galletas: 'caramel',
  brownies: 'cocoa',
  cheesecakes: 'caramel',
  packs: 'sage',
  otros: 'cocoa',
};

/** Icono en una pastilla de color suave. */
export function TintIcon({ icon: Icon, tint = 'cocoa', size = 'md', className }: { icon: LucideIcon; tint?: Tint; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = { sm: 'h-8 w-8 rounded-lg', md: 'h-10 w-10 rounded-xl', lg: 'h-12 w-12 rounded-2xl' }[size];
  const ic = { sm: 15, md: 18, lg: 22 }[size];
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center ring-1 ring-inset', box, TINTS[tint], className)}>
      <Icon size={ic} strokeWidth={1.75} />
    </span>
  );
}

/** Icono de una fase de producción. */
export function StageIcon({ stage, className }: { stage: Stage; className?: string }) {
  return <TintIcon icon={STAGE_ICON[stage] ?? Package} tint={STAGE_TINT[stage] ?? 'cocoa'} size="sm" className={className} />;
}

export function CategoryIcon({ category, className }: { category?: string | null; className?: string }) {
  const c = (category as ProductCategory) ?? 'otros';
  return <TintIcon icon={CATEGORY_ICON[c] ?? CakeSlice} tint={CATEGORY_TINT[c] ?? 'cocoa'} size="sm" className={className} />;
}

/** Foto del producto o, si no hay, un hueco neutro con el icono de su categoría. */
export function Thumb({
  photoId,
  category,
  icon,
  className,
  rounded = 'rounded-xl',
}: {
  photoId?: number | null;
  category?: ProductCategory | string | null;
  icon?: LucideIcon;
  className?: string;
  rounded?: string;
}) {
  if (photoId) {
    return <img src={imageUrl(photoId)} alt="" loading="lazy" className={cx('object-cover bg-cream-200', rounded, className)} />;
  }
  const c = (category as ProductCategory) ?? 'otros';
  const Icon = icon ?? CATEGORY_ICON[c] ?? CakeSlice;
  const tint = icon ? 'rose' : (CATEGORY_TINT[c] ?? 'cocoa');
  return (
    <div className={cx('relative flex items-center justify-center overflow-hidden ring-1 ring-inset', TINTS[tint], rounded, className)} aria-hidden>
      <div className="absolute inset-0 opacity-60 bg-[radial-gradient(circle_at_30%_20%,white_0%,transparent_60%)]" />
      <Icon className="relative h-[40%] w-[40%] max-h-12 max-w-12" strokeWidth={1.4} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formularios
// ---------------------------------------------------------------------------

/**
 * Campo con etiqueta. Para un único control usa <label>; para grupos de botones
 * (chips) usa `group`, así pulsar el título no activa el primer botón.
 */
export function Field({
  label,
  hint,
  children,
  className,
  group,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  group?: boolean;
}) {
  const id = useId();
  if (group) {
    return (
      <div role="group" aria-labelledby={label ? id : undefined} className={cx('block', className)}>
        {label && (
          <span id={id} className="label">
            {label}
          </span>
        )}
        {children}
        {hint && <span className="block text-xs text-choco-500 mt-1.5">{hint}</span>}
      </div>
    );
  }
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="block text-xs text-choco-500 mt-1.5">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('input', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx('input resize-y min-h-[3rem]', props.className)} />;
}

export function Select({
  value,
  onChange,
  options,
  className,
  placeholder,
}: {
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={cx('relative', className)}>
      <select className="input appearance-none pr-10" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-choco-500" />
    </div>
  );
}

/** Campo numérico que acepta coma decimal (teclado numérico en el móvil). */
export function NumberInput({
  value,
  onChange,
  suffix,
  className,
  placeholder,
  integer,
  ...rest
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  suffix?: string;
  className?: string;
  placeholder?: string;
  integer?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const fmt = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '' : String(v).replace('.', ','));
  const [text, setText] = useState(fmt(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current && parseNum(text) !== value) setText(fmt(value));
    last.current = value;
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={cx('relative', className)}>
      <input
        {...rest}
        className={cx('input', suffix && 'pr-12')}
        inputMode={integer ? 'numeric' : 'decimal'}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,-]/g, '');
          setText(t);
          const n = parseNum(t);
          last.current = n;
          onChange(n);
        }}
        onFocus={(e) => e.target.select()}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-choco-500 text-sm pointer-events-none">{suffix}</span>}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  step = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  label?: string;
}) {
  return (
    <div className="inline-flex items-center rounded-xl border border-cream-300 bg-white shadow-[0_1px_2px_rgb(42_29_24/0.04)]" aria-label={label}>
      <button type="button" className="h-11 w-11 flex items-center justify-center text-berry-600 hover:bg-berry-50 rounded-l-xl disabled:opacity-30" disabled={value - step < min} onClick={() => onChange(Math.max(min, +(value - step).toFixed(3)))} aria-label="Menos">
        <Minus size={16} />
      </button>
      <input
        className="w-12 text-center font-semibold tabular-nums bg-transparent outline-none border-x border-cream-200 h-11"
        inputMode="decimal"
        value={num(value)}
        onChange={(e) => {
          const n = parseNum(e.target.value);
          if (n !== null && n >= min) onChange(n);
        }}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" className="h-11 w-11 flex items-center justify-center text-berry-600 hover:bg-berry-50 rounded-r-xl" onClick={() => onChange(+(value + step).toFixed(3))} aria-label="Más">
        <Plus size={16} />
      </button>
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  className,
  tone = 'berry',
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  tone?: 'berry' | 'red';
}) {
  const on = tone === 'red' ? 'bg-red-50 text-red-800 border-red-300' : 'bg-choco-900 text-white border-choco-900 shadow-[0_4px_12px_-4px_rgb(42_29_24/0.5)]';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 h-9 text-[13px] font-medium whitespace-nowrap transition shrink-0',
        active ? on : 'bg-white text-choco-700 border-cream-300 hover:border-choco-400/60',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Opciones rápidas + texto libre (sabor, relleno, cobertura…). */
export function ChipInput({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  const custom = !!value && !options.includes(value);
  return (
    <div className="space-y-2">
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <Chip key={o} active={value === o} onClick={() => onChange(value === o ? null : o)}>
              {o}
            </Chip>
          ))}
        </div>
      )}
      <Input
        value={custom ? value! : ''}
        placeholder={placeholder ?? (options.length ? 'Otro…' : 'Escribe…')}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-start gap-3 py-2 cursor-pointer">
      <span className="flex-1">
        <span className="block font-medium text-choco-900">{label}</span>
        {hint && <span className="block text-sm text-choco-500">{hint}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 rounded-full transition shrink-0 mt-0.5', checked ? 'bg-berry-500' : 'bg-cream-300')}
      >
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cx('flex rounded-xl bg-cream-200/70 p-1 gap-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 h-9 rounded-lg text-[13px] font-medium transition px-2 whitespace-nowrap',
            value === o.value ? 'bg-white text-choco-900 shadow-[0_1px_3px_rgb(42_29_24/0.12)]' : 'text-choco-500 hover:text-choco-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-choco-400 pointer-events-none" />
      <input
        type="search"
        className="input pl-9"
        value={value}
        placeholder={placeholder ?? 'Buscar…'}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ventanas (hoja inferior en móvil, ventana centrada en ordenador)
// ---------------------------------------------------------------------------

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-choco-900/40 backdrop-blur-[3px] anim-fade" onClick={onClose} />
      <div
        className={cx(
          'relative anim-sheet bg-cream-50 w-full rounded-t-[28px] sm:rounded-3xl max-h-[92dvh] flex flex-col shadow-2xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-cream-300" />
        <div className="flex items-center gap-2 px-5 pt-3 sm:pt-5 pb-3">
          <div className="flex-1 font-display text-[22px] font-medium text-choco-900">{title}</div>
          <IconButton label="Cerrar" onClick={onClose} className="-mr-2">
            <X size={18} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 pb-5 flex-1">{children}</div>
        {footer && <div className="border-t border-cream-200 px-5 py-3 pb-safe bg-white sm:rounded-b-3xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// Confirmaciones con promesa: `if (await confirm('¿Seguro?')) …`
interface ConfirmOpts {
  title: string;
  text?: ReactNode;
  ok?: string;
  cancel?: string;
  danger?: boolean;
}
const ConfirmCtx = createContext<(o: ConfirmOpts | string) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback(
    (o: ConfirmOpts | string) =>
      new Promise<boolean>((resolve) => setState({ ...(typeof o === 'string' ? { title: o } : o), resolve })),
    [],
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Sheet
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => close(false)}>
              {state?.cancel ?? 'Cancelar'}
            </Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} block onClick={() => close(true)}>
              {state?.ok ?? 'Aceptar'}
            </Button>
          </div>
        }
      >
        {state?.text && <div className="text-sm text-choco-700">{state.text}</div>}
      </Sheet>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmCtx);
}

export function LinkRow({ to, children, right }: { to: string; children: ReactNode; right?: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50 active:bg-cream-100 transition">
      <div className="flex-1 min-w-0">{children}</div>
      {right}
    </Link>
  );
}

/** Botón flotante (+) en móvil. */
export function Fab({ to, label, onClick }: { to?: string; label: string; onClick?: () => void }) {
  const cls =
    'lg:hidden fixed right-5 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-40 h-14 w-14 rounded-2xl bg-gradient-to-br from-berry-500 to-berry-700 text-white flex items-center justify-center shadow-[0_12px_28px_-8px_rgb(149_83_63/0.7)] active:scale-95 transition';
  if (to)
    return (
      <Link to={to} className={cls} aria-label={label} title={label}>
        <Plus size={24} strokeWidth={2} />
      </Link>
    );
  return (
    <button type="button" className={cls} aria-label={label} title={label} onClick={onClick}>
      <Plus size={24} strokeWidth={2} />
    </button>
  );
}
