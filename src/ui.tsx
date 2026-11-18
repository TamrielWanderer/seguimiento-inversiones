// Componentes propios que reemplazan a los de "grok/canvas".
// Misma forma de uso (props) que tenía la página, para no tocar su lógica.
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export { useEffect, useMemo, useRef, useState };
export type { CSSProperties, ReactNode };

// ── Tema ─────────────────────────────────────────────────────────────────────
const FAMILY = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const THEME = {
  font: {
    family: FAMILY,
    caption: { fontSize: 12, lineHeight: "16px" } as CSSProperties,
    body1: { fontSize: 14, lineHeight: "20px" } as CSSProperties,
    label: { fontSize: 13, lineHeight: "18px" } as CSSProperties,
    metric: { fontSize: 24, lineHeight: "30px", fontWeight: 700, fontVariantNumeric: "tabular-nums" } as CSSProperties,
  },
  weight: { semibold: 600, bold: 700 },
};
export type Theme = typeof THEME;
export const useTheme = (): Theme => THEME;

const PALETTE = ["#2e5bda", "#12a594", "#e0a21b", "#8e5bd0", "#d9567b", "#6f9bf2", "#7a8699", "#3ba55d"];
type Tone = "success" | "danger" | "warning" | "info" | undefined;
const toneClass = (t: Tone) => (t ? ` ui-tone-${t}` : "");

// ── Página ───────────────────────────────────────────────────────────────────
export function Page({ title, sources, children }: { title: string; summary?: string; width?: string; palette?: readonly string[]; sources?: string[]; children?: ReactNode }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <div className="ui-page">
      {children}
      {sources?.length ? <footer className="ui-footer">{sources.join(" ")}</footer> : null}
    </div>
  );
}

const DepthCtx = createContext(0);

export function Section({ heading, id, caption, actions, collapsible, defaultOpen = true, children }: {
  heading?: string; id?: string; caption?: string; actions?: ReactNode; collapsible?: boolean; defaultOpen?: boolean; children?: ReactNode;
}) {
  const depth = useContext(DepthCtx);
  const H = depth === 0 ? "h2" : depth === 1 ? "h3" : "h4";
  const head = heading ? (
    <div className="ui-section-head">
      <H className="ui-section-title">{heading}</H>
      {actions ? <div className="ui-section-actions">{actions}</div> : null}
    </div>
  ) : null;
  const body = (
    <DepthCtx.Provider value={depth + 1}>
      {caption ? <p className="ui-caption">{caption}</p> : null}
      <div className="ui-stack">{children}</div>
    </DepthCtx.Provider>
  );
  if (collapsible) {
    return (
      <details className={`ui-section ui-depth-${depth} ui-collapsible`} id={id} open={defaultOpen}>
        <summary>{heading}</summary>
        {body}
      </details>
    );
  }
  return (
    <section className={`ui-section ui-depth-${depth}`} id={id}>
      {head}
      {body}
    </section>
  );
}

export function Grid({ columns = 2, children }: { columns?: number; children?: ReactNode }) {
  return <div className={`ui-grid ui-grid-${columns}`}>{children}</div>;
}

export function Text({ children }: { children?: ReactNode }) {
  return <p className="ui-text">{children}</p>;
}

export function Callout({ tone = "info", lead, children }: { tone?: "info" | "warning" | "success" | "danger"; lead?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`ui-callout ui-callout-${tone}`} role={tone === "warning" || tone === "danger" ? "alert" : undefined}>
      {lead ? <strong className="ui-callout-lead">{lead}</strong> : null}
      {children ? <div className="ui-callout-body">{children}</div> : null}
    </div>
  );
}

// ── Tabla ────────────────────────────────────────────────────────────────────
export type TableCell = string | number | null | undefined | ReactNode | { text: string; tone?: Tone };

function isToneCell(c: unknown): c is { text: string; tone?: Tone } {
  return !!c && typeof c === "object" && !isValidElement(c) && "text" in (c as object);
}

export function Table({ columns, rows, align }: { columns: string[]; rows: TableCell[][]; align?: ("start" | "end" | "center")[] }) {
  const al = (i: number) => (align?.[i] === "end" ? "right" : align?.[i] === "center" ? "center" : "left");
  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead>
          <tr>{columns.map((c, i) => <th key={i} style={{ textAlign: al(i) }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => {
                if (isToneCell(c)) return <td key={j} style={{ textAlign: al(j) }} className={toneClass(c.tone).trim()}>{c.text}</td>;
                const long = typeof c === "string" && c.length > 42;
                return <td key={j} style={{ textAlign: al(j) }} className={long ? "ui-wrap" : undefined}>{c as ReactNode}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Indicadores ──────────────────────────────────────────────────────────────
export function Metrics({ metrics }: { metrics: { value: ReactNode; label: string; detail?: ReactNode; tone?: Tone }[] }) {
  return (
    <div className="ui-metrics">
      {metrics.map((m, i) => (
        <div className="ui-metric" key={i}>
          <div className="ui-metric-label">{m.label}</div>
          <div className={`ui-metric-value${toneClass(m.tone)}`}>{m.value}</div>
          {m.detail ? <div className="ui-metric-detail">{m.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function Properties({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="ui-props">
      {items.map((it, i) => (
        <div key={i}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Gráficos ─────────────────────────────────────────────────────────────────
function useWidth<T extends HTMLElement>(fallback = 600): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(Math.max(240, el.clientWidth || fallback));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w];
}

export function LineChart({ points, floor, ceiling, unit, format = (v: number) => String(v), labels }: {
  points: { label: string; value: number }[]; floor: number; ceiling: number; unit?: string; format?: (v: number) => string; labels?: string[];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220;
  const pad = { l: 56, r: 14, t: 14, b: 28 };
  const iw = width - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const span = ceiling - floor || 1;
  const x = (i: number) => pad.l + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => pad.t + (1 - (v - floor) / span) * ih;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = points.length ? `${path} L${x(points.length - 1).toFixed(1)},${pad.t + ih} L${x(0).toFixed(1)},${pad.t + ih} Z` : "";
  const up = points.length > 1 && points[points.length - 1].value >= points[0].value;
  const color = up ? "var(--up)" : "var(--down)";
  const ticks = [0, 1, 2, 3].map((k) => floor + (span * k) / 3);
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 70))));
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };
  const h = hover != null ? points[hover] : null;
  return (
    <div className="ui-chart" ref={ref}>
      <div className="ui-chart-head">
        <span>{labels?.join(" · ")}</span>
        {unit ? <span className="ui-chart-unit">{unit}</span> : null}
      </div>
      <svg width={width} height={H} role="img" aria-label={`${labels?.join(", ") ?? "Gráfico"}: de ${points[0] ? format(points[0].value) : "—"} a ${points.length ? format(points[points.length - 1].value) : "—"}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className="ui-grid-line" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="ui-axis">{format(t)}</text>
          </g>
        ))}
        {points.map((p, i) => (i % every === 0 || i === points.length - 1) && (i === points.length - 1 || points.length - 1 - i >= every / 2) ? (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === points.length - 1 ? "end" : i === 0 ? "start" : "middle"} className="ui-axis">{p.label}</text>
        ) : null)}
        <path d={area} fill={color} opacity={0.08} />
        <path d={path} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
        {points.length ? <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].value)} r={3.5} fill={color} /> : null}
        {h && hover != null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="ui-hover-line" />
            <circle cx={x(hover)} cy={y(h.value)} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
          </g>
        ) : null}
      </svg>
      {h && hover != null ? (
        <div className="ui-tip" style={{ left: Math.min(Math.max(x(hover) - 60, 0), width - 130), top: Math.max(y(h.value) - 52, 0) }}>
          <div className="ui-tip-label">{h.label}</div>
          <div className="ui-tip-value">{unit ? `${unit} ` : ""}{format(h.value)}</div>
        </div>
      ) : null}
    </div>
  );
}

export function Columns({ points }: { points: { label: string; value: number; display?: string }[]; emphasis?: string }) {
  const max = Math.max(0, ...points.map((p) => p.value)) || 1;
  return (
    <div className="ui-columns" role="img" aria-label={points.map((p) => `${p.label}: ${p.display ?? p.value}`).join(", ")}>
      {points.map((p, i) => (
        <div className="ui-col" key={i} title={`${p.label}: ${p.display ?? p.value}`}>
          <div className="ui-col-val">{p.value > 0 ? (p.display ?? p.value) : ""}</div>
          <div className="ui-col-track">
            <div className="ui-col-bar" style={{ height: `${(p.value / max) * 100}%` }} />
          </div>
          <div className="ui-col-label">{p.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Bars({ bars }: { bars: { label: string; value: number; display?: string; meta?: string }[]; emphasis?: string }) {
  const max = Math.max(...bars.map((b) => Math.abs(b.value)), 0) || 1;
  return (
    <div className="ui-bars">
      {bars.map((b, i) => (
        <div className="ui-bar-row" key={i}>
          <div className="ui-bar-label">{b.label}</div>
          <div className="ui-bar-track">
            <div className="ui-bar-fill" style={{ width: `${(Math.abs(b.value) / max) * 100}%`, background: b.value >= 0 ? "var(--up)" : "var(--down)" }} />
          </div>
          <div className={`ui-bar-num${b.value >= 0 ? " ui-tone-success" : " ui-tone-danger"}`}>
            {b.display ?? b.value}
            {b.meta ? <span className="ui-bar-meta"> {b.meta}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Pie({ parts, total, label }: { parts: { label: string; value: number; display?: string }[]; total?: ReactNode; label?: string }) {
  const sum = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  const R = 70;
  const r = 46;
  let acc = 0;
  const arcs = parts.map((p, i) => {
    const a0 = (acc / sum) * Math.PI * 2;
    acc += Math.max(0, p.value);
    const a1 = (acc / sum) * Math.PI * 2;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (rad: number, a: number) => [80 + rad * Math.sin(a), 80 - rad * Math.cos(a)];
    const full = a1 - a0 >= Math.PI * 2 - 1e-6;
    const [x0, y0] = pt(R, a0);
    const [x1, y1] = pt(R, full ? a1 - 1e-4 : a1);
    const [x2, y2] = pt(r, full ? a1 - 1e-4 : a1);
    const [x3, y3] = pt(r, a0);
    const d = `M${x0},${y0} A${R},${R} 0 ${big} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${big} 0 ${x3},${y3} Z`;
    return <path key={i} d={d} fill={PALETTE[i % PALETTE.length]} stroke="var(--surface)" strokeWidth={1.5}><title>{`${p.label}: ${p.display ?? p.value}`}</title></path>;
  });
  return (
    <div className="ui-pie">
      <svg viewBox="0 0 160 160" width={170} height={170} role="img" aria-label={label}>
        {arcs}
        <text x={80} y={76} textAnchor="middle" className="ui-pie-total">{total as string}</text>
        <text x={80} y={94} textAnchor="middle" className="ui-axis">{label}</text>
      </svg>
      <ul className="ui-legend">
        {parts.map((p, i) => (
          <li key={i}>
            <span className="ui-swatch" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="ui-legend-label">{p.label}</span>
            <span className="ui-legend-val">{p.display ?? p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LinkCards({ links }: { links: { title: string; site?: string; date?: string; href: string }[] }) {
  return (
    <div className="ui-links">
      {links.map((l, i) => (
        <a key={i} className="ui-link-card" href={l.href} target="_blank" rel="noopener noreferrer">
          <span className="ui-link-title">{l.title}</span>
          <span className="ui-link-meta">{[l.site, l.date].filter(Boolean).join(" · ")}</span>
        </a>
      ))}
    </div>
  );
}

// ── Controles ────────────────────────────────────────────────────────────────
export function Button({ label, onClick, variant, disabled }: { label: string; onClick?: () => void; variant?: "primary" | "secondary"; disabled?: boolean }) {
  return (
    <button type="button" className={variant === "primary" ? "ui-btn ui-btn-primary" : "ui-btn"} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

let fieldSeq = 0;
function useFieldId(prefix: string) {
  const [id] = useState(() => `${prefix}-${++fieldSeq}`);
  return id;
}

export function Input({ label, value, onChange, placeholder, type = "text" }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  const id = useFieldId("in");
  return (
    <div className="ui-field">
      {label ? <label htmlFor={id}>{label}</label> : null}
      <input id={id} type={type} value={value} placeholder={placeholder} inputMode={type === "text" && /precio|cantidad|dólar/i.test(label ?? "") ? "decimal" : undefined} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Select({ label, options, value, onChange }: { label?: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  const id = useFieldId("sel");
  return (
    <div className="ui-field">
      {label ? <label htmlFor={id}>{label}</label> : null}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="ui-segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? "ui-seg ui-seg-on" : "ui-seg"} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Floating({ children }: { edge?: string; align?: string; children?: ReactNode }) {
  return <div className="ui-floating">{Children.toArray(children)}</div>;
}

export function BackToTop({ label = "Volver arriba" }: { label?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 600);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  if (!show) return null;
  return (
    <button type="button" className="ui-btn ui-totop" aria-label={label} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
      ↑
    </button>
  );
}
