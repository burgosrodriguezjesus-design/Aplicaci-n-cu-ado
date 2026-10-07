import { useEffect, useRef, useState } from 'react';
import { money } from '../lib/format';
import { cx } from './ui';

// Colores de gráfica validados (contraste y daltonismo) sobre fondo blanco.
export const SERIES = { blue: '#2a78d6', orange: '#eb6834', red: '#e34948' };
const GRID = '#ece4da';
const AXIS = '#d9cbbb';
const MUTED = '#8a7265';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Marcas de eje "redondas": 0 / 500 / 1.000… */
function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

const compact = (n: number) =>
  Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} mil` : n.toLocaleString('es-ES', { maximumFractionDigits: 0 });

/** Barra con el extremo de datos redondeado (4px) y cuadrada en la línea base. */
function barPath(x: number, w: number, y0: number, y1: number) {
  const r = Math.min(4, w / 2, Math.abs(y1 - y0));
  if (y1 <= y0) {
    // hacia arriba
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
  }
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`;
}

export interface ColumnDatum {
  label: string;
  long: string;
  values: number[];
}

/**
 * Columnas agrupadas (o una sola serie, admite negativos).
 * Cada grupo es un objetivo táctil/teclado con su tooltip.
 */
export function ColumnChart({
  data,
  series,
  colorFor,
  height = 220,
  extra,
}: {
  data: ColumnDatum[];
  series: { name: string; color: string }[];
  colorFor?: (value: number, seriesIndex: number) => string;
  height?: number;
  extra?: (d: ColumnDatum) => React.ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 44;
  const padB = 26;
  const padT = 8;
  const plotW = width - padL - 4;
  const plotH = height - padB - padT;
  const all = data.flatMap((d) => d.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all, 1));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const y = (v: number) => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const band = plotW / Math.max(data.length, 1);
  const n = series.length;
  const gap = 2;
  const barW = Math.min(24, (band * 0.7 - gap * (n - 1)) / n);
  const groupW = barW * n + gap * (n - 1);
  const showEvery = band < 34 ? 2 : 1;

  return (
    <div ref={ref} className="relative select-none">
      <svg width={width} height={height} role="img" aria-label={series.map((s) => s.name).join(' y ')} className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - 4} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = padL + i * band + (band - groupW) / 2;
          return (
            <g key={d.label}>
              {d.values.map((v, s) => (
                <path
                  key={s}
                  d={barPath(gx + s * (barW + gap), barW, y(0), y(v))}
                  fill={colorFor ? colorFor(v, s) : series[s].color}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              ))}
              {i % showEvery === 0 && (
                <text x={padL + i * band + band / 2} y={height - 8} textAnchor="middle" fontSize={11} fill={MUTED} fontWeight={hover === i ? 800 : 600}>
                  {d.label}
                </text>
              )}
              {/* Objetivo de puntero/teclado: toda la columna del grupo */}
              <rect
                x={padL + i * band}
                y={padT}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.long}: ${series.map((s, k) => `${s.name} ${money(d.values[k])}`).join(', ')}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                style={{ outline: 'none', cursor: 'default' }}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-xl bg-white shadow-lg border border-cream-200 px-3 py-2 text-sm min-w-40"
          style={{
            left: Math.min(Math.max(padL + hover * band + band / 2 - 80, 0), width - 170),
          }}
        >
          <div className="font-bold text-choco-500 mb-1 first-letter:uppercase">{data[hover].long}</div>
          {series.map((s, k) => (
            <div key={s.name} className="flex items-center gap-2">
              <span className="h-0.5 w-3 rounded" style={{ background: colorFor ? colorFor(data[hover].values[k], k) : s.color }} />
              <span className="font-extrabold text-choco-900 tabular-nums">{money(data[hover].values[k])}</span>
              <span className="text-choco-500">{s.name}</span>
            </div>
          ))}
          {extra?.(data[hover])}
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-choco-700">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: i.color }} /> {i.name}
        </span>
      ))}
    </div>
  );
}

/** Barras horizontales ordenadas (una sola serie: sin leyenda, valor en la punta). */
export function HBars({ rows, color = SERIES.blue, format = money }: { rows: { label: string; value: number }[]; color?: string; format?: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-semibold text-choco-700">{r.label}</span>
            <span className="font-extrabold tabular-nums text-choco-900">{format(r.value)}</span>
          </div>
          <div className="h-3 rounded-r bg-cream-100">
            <div className={cx('h-full rounded-r')} style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
