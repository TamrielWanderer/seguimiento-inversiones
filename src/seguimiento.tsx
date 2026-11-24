import {
  BackToTop,
  Button,
  Callout,
  Columns,
  Floating,
  Grid,
  Input,
  LineChart,
  Metrics,
  MultiLine,
  Page,
  Pie,
  Properties,
  Section,
  Segmented,
  Select,
  Table,
  type TableCell,
  Text,
  useEffect,
  useTheme,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Theme,
  type ReactNode,
} from "./ui";
import { applySales, realizedBySale, receivedDividends, portfolioHistory, allocation, posKey, divFactor, depositResult, inflationOver, realReturn, compoundInflation, depositInOtherCurrency, type Ccy, type Lot, type Sale, type Extra, type Env, type DivInfo } from "./calc";
import { tr, setLang, readLang, monthShort, LANGS, type Lang } from "./i18n";
import { DATOS } from "./datos.generado";
import { readMode, setMode, type Mode } from "./tema";
import { buildIcs, type IcsEvent } from "./ics";
import { packSync, unpackSync, newSyncKey, findSync, syncAvailable } from "./sync";
import qrcode from "qrcode-generator";

// ─────────────────────────────────────────────────────────────────────────────
// Los datos de esta página no se editan a mano.
// Los arma `npm run actualizar` (scripts/actualizar.mjs + scripts/armar.mjs)
// a partir de datos/catalogo.json, datos/mercado.json y datos/noticias.json,
// y los deja en src/datos.generado.ts (archivo generado, no se guarda en el repositorio).
// ─────────────────────────────────────────────────────────────────────────────

type Pt = { d: string; v: number };

type Quote = {
  name: string;
  price: number;
  chg: number;
  dayChg: number;
  open: number;
  high: number;
  low: number;
  hi52: number;
  lo52: number;
  m1: number | null;
  m3: number | null;
  pts: Pt[];
  ccy?: "USD" | "AUD";
  asOf: string;
  /** Precio fuera de hora en Nueva York; chg es % contra el último cierre regular. */
  ext?: { s: "pre" | "post"; price: number; chg: number; at: string };
};

type BaKind = "local" | "cedear";
type BaQuote = { symbol: string; name: string; kind: BaKind; price: number; chg: number; dayChg: number; asOf?: string; ratio?: number };
type PersistMode = "loading" | "local" | "memory";
type HeatWindow = "d" | "m1" | "m3";
type MainTab = "calor" | "cartera" | "divs" | "mercado" | "plazo" | "analisis" | "datos" | "info";

type DivRow = {
  ttm: number;
  n12: number | null;
  lastEx: string | null;
  lastAmt: number | null;
  lastPay: string | null;
  nextEx: string | null;
  nextPay: string | null;
  hist: [string, number][];
  partial?: boolean;
};
type Earn = { date: string; estimate: boolean };
type IndexRow = {
  id: string;
  label: string;
  kind: "indice" | "tasa" | "usd" | "fx";
  level: number;
  chg: number | null;
  chgAbs: number | null;
  m1: number | null;
  m3: number | null;
  m1Abs?: number | null;
  m3Abs?: number | null;
  asOf?: string;
};
type Pair = { compra: number; venta: number };
type NewsLink = { title: string; site: string; date: string; href: string };
type TickerNote = { date: string; text: string; news: NewsLink[] };
type CalEvent = { date: string; ticker: string; title: string; detail: string; src: string };

export type Dataset = {
  v: 2;
  generatedAt: string;
  sessions: { ny?: string; asx?: string; ba?: string; fx?: string };
  fx: { mep: Pair; ccl: Pair | null; oficial: Pair | null; blue: Pair | null; audusd: number; audusdChg: number | null };
  mepHist: [string, number][];
  /** Inflación mensual [mes, %] y tasas de plazo fijo por banco (TNA, %), para la calculadora. */
  macro?: { inflacion: [string, number][]; plazoFijo: { b: string; tna: number }[] };
  watchDefault: string[];
  order: string[];
  aliases: Record<string, string[]>;
  catalog: Record<string, Quote>;
  ba: Record<string, BaQuote>;
  div: Record<string, DivRow>;
  earnings: Record<string, Earn>;
  indices: IndexRow[];
  /** [sector, país] por título */
  meta?: Record<string, [string, string]>;
  /** Cierres semanales de 5 años, alineados a weeks */
  hist?: { weeks: string[]; series: Record<string, (number | null)[]> } | null;
  notes: {
    updatedAt: string | null;
    market: string;
    tickers: Record<string, TickerNote>;
    calendar: CalEvent[];
    divNotes: Record<string, string>;
  };
};


/**
 * De dónde buscar datos más nuevos al abrir la página. En el sitio publicado es "datos.json"
 * (al lado de index.html). En la copia que se manda por mail o WhatsApp, la compilación pone la
 * dirección completa del sitio (VITE_DATA_URL), así esa copia también se actualiza si hay internet.
 * Si no se puede leer, la página usa los datos que trae adentro.
 */
const DATA_URL: string = import.meta.env.VITE_DATA_URL || "datos.json";

let D: Dataset = DATOS;
let CATALOG: Record<string, Quote> = D.catalog;
let BA: Partial<Record<string, BaQuote>> = D.ba;
let DIV: Partial<Record<string, DivRow>> = D.div;
let ORDER: string[] = D.order;
let DEFAULT_WATCH: string[] = D.watchDefault;
let ALIASES: Record<string, string[]> = D.aliases;
let MEP_VENTA = D.fx.mep.venta;
let AUDUSD = D.fx.audusd;

function applyDataset(ds: Dataset): void {
  D = ds;
  CATALOG = ds.catalog;
  BA = ds.ba;
  DIV = ds.div;
  ORDER = ds.order;
  DEFAULT_WATCH = ds.watchDefault;
  ALIASES = ds.aliases;
  MEP_VENTA = ds.fx.mep.venta;
  AUDUSD = ds.fx.audusd;
}

function isDataset(x: unknown): x is Dataset {
  if (!x || typeof x !== "object") return false;
  const o = x as Partial<Dataset>;
  return o.v === 2 && typeof o.generatedAt === "string" && Array.isArray(o.order) && !!o.catalog && typeof o.catalog === "object"
    && !!o.fx && !!o.fx.mep && typeof o.fx.mep.venta === "number" && o.order.every((s) => typeof s === "string" && !!o.catalog![s]);
}

const STORAGE_KEY = "familia-inversiones-v1";
// Varias carteras en el mismo navegador: la principal usa STORAGE_KEY; las demás, STORAGE_KEY:id.
const PORTFOLIOS_KEY = "familia-inversiones-carteras-v1";
type PortfolioRef = { id: string; name: string };
const MAIN_PORTFOLIO: PortfolioRef = { id: "principal", name: "Mi cartera" };
let storageKey = STORAGE_KEY;
const keyOfPortfolio = (id: string) => (id === MAIN_PORTFOLIO.id ? STORAGE_KEY : `${STORAGE_KEY}:${id}`);

function readPortfolios(): { active: string; list: PortfolioRef[] } {
  const fallback = { active: MAIN_PORTFOLIO.id, list: [MAIN_PORTFOLIO] };
  try {
    const raw = getStorage()?.getItem(PORTFOLIOS_KEY);
    if (!raw) return fallback;
    const o = JSON.parse(raw) as { active?: unknown; list?: unknown };
    const list = Array.isArray(o.list) ? o.list.filter((x): x is PortfolioRef => !!x && typeof x.id === "string" && typeof x.name === "string" && /^[a-z0-9-]{1,40}$/.test(x.id)) : [];
    if (!list.some((x) => x.id === MAIN_PORTFOLIO.id)) list.unshift(MAIN_PORTFOLIO);
    const active = typeof o.active === "string" && list.some((x) => x.id === o.active) ? o.active : MAIN_PORTFOLIO.id;
    return { active, list };
  } catch {
    return fallback;
  }
}

function writePortfolios(active: string, list: PortfolioRef[]): void {
  try {
    getStorage()?.setItem(PORTFOLIOS_KEY, JSON.stringify({ active, list }));
  } catch { /* sin guardado */ }
}
const TAB_KEY = "familia-inversiones-tab-v1";
const TABS: { value: MainTab; label: string; short: string }[] = [
  { value: "cartera", label: "Cartera", short: "Cartera" },
  { value: "calor", label: "Seguimiento", short: "Lista" },
  { value: "divs", label: "Dividendos", short: "Dividendos" },
  { value: "mercado", label: "Mercado y dólar", short: "Mercado" },
  { value: "plazo", label: "Plazo fijo y CD", short: "Plazo" },
  { value: "analisis", label: "Noticias", short: "Noticias" },
  { value: "datos", label: "Importar y respaldo", short: "Datos" },
  { value: "info", label: "Ayuda", short: "Ayuda" },
];
const FLAT = 0.05;

// ── Fechas ───────────────────────────────────────────────────────────────────

/** "2026-11-16" -> "16 nov 2026" (o "16 nov" sin año). */
function fmtIso(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const s = `${Number(m[3])} ${monthShort(Number(m[2]) - 1)}`;
  return withYear ? `${s} ${m[1]}` : s;
}

/** "2026-11-16" -> "16/11". */
function fmtDM(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : iso;
}

/** Instante ISO -> "16/11/2026, 17:59 (hora de Buenos Aires)". */
function fmtStampBA(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const s = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${s} ${tr("(hora de Buenos Aires)")}`;
}

function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** Antigüedad de los datos: texto y tono para la etiqueta del encabezado. */
function freshness(generatedAt: string, now: Date): { text: string; tone: "ok" | "warn" | "old" } {
  const t = Date.parse(generatedAt);
  if (!Number.isFinite(t)) return { text: tr("sin fecha"), tone: "old" };
  const h = (now.getTime() - t) / 3600000;
  const text = h < 1 / 30 ? tr("recién") : h < 1 ? tr("hace {0} min", Math.max(1, Math.round(h * 60))) : h < 48 ? tr("hace {0} h", Math.floor(h)) : tr("hace {0} días", Math.floor(h / 24));
  // Hasta 30 h es normal (se actualiza una vez por día hábil); los fines de semana se tolera hasta 78 h.
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: "America/Buenos_Aires", weekday: "short" }).format(now);
  const limit = dow === "Sat" || dow === "Sun" || dow === "Mon" ? 78 : 30;
  return { text, tone: h <= limit ? "ok" : h <= limit * 2 ? "warn" : "old" };
}

// ── Dólar MEP histórico (para valuar cada compra con el dólar de ese día) ───
/** MEP venta del día pedido o del último día hábil anterior que haya en la historia. */
function mepOn(iso: string): number | null {
  const h = D.mepHist;
  if (!iso || h.length === 0 || iso < h[0][0]) return null;
  let lo = 0;
  let hi = h.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (h[mid][0] <= iso) lo = mid;
    else hi = mid - 1;
  }
  return h[lo][1];
}

type LotFx = { rate: number; src: "manual" | "historia" | "hoy" };
/** Dólar con el que se convierte el costo de la compra. */
function lotFx(lot: Lot): LotFx {
  if (lot.fx && lot.fx > 0) return { rate: lot.fx, src: "manual" };
  const h = lot.date ? mepOn(lot.date) : null;
  if (h) return { rate: h, src: "historia" };
  return { rate: MEP_VENTA, src: "hoy" };
}

/** Puntos para LineChart y su piso/techo (8 % del rango de margen). */
function chartOf(q: Quote): { points: { label: string; value: number }[]; floor: number; ceil: number } {
  const points = q.pts.map((p) => ({ label: fmtIso(p.d, false), value: p.v }));
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals, q.price);
  const hi = Math.max(...vals, q.price);
  const pad = (hi - lo) * 0.08 || Math.abs(q.price) * 0.02 || 1;
  return { points, floor: Math.round((lo - pad) * 100) / 100, ceil: Math.round((hi + pad) * 100) / 100 };
}

/** Frecuencia de pago según la cantidad de pagos en 12 meses. */
function freqText(d: DivRow): string {
  const n = d.n12;
  if (n == null) return "—";
  if (n === 0) return d.lastEx ? tr("Sin pagos en 12 meses") : tr("No paga");
  if (n >= 11) return tr("Mensual ({0} pagos en 12 meses)", n);
  if (n === 4) return tr("Trimestral");
  if (n === 2) return tr("Semestral");
  if (n === 1) return tr("1 pago en 12 meses");
  return tr("{0} pagos en 12 meses", n);
}

function normQuery(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function catalogHits(query: string): string[] {
  const q = normQuery(query);
  if (!q) return [];
  const compact = q.replace(/\s+/g, "");
  const scored: { sym: string; score: number }[] = [];
  for (const sym of ORDER) {
    const ticker = normQuery(sym);
    const name = normQuery(CATALOG[sym].name);
    const ba = BA[sym] ? normQuery(BA[sym]!.symbol) : "";
    const aliases = (ALIASES[sym] ?? []).map((a) => normQuery(a));
    const nameCompact = name.replace(/\s+/g, "");
    let score = -1;
    if (ticker === compact || ticker === q) score = 100;
    else if (ticker.startsWith(compact)) score = 90;
    else if (ticker.includes(compact)) score = 75;
    else if (aliases.some((a) => a === q || a === compact)) score = 72;
    else if (ba && (ba.replace(/\s+/g, "").startsWith(compact) || ba.includes(q))) score = 70;
    else if (aliases.some((a) => a.startsWith(q) || a.startsWith(compact))) score = 65;
    else if (name.split(" ").some((w) => w === q || w.startsWith(q))) score = 60;
    else if (aliases.some((a) => compact.length >= 4 && a.includes(q))) score = 55;
    else if (compact.length >= 4 && (name.includes(q) || nameCompact.includes(compact))) score = 50;
    if (score >= 0) scored.push({ sym, score });
  }
  scored.sort((a, b) => b.score - a.score || ORDER.indexOf(a.sym) - ORDER.indexOf(b.sym));
  return scored.map((s) => s.sym);
}

function formatDec(n: number, d = 2): string {
  const fixed = Math.abs(n).toFixed(d);
  const [intRaw, frac] = fixed.split(".");
  const int = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return d > 0 ? `${int},${frac}` : int;
}

function pxDec(n: number): string {
  const t = Math.round(n * 1000) / 1000;
  const d = Number.isInteger(Math.round(t * 1000) / 10) ? 2 : 3;
  return formatDec(t, d);
}

const PCT = (n: number | null | undefined, d = 2) => {
  if (n == null || !Number.isFinite(n)) return "—";
  const body = formatDec(Math.abs(n), d);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${body} %`;
};

const YLD = (n: number, d = 2) => `${formatDec(n, d)} %`;

const MONEY = (n: number) => {
  const body = formatDec(Math.abs(n));
  return n < 0 ? `−USD ${body}` : `USD ${body}`;
};

const PESOS = (n: number, d = 2) => {
  const body = formatDec(Math.abs(n), d);
  return n < 0 ? `−$ ${body}` : `$ ${body}`;
};

const AUDS = (n: number, d = 2) => {
  const body = formatDec(Math.abs(n), d);
  return n < 0 ? `−A$ ${body}` : `A$ ${body}`;
};

function isAsxTicker(sym: string): boolean {
  return sym.endsWith(".AX");
}

function quoteCcyOf(sym: string, q?: Quote): "USD" | "AUD" {
  const row = q ?? CATALOG[sym];
  if (row?.ccy === "AUD" || isAsxTicker(sym)) return "AUD";
  return "USD";
}

function quotePx(sym: string, n: number): string {
  return quoteCcyOf(sym) === "AUD" ? AUDS(n) : `USD ${pxDec(n)}`;
}

function divAmt(sym: string, n: number, d = 3): string {
  return quoteCcyOf(sym) === "AUD" ? `A$ ${formatDec(n, d)}` : `USD ${formatDec(n, d)}`;
}

const tone = (n: number | null | undefined): "success" | "danger" | undefined =>
  n == null ? undefined : n > 0 ? "success" : n < 0 ? "danger" : undefined;

function isFlat(chg: number): boolean {
  return chg === 0 || Math.abs(chg) < FLAT;
}

function qtyText(n: number): string {
  return formatDec(n, n % 1 === 0 ? 0 : 4);
}

function parseNum(s: string, ccy?: Ccy): number | null {
  let t = s.trim().replace(/\s/g, "").replace(/\$/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  } else if ((t.match(/\./g) || []).length > 1) {
    t = t.replace(/\./g, "");
  } else if (ccy === "ARS" && /^[1-9]\d{0,2}\.\d{3}$/.test(t)) {
    // En pesos, "12.350" es doce mil trescientos cincuenta. En USD/A$ "17.945" sigue siendo decimal.
    t = t.replace(".", "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseDate(s: string): string | null | "" {
  const t = s.trim();
  if (!t) return "";
  let y = 0, m = 0, d = 0;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]); }
  else if (dmy) { d = Number(dmy[1]); m = Number(dmy[2]); y = Number(dmy[3]); }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${m < 10 ? `0${m}` : m}-${d < 10 ? `0${d}` : d}`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

function getStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } | null {
  try {
    const g = globalThis as unknown as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } };
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

const posNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Campos opcionales de una compra o venta: dólar del día, comisión y CEDEAR en dólares. */
function optFields(row: { fx?: unknown; fee?: unknown; ced?: unknown }): { fx?: number; fee?: number; ced?: boolean } {
  return { ...(posNum(row.fx) ? { fx: row.fx } : {}), ...(posNum(row.fee) ? { fee: row.fee } : {}), ...(row.ced === true ? { ced: true } : {}) };
}

function sanitizeSales(raw: unknown): Sale[] {
  if (!Array.isArray(raw)) return [];
  const out: Sale[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Partial<Sale> & { currency?: unknown };
    if (typeof r.id !== "string" || seen.has(r.id) || typeof r.ticker !== "string" || !posNum(r.qty) || !posNum(r.price)) continue;
    seen.add(r.id);
    out.push({ id: r.id, ticker: r.ticker, qty: r.qty, price: r.price, date: typeof r.date === "string" ? r.date : "", ccy: readCcy(r), ...optFields(r) });
  }
  return out;
}

function sanitizeExtras(raw: unknown): Extra[] {
  if (!Array.isArray(raw)) return [];
  const out: Extra[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Partial<Extra>;
    if (typeof r.id !== "string" || seen.has(r.id) || typeof r.name !== "string" || !r.name.trim()) continue;
    if (typeof r.cost !== "number" || !Number.isFinite(r.cost) || r.cost < 0 || typeof r.value !== "number" || !Number.isFinite(r.value) || r.value < 0) continue;
    seen.add(r.id);
    out.push({ id: r.id, name: r.name.slice(0, 60), kind: typeof r.kind === "string" ? r.kind.slice(0, 30) : "Otro", ccy: r.ccy === "ARS" ? "ARS" : "USD", cost: r.cost, value: r.value, date: typeof r.date === "string" ? r.date : "", ...(posNum(r.fx) ? { fx: r.fx } : {}) });
  }
  return out;
}

function readCcy(row: { ccy?: unknown; currency?: unknown }): Ccy {
  const raw = String(row.ccy ?? row.currency ?? "").toUpperCase();
  if (raw === "ARS") return "ARS";
  if (raw === "AUD") return "AUD";
  return "USD";
}

// Lots/watch entries whose ticker is not in the current CATALOG are parked here instead of being
// deleted, and restored automatically when a later data update brings the ticker back.
const ORPHAN_KEY = "familia-inversiones-orphans-v1";

function parkOrphans(ls: { getItem(k: string): string | null; setItem(k: string, v: string): void }, parsed: { watch?: unknown; lots?: unknown }): { watch: unknown[]; lots: unknown[] } {
  let prev: { watch: unknown[]; lots: unknown[] } = { watch: [], lots: [] };
  try {
    const raw = ls.getItem(ORPHAN_KEY);
    if (raw) {
      const o = JSON.parse(raw) as { watch?: unknown; lots?: unknown };
      prev = { watch: Array.isArray(o.watch) ? o.watch : [], lots: Array.isArray(o.lots) ? o.lots : [] };
    }
  } catch { /* ignore */ }
  const allWatch = [...(Array.isArray(parsed.watch) ? parsed.watch : []), ...prev.watch];
  const lotIds = new Set<string>();
  const allLots = [...(Array.isArray(parsed.lots) ? parsed.lots : []), ...prev.lots].filter((l) => {
    const id = l && typeof l === "object" ? String((l as { id?: unknown }).id ?? "") : "";
    if (!id) return true;
    if (lotIds.has(id)) return false;
    lotIds.add(id);
    return true;
  });
  const known = (t: unknown) => typeof t === "string" && Boolean(CATALOG[t]);
  const seen = new Set<string>();
  const orphanLots = allLots.filter((l) => {
    const o = l as { id?: unknown; ticker?: unknown } | null;
    if (!o || typeof o !== "object" || known(o.ticker)) return false;
    const id = String(o.id ?? JSON.stringify(o));
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const orphanWatch = Array.from(new Set(allWatch.filter((w) => typeof w === "string" && !known(w))));
  try {
    ls.setItem(ORPHAN_KEY, JSON.stringify({ watch: orphanWatch, lots: orphanLots }));
  } catch { /* ignore */ }
  if (orphanLots.length) console.warn(`[inversiones] ${orphanLots.length} lote(s) con títulos fuera del catálogo actual quedaron guardados en ${ORPHAN_KEY}.`);
  return { watch: allWatch, lots: allLots };
}

function readPersisted(): { watch: string[]; lots: Lot[]; sales: Sale[]; extras: Extra[]; updatedAt?: string } | null {
  const ls = getStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(storageKey);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { watch?: unknown; lots?: unknown; sales?: unknown; extras?: unknown; updatedAt?: unknown };
    const merged = parkOrphans(ls, stored);
    const parsed = { ...stored, watch: Array.isArray(stored.watch) ? merged.watch : stored.watch, lots: merged.lots };
    const watch = Array.isArray(parsed.watch)
      ? (parsed.watch as unknown[]).filter((s): s is string => typeof s === "string" && Boolean(CATALOG[s]))
      : DEFAULT_WATCH;
    const lots = Array.isArray(parsed.lots)
      ? (parsed.lots as unknown[]).flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const row = item as Partial<Lot> & { currency?: unknown };
          if (typeof row.id !== "string" || typeof row.ticker !== "string" || !CATALOG[row.ticker]) return [];
          if (typeof row.qty !== "number" || !(row.qty > 0)) return [];
          if (typeof row.price !== "number" || !(row.price > 0)) return [];
          return [{
            id: row.id,
            ticker: row.ticker,
            qty: row.qty,
            price: row.price,
            date: typeof row.date === "string" ? row.date : "",
            ccy: readCcy(row),
            ...optFields(row),
          }];
        })
      : [];
    return { watch, lots, sales: sanitizeSales(stored.sales), extras: sanitizeExtras(stored.extras), updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined };
  } catch {
    return null;
  }
}

function writePersisted(watch: string[], lots: Lot[], updatedAt?: string, more?: { sales: Sale[]; extras: Extra[] }): boolean {
  const ls = getStorage();
  if (!ls) return false;
  try {
    ls.setItem(storageKey, JSON.stringify({ watch, lots, sales: more?.sales ?? [], extras: more?.extras ?? [], updatedAt }));
    return true;
  } catch {
    return false;
  }
}

function isMainTab(v: string): v is MainTab {
  return TABS.some((t) => t.value === v);
}

function readTab(): MainTab {
  const ls = getStorage();
  if (!ls) return "cartera";
  try {
    const raw = ls.getItem(TAB_KEY);
    return raw && isMainTab(raw) ? raw : "cartera";
  } catch {
    return "cartera";
  }
}

function writeTab(tab: MainTab): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.setItem(TAB_KEY, tab);
  } catch {
    /* ignore quota or private-mode failures */
  }
}

const LEGACY_COOKIE = "familia-inv-bak-v1";
/** El nombre de la aplicación: es una marca, no se traduce. */
const APP_NAME = "Tu Cartera Libre";
const BACKUP_PREFIX = "SI1.";
const REPO_URL = "https://github.com/TamrielWanderer/seguimiento-inversiones";

type BackupParse = { ok: true; watch: string[]; lots: Lot[]; sales: Sale[]; extras: Extra[] } | { ok: false; error: string };

function lotKey(lot: Lot): string {
  return `${lot.ticker}|${lot.qty}|${lot.price}|${lot.date}|${lot.ccy}${lot.ced ? "|D" : ""}`;
}

function sanitizeWatch(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const s of raw) {
    if (typeof s === "string" && CATALOG[s] && !out.includes(s)) out.push(s);
  }
  return out;
}

function sanitizeLots(raw: unknown): Lot[] {
  if (!Array.isArray(raw)) return [];
  const lots: Lot[] = [];
  const seenId = new Set<string>();
  const seenKey = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<Lot> & { currency?: unknown };
    if (typeof row.ticker !== "string" || !CATALOG[row.ticker]) continue;
    if (typeof row.qty !== "number" || !Number.isFinite(row.qty) || !(row.qty > 0)) continue;
    if (typeof row.price !== "number" || !Number.isFinite(row.price) || !(row.price > 0)) continue;
    const id = typeof row.id === "string" && row.id.trim() ? row.id : `imp-${lots.length}-${row.ticker}`;
    if (seenId.has(id)) continue;
    const lot: Lot = {
      id,
      ticker: row.ticker,
      qty: row.qty,
      price: row.price,
      date: typeof row.date === "string" ? row.date : "",
      ccy: readCcy(row),
      ...optFields(row),
    };
    const k = lotKey(lot);
    if (seenKey.has(k)) continue;
    seenId.add(id);
    seenKey.add(k);
    lots.push(lot);
  }
  return lots;
}

function ensureWatch(watch: string[], lots: Lot[]): string[] {
  const out: string[] = [];
  for (const s of watch) {
    if (CATALOG[s] && !out.includes(s)) out.push(s);
  }
  for (const lot of lots) {
    if (!out.includes(lot.ticker)) out.push(lot.ticker);
  }
  return out.length ? out : [...DEFAULT_WATCH];
}

function parseBackupObject(parsed: unknown): BackupParse {
  if (!parsed || typeof parsed !== "object") return { ok: false, error: tr("El archivo no tiene un formato reconocido.") };
  const o = parsed as Record<string, unknown>;
  const watchRaw = o.watch ?? o.w;
  const lotsRaw = o.lots ?? o.l;
  if (watchRaw === undefined && lotsRaw === undefined) {
    return { ok: false, error: tr("No encontré títulos ni compras en esa copia.") };
  }
  const lots = sanitizeLots(lotsRaw ?? []);
  const watch = ensureWatch(sanitizeWatch(watchRaw ?? []), lots);
  const sales = sanitizeSales(o.sales ?? o.s);
  const extras = sanitizeExtras(o.extras ?? o.e);
  if (watch.length === 0 && lots.length === 0 && extras.length === 0) {
    return { ok: false, error: tr("Esa copia no tiene títulos conocidos de este catálogo ni compras válidas.") };
  }
  return { ok: true, watch, lots, sales, extras };
}

function parseBackupJson(text: string): BackupParse {
  try {
    return parseBackupObject(JSON.parse(text));
  } catch {
    return { ok: false, error: tr("No pude leer ese JSON. Fijate que sea una copia de esta página.") };
  }
}

function utf8ToB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToUtf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function buildBackupJson(watch: string[], lots: Lot[], sales: Sale[] = [], extras: Extra[] = []): string {
  return JSON.stringify({ v: 1, app: "seguimiento-inversiones", exportedAt: new Date().toISOString(), watch, lots, sales, extras }, null, 2);
}

function buildBackupCode(watch: string[], lots: Lot[], sales: Sale[] = [], extras: Extra[] = []): string {
  return BACKUP_PREFIX + utf8ToB64(JSON.stringify({ v: 1, w: watch, l: lots, ...(sales.length ? { s: sales } : {}), ...(extras.length ? { e: extras } : {}) }));
}

function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const seen = new Set(a.map((x) => x.id));
  return [...a, ...b.filter((x) => !seen.has(x.id))];
}

function parseBackupCode(raw: string): BackupParse {
  const trimmed = raw.trim();
  const t = trimmed.replace(/\s+/g, "");
  if (!t) return { ok: false, error: tr("Pegá el código de una copia.") };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return parseBackupJson(trimmed);
  const b64 = t.startsWith(BACKUP_PREFIX) ? t.slice(BACKUP_PREFIX.length) : t;
  try {
    return parseBackupObject(JSON.parse(b64ToUtf8(b64)));
  } catch {
    return parseBackupJson(trimmed);
  }
}

function mergeBackup(current: { watch: string[]; lots: Lot[] }, incoming: { watch: string[]; lots: Lot[] }): { watch: string[]; lots: Lot[] } {
  const w: string[] = [];
  for (const s of [...current.watch, ...incoming.watch]) {
    if (CATALOG[s] && !w.includes(s)) w.push(s);
  }
  const lots: Lot[] = [];
  const seenId = new Set<string>();
  const seenKey = new Set<string>();
  for (const lot of [...current.lots, ...incoming.lots]) {
    if (seenId.has(lot.id)) continue;
    const k = lotKey(lot);
    if (seenKey.has(k)) continue;
    seenId.add(lot.id);
    seenKey.add(k);
    lots.push(lot);
  }
  return { watch: ensureWatch(w, lots), lots };
}

function todayIsoBA(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function formatStampBA(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${parts} ${tr("(hora de Buenos Aires)")}`;
}

/**
 * Versiones anteriores guardaban una segunda copia de la cartera en una cookie, que el navegador
 * mandaba al servidor en cada pedido. Ya no se usa: la borramos de los navegadores que la tengan.
 */
function dropLegacyCookie(): void {
  try {
    const doc = (globalThis as unknown as { document?: { cookie: string } }).document;
    if (doc && typeof doc.cookie === "string" && doc.cookie.includes(`${LEGACY_COOKIE}=`)) doc.cookie = `${LEGACY_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch { /* sin cookies */ }
}

/** Solo direcciones web: un enlace que venga mal en los datos no puede ejecutar código. */
const safeHref = (url: string): string | undefined => (/^https?:\/\//i.test(url) ? url : undefined);

function toBase64(data: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]);
  return btoa(bin);
}

/**
 * Baja un archivo una sola vez. Camino normal: un Blob. Solo si el navegador no lo permite
 * se intenta con una dirección data: (los dos a la vez bajaban el archivo dos veces).
 */
function downloadBytes(filename: string, mime: string, data: Uint8Array): boolean {
  const click = (href: string): boolean => {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  };
  try {
    const ab = new ArrayBuffer(data.byteLength);
    new Uint8Array(ab).set(data);
    const url = URL.createObjectURL(new Blob([ab], { type: mime }));
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ya no hace falta */ } }, 1000);
    return click(url);
  } catch {
    try {
      return click("data:" + mime + ";base64," + toBase64(data));
    } catch {
      return false;
    }
  }
}

const downloadJsonFile = (filename: string, text: string): boolean => downloadBytes(filename, "application/json", new TextEncoder().encode(text));

async function copyText(text: string): Promise<boolean> {
  try {
    const clip = (globalThis as unknown as { navigator?: { clipboard?: { writeText: (s: string) => Promise<void> } } }).navigator?.clipboard;
    if (clip?.writeText) {
      await clip.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const doc = (globalThis as unknown as { document?: Document }).document;
    if (!doc?.body) return false;
    const ta = doc.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    doc.body.appendChild(ta);
    ta.select();
    const ok = doc.execCommand("copy");
    doc.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function readClipboardText(): Promise<string | null> {
  try {
    const clip = (globalThis as unknown as { navigator?: { clipboard?: { readText?: () => Promise<string> } } }).navigator?.clipboard;
    if (clip?.readText) return await clip.readText();
  } catch {
    return null;
  }
  return null;
}

function WatchPicker({
  followed,
  held,
  onAdd,
  onRemove,
}: {
  followed: string[];
  held: ReadonlySet<string>;
  onAdd: (sym: string) => void;
  onRemove: (sym: string) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const hits = catalogHits(query);
  const suggestions = hits.filter((s) => !followed.includes(s)).slice(0, 16);
  const already = hits.filter((s) => followed.includes(s));
  const typed = query.trim();
  const highlight = suggestions.length === 0 ? 0 : Math.min(hi, suggestions.length - 1);

  const pick = (sym: string) => {
    onAdd(sym);
    setQuery("");
    setHi(0);
  };

  return (
    <>
      <div>
        <input
          aria-label={tr("Agregar un título a la lista")}
          className="inv-input"
          type="search"
          value={query}
          placeholder={tr("Agregar un título: escribí el ticker o el nombre (mcd, apple, oro)")}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(e) => {
            setQuery(e.target.value);
            setHi(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (suggestions.length) setHi((i) => (i + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              if (suggestions.length) setHi((i) => (i - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (suggestions[highlight]) pick(suggestions[highlight]);
            } else if (e.key === "Escape") {
              setQuery("");
              setHi(0);
            }
          }}
        />
      </div>
      {typed && suggestions.length > 0 ? (
        <div className="inv-suggest">
          {suggestions.map((sym, i) => {
            const qte = CATALOG[sym];
            const on = i === highlight;
            return (
              <button
                key={sym}
                type="button"
                onClick={() => pick(sym)}
                onMouseEnter={() => setHi(i)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  minHeight: 44,
                  boxSizing: "border-box",
                  border: "none",
                  borderBottom: i < suggestions.length - 1 ? `1px solid ${DASH.border}` : "none",
                  background: on ? DASH.card2 : DASH.card,
                  color: DASH.text,
                  cursor: "pointer",
                }}
              >
                <span>
                  <span style={{ ...theme.font.label, fontWeight: theme.weight.semibold }}>{sym}</span>
                  <span style={{ ...theme.font.caption, color: DASH.muted }}> {qte.name}</span>
                </span>
                <span style={{
                  ...theme.font.label,
                  color: qte.chg > 0 ? DASH.green : qte.chg < 0 ? DASH.red : DASH.muted,
                  whiteSpace: "nowrap",
                }}>{PCT(qte.chg)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {typed && suggestions.length === 0 ? (
        already.length > 0 ? (
          <p className="inv-hint">{already.length === 1 ? tr("{0} ya está en la lista.", already[0]) : tr("{0} ya están en la lista.", already.join(", "))}</p>
        ) : (
          <p className="inv-hint">{tr("Ese título no está en el catálogo.")}</p>
        )
      ) : null}
      {followed.length === 0 ? (
        <p className="inv-hint">{tr("La lista está vacía. Buscá un título arriba.")}</p>
      ) : (
        <div className="inv-chips">
          {followed.map((sym) => {
            const locked = held.has(sym);
            return (
              <span key={sym} className={locked ? "inv-chip inv-chip-locked" : "inv-chip"} title={locked ? tr("Tenés compras de este título: sale de la lista cuando las quites.") : CATALOG[sym].name}>
                <i style={{ background: isFlat(CATALOG[sym].chg) ? DASH.yellow : CATALOG[sym].chg > 0 ? DASH.green : DASH.red }} />
                {sym}
                {locked ? <small>{tr("en cartera")}</small> : (
                  <button type="button" aria-label={tr("Sacar {0}", sym)} className="inv-icon-btn" onClick={() => onRemove(sym)}>×</button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}

const DASH = {
  bg: "var(--surface)",
  card: "var(--surface)",
  card2: "var(--sunken)",
  border: "var(--line)",
  borderStrong: "var(--line)",
  text: "var(--ink)",
  muted: "var(--muted)",
  lime: "var(--accent)",
  green: "var(--up)",
  yellow: "var(--flat)",
  red: "var(--down)",
} as const;

function ToneDot({ chg, label }: { chg: number; label: string }) {
  const color = isFlat(chg) ? DASH.yellow : chg > 0 ? DASH.green : DASH.red;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: color, flex: "0 0 auto" }} />
      <span>{label}</span>
    </span>
  );
}

function NavIcon({ tab }: { tab: MainTab }) {
  const p: { width: number; height: number; viewBox: string; fill: string; stroke: string; strokeWidth: number; strokeLinecap: "round"; strokeLinejoin: "round" } = {
    width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round",
  };
  if (tab === "calor") return <svg {...p} aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>;
  if (tab === "cartera") return <svg {...p} aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M8 7V6a4 4 0 0 1 8 0v1" /></svg>;
  if (tab === "divs") return <svg {...p} aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v10" /><path d="M9.5 9.5c.6-1 2.8-1.2 3.6 0s-.2 2.2-1.6 2.5c1.6.2 2.4 1.4 1.6 2.6s-3 1-3.6 0" /></svg>;
  if (tab === "mercado") return <svg {...p} aria-hidden="true"><path d="M4 19V9l5 4 5-8 6 7" /><path d="M4 19h16" /></svg>;
  if (tab === "plazo") return <svg {...p} aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8.5 7.5h7" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" /></svg>;
  if (tab === "analisis") return <svg {...p} aria-hidden="true"><path d="M5 4h10l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><path d="M15 4v4h4" /><path d="M8 12h8M8 16h6" /></svg>;
  if (tab === "datos") return <svg {...p} aria-hidden="true"><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>;
  return <svg {...p} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none" /></svg>;
}

function DashShell({ tab, onChange, stamp, stampTone = "ok", lang, onLang, children }: { tab: MainTab; onChange: (tab: MainTab) => void; stamp: string; stampTone?: "ok" | "warn" | "old"; lang: Lang; onLang: (l: Lang) => void; children?: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(readMode);
  const toggleMode = () => { const next: Mode = mode === "dark" ? "light" : "dark"; setMode(next, true); setModeState(next); };
  return (
    <div className="inv-dash">
      <aside className="inv-side">
        <div className="inv-brand"><span className="inv-logo">C</span><span className="inv-brand-text">{APP_NAME}</span></div>
        <nav aria-label={tr("Secciones")}>
          {TABS.map((item) => (
            <button key={item.value} type="button" aria-current={item.value === tab ? "page" : undefined} className={item.value === tab ? "inv-nav-btn inv-nav-on" : "inv-nav-btn"} onClick={() => onChange(item.value)}>
              <NavIcon tab={item.value} />
              <span className="inv-nav-long">{tr(item.label)}</span>
              <span className="inv-nav-short">{tr(item.short)}</span>
            </button>
          ))}
        </nav>
        <div className="inv-tools">
          <button type="button" className="inv-mode" onClick={toggleMode} aria-label={mode === "dark" ? tr("Cambiar a modo claro") : tr("Cambiar a modo oscuro")} title={mode === "dark" ? tr("Cambiar a modo claro") : tr("Cambiar a modo oscuro")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {mode === "dark"
                ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
                : <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />}
            </svg>
            <span>{mode === "dark" ? tr("Modo claro") : tr("Modo oscuro")}</span>
          </button>
          <label className="inv-lang">
            <span>{tr("Idioma")}</span>
            <select value={lang} onChange={(e) => onLang(e.target.value as Lang)}>
              {LANGS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        </div>
      </aside>
      <div className="inv-main">
        <header className="inv-top">
          <h1>{tr(TABS.find((t) => t.value === tab)?.label ?? APP_NAME)}</h1>
          <div className={`inv-stamp inv-stamp-${stampTone}`}>{stamp}</div>
        </header>
        <main className="inv-body">{children}</main>
      </div>
    </div>
  );
}

function CostValueBars({ rows, total }: { rows: { label: string; cost: number; value: number }[]; total: { cost: number; value: number } }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.cost, r.value)));
  const line = (label: string, cost: number, value: number, strong = false) => {
    const up = value >= cost;
    return (
      <div className={strong ? "inv-cv-row inv-cv-total" : "inv-cv-row"} key={label}>
        <div className="inv-cv-label">{label}</div>
        <div className="inv-cv-bars">
          <div className="inv-cv-bar inv-cv-cost" style={{ width: `${(cost / (strong ? Math.max(cost, value, 1) : max)) * 100}%` }} />
          <div className="inv-cv-bar" style={{ width: `${(value / (strong ? Math.max(cost, value, 1) : max)) * 100}%`, background: up ? DASH.green : DASH.red }} />
        </div>
        <div className="inv-cv-nums">
          <span>{MONEY(value)}</span>
          <span className="inv-cv-sub" style={{ color: up ? DASH.green : DASH.red }}>{PCT(cost ? (value / cost - 1) * 100 : 0)}{tr(" · costo ")}{MONEY(cost)}</span>
        </div>
      </div>
    );
  };
  return (
    <div className="inv-cv">
      {line(tr("Total"), total.cost, total.value, true)}
      {rows.map((r) => line(r.label, r.cost, r.value))}
    </div>
  );
}

/** El precio fuera de hora de un título, si hay uno reciente (no más de 4 días antes de los datos). */
function extOf(sym: string): NonNullable<Quote["ext"]> | null {
  const e = CATALOG[sym]?.ext;
  if (!e) return null;
  return Date.parse(D.generatedAt) - Date.parse(e.at) < 4 * 86400000 ? e : null;
}
const extLabel = (s: "pre" | "post") => (s === "pre" ? tr("Antes de abrir") : tr("Después del cierre"));

function quoteRow(sym: string, held: boolean, withExt = false): TableCell[] {
  const q = CATALOG[sym];
  const session = quoteCcyOf(sym) === "AUD" ? D.sessions.asx : D.sessions.ny;
  const stale = session && q.asOf && q.asOf < session;
  const px = stale ? { text: `${quotePx(sym, q.price)} · al ${fmtDM(q.asOf)}`, tone: "warning" as const } : quotePx(sym, q.price);
  return [<ToneDot chg={q.chg} label={sym} />, held ? tr("en cartera") : "", px, { text: PCT(q.chg), tone: tone(q.chg) }, { text: PCT(q.m1), tone: tone(q.m1) }, { text: PCT(q.m3), tone: tone(q.m3) }, ...(withExt ? [extCell(sym)] : [])];
}

function extCell(sym: string): TableCell {
  const e = extOf(sym);
  return e ? { text: `${PCT(e.chg)} · ${quotePx(sym, e.price)}`, tone: tone(e.chg) } : "";
}

function changeOf(q: Quote, w: HeatWindow): number {
  return (w === "d" ? q.chg : w === "m1" ? q.m1 : q.m3) ?? 0;
}

function heatStyle(_theme: Theme, chg: number, cap: number): CSSProperties {
  if (isFlat(chg)) return { background: `color-mix(in srgb, ${DASH.yellow} 22%, var(--surface))`, color: DASH.text };
  const intensity = Math.min(1, Math.abs(chg) / (cap || 1));
  const alpha = 18 + Math.round(intensity * 44);
  return { background: `color-mix(in srgb, ${chg > 0 ? DASH.green : DASH.red} ${alpha}%, var(--surface))`, color: DASH.text };
}

function HeatTiles({ items, cap }: { items: { id: string; label: string; sub: string; chg: number; weight: number }[]; cap: number }) {
  const theme = useTheme();
  const total = items.reduce((s, i) => s + i.weight, 0) || 1;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((it) => {
        const share = it.weight / total;
        const style: CSSProperties = {
          ...heatStyle(theme, it.chg, cap),
          flex: `${Math.max(share * 100, 8)} 1 140px`,
          minHeight: 76 + Math.min(70, share * 160),
          borderRadius: 10,
          padding: 12,
          boxSizing: "border-box",
        };
        return (
          <div key={it.id} className="inv-heat-tile" style={style}>
            <div style={{ ...theme.font.label, fontWeight: theme.weight.semibold }}>{it.label}</div>
            <div style={{ ...theme.font.metric, fontSize: 20, lineHeight: "26px" }}>{PCT(it.chg)}</div>
            <div style={{ ...theme.font.caption, color: DASH.muted }}>{it.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

function nativeMoney(ccy: Ccy, n: number): string {
  if (ccy === "ARS") return PESOS(n);
  if (ccy === "AUD") return AUDS(n);
  return MONEY(n);
}


type Full = { watch: string[]; lots: Lot[]; sales: Sale[]; extras: Extra[] };

/** Calculadora de plazo fijo (TNA, interés simple) y de certificado de depósito (APY, compuesto). */
function DepositCalculator({ mep, todayIso }: { mep: number; todayIso: string }) {
  const [kind, setKind] = useState<"pf" | "cd">("pf");
  const [ccy, setCcy] = useState<"ARS" | "USD">("ARS");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [term, setTerm] = useState("30");
  const [renew, setRenew] = useState("0");
  // Supuestos para medir el resultado real: arrancan con el último dato conocido y se pueden cambiar.
  const macro = D.macro ?? { inflacion: [], plazoFijo: [] };
  const lastInf = macro.inflacion.length ? macro.inflacion[macro.inflacion.length - 1] : null;
  const [inflM, setInflM] = useState(() => (lastInf ? formatDec(lastInf[1], 1) : ""));
  const [inflUs, setInflUs] = useState("");
  const [mepEnd, setMepEnd] = useState(() => (mep > 0 ? formatDec(mep, 0) : ""));
  const pick = (k: "pf" | "cd") => { setKind(k); setCcy(k === "pf" ? "ARS" : "USD"); setTerm(k === "pf" ? "30" : "12"); };

  const a = parseNum(amount, ccy);
  const r = parseNum(rate);
  const t = parseNum(term);
  const n = parseNum(renew) ?? 0;
  const res = a != null && r != null && t != null
    ? depositResult(kind === "pf" ? { kind, amount: a, rate: r, days: Math.round(t), renewals: n } : { kind, amount: a, rate: r, months: t })
    : null;
  const money = (v: number) => (ccy === "ARS" ? PESOS(v, Math.abs(v) >= 100000 ? 0 : 2) : MONEY(v));
  const other = (v: number) => (mep > 0 ? (ccy === "ARS" ? MONEY(v / mep) : PESOS(v * mep, 0)) : "");
  const filled = amount.trim() !== "" && rate.trim() !== "" && term.trim() !== "";

  const monthName = (ym: string) => `${monthShort(Number(ym.slice(5, 7)) - 1)} ${ym.slice(0, 4)}`;
  const points = (v: number) => ({ text: tr("{0} puntos", `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatDec(Math.abs(v), 2)}`), tone: tone(v) });
  const pctCell = (v: number) => ({ text: PCT(v), tone: tone(v) });
  const otherMoney = (v: number) => (ccy === "ARS" ? MONEY(v) : PESOS(v, 0));
  const rows: (string | { text: string; tone?: "success" | "danger" })[][] = [];
  if (res && a != null && r != null) {
    const infIn = parseNum(ccy === "ARS" ? inflM : inflUs);
    if (infIn != null && infIn > -100) {
      const over = inflationOver(infIn, res.days, ccy === "ARS" ? 30 : 365);
      rows.push([ccy === "ARS" ? tr("Contra la inflación") : tr("Contra la inflación de EE.UU."), pctCell(realReturn(res.periodPct, over)),
        tr("Con esa inflación los precios suben {0} en {1} días. Lo que cobrás compra lo mismo que {2} de hoy.", YLD(over), res.days, money(res.final / (1 + over / 100)))]);
    }
    rows.push([tr("Inflación de equilibrio"), ccy === "ARS" ? tr("{0} mensual", YLD(res.tem)) : tr("{0} anual", YLD(res.tea)),
      tr("Si la inflación queda por debajo, ganás poder de compra; si queda por encima, lo perdés.")]);
    const end = parseNum(mepEnd, "ARS");
    const conv = end != null ? depositInOtherCurrency(a, res.final, ccy, mep, end) : null;
    if (conv && end != null) {
      rows.push([ccy === "ARS" ? tr("En dólares") : tr("En pesos"), pctCell(conv.pct),
        tr("Hoy son {0}. Al vencimiento, con el MEP a {1}, serían {2}.", otherMoney(conv.start), PESOS(end, 0), otherMoney(conv.end))]);
    }
    if (ccy === "ARS" && mep > 0) {
      rows.push([tr("Dólar de equilibrio"), PESOS(mep * (1 + res.periodPct / 100), 0),
        tr("Si el MEP termina por debajo, ganaste en dólares. Si termina por encima, convenía comprar dólares.")]);
      const past = mepOn(addDaysIso(todayIso, -res.days));
      const again = past ? depositInOtherCurrency(a, res.final, "ARS", past, mep) : null;
      if (past && again) {
        rows.push([tr("Si el dólar repitiera los últimos {0} días", res.days), pctCell(again.pct),
          tr("En ese tiempo el MEP pasó de {0} a {1} ({2}).", PESOS(past, 0), PESOS(mep, 0), PCT((mep / past - 1) * 100, 1))]);
      }
      const inf12 = compoundInflation(macro.inflacion, 12);
      if (inf12 != null && lastInf) {
        rows.push([tr("Contra la inflación de los últimos 12 meses"), pctCell(realReturn(res.tea, inf12)),
          tr("Los precios subieron {0} en 12 meses (hasta {1}). Tu tasa efectiva anual es {2}.", YLD(inf12, 1), monthName(lastInf[0]), YLD(res.tea))]);
      }
    }
    if (kind === "pf" && ccy === "ARS" && macro.plazoFijo.length) {
      const list = macro.plazoFijo;
      const med = list[Math.floor(list.length / 2)].tna;
      const tied = list.filter((x) => x.tna === list[0].tna).length;
      rows.push([tr("Contra otros bancos"), points(r - list[0].tna),
        tr("La mejor tasa publicada es {0} TNA ({1}). La del medio, entre {2} bancos, es {3}.", YLD(list[0].tna), tied > 1 ? tr("{0} y {1} más", list[0].b, tied - 1) : list[0].b, list.length, YLD(med))]);
    }
    const tnx = ccy === "USD" ? D.indices.find((i) => i.id === "tnx")?.level : null;
    if (tnx) {
      rows.push([tr("Contra un bono del Tesoro de EE.UU. a 10 años"), points(res.tea - tnx),
        tr("El bono a 10 años rinde {0} anual. Tu tasa efectiva anual es {1}.", YLD(tnx), YLD(res.tea))]);
    }
  }

  return (
    <Section heading={tr("Calculadora de plazo fijo y CD")} caption={tr("Cuánto cobrás al vencimiento, según el monto, la tasa y el plazo.")}>
      <div className="inv-row">
        <Segmented<"pf" | "cd"> options={[{ value: "pf", label: tr("Plazo fijo") }, { value: "cd", label: tr("Certificado de depósito (CD)") }]} value={kind} onChange={pick} />
        <Segmented<"ARS" | "USD"> options={[{ value: "ARS", label: tr("Pesos") }, { value: "USD", label: tr("Dólares") }]} value={ccy} onChange={setCcy} />
      </div>
      <div className="inv-row" style={{ alignItems: "flex-end" }}>
        <Input label={tr("Monto ({0})", ccy === "ARS" ? "$" : "USD")} value={amount} onChange={setAmount} placeholder={ccy === "ARS" ? "1.000.000" : "10.000"} />
        <Input label={kind === "pf" ? tr("Tasa nominal anual (TNA, %)") : tr("Rendimiento anual (APY, %)")} value={rate} onChange={setRate} placeholder={kind === "pf" ? "32,5" : "4,5"} />
        <Input label={kind === "pf" ? tr("Plazo (días)") : tr("Plazo (meses)")} value={term} onChange={setTerm} placeholder={kind === "pf" ? "30" : "12"} />
        {kind === "pf" ? <Input label={tr("Renovaciones")} value={renew} onChange={setRenew} placeholder="0" /> : null}
      </div>
      {res ? (
        <>
          <Metrics metrics={[
            { value: money(res.final), label: tr("Cobrás al vencimiento"), detail: tr("El {0}", fmtIso(addDaysIso(todayIso, res.days))) },
            { value: money(res.interest), label: tr("Intereses"), detail: tr("{0} en {1} días", YLD(res.periodPct), res.days), tone: "success" },
            { value: YLD(res.tea), label: tr("Tasa efectiva anual"), detail: tr("{0} cada 30 días", YLD(res.tem)) },
          ]} />
          <p className="inv-hint">
            {kind === "pf"
              ? (n > 0 ? tr("Plazo fijo con interés simple, renovado {0} con capital e intereses a la misma tasa.", n === 1 ? tr("1 vez") : tr("{0} veces", n)) : tr("Plazo fijo con interés simple: monto × TNA × días ÷ 365."))
              : tr("Certificado de depósito con interés compuesto: monto × (1 + APY) elevado a los años.")}{" "}
            {other(res.final) ? tr("Al dólar MEP de hoy, lo que cobrás equivale a {0}; ese dólar va a ser otro al vencimiento.", other(res.final)) : ""}{" "}
            {tr("Antes de impuestos. No es una recomendación de inversión.")}
          </p>
          <Section heading={tr("Cuánto rinde de verdad")} caption={tr("El resultado contra la inflación, el dólar y otras opciones. Los supuestos son tuyos: cambialos para ver distintos escenarios.")}>
            <div className="inv-row" style={{ alignItems: "flex-end" }}>
              {ccy === "ARS"
                ? <Input label={tr("Inflación mensual esperada (%)")} value={inflM} onChange={setInflM} placeholder="2,5" />
                : <Input label={tr("Inflación anual esperada en EE.UU. (%)")} value={inflUs} onChange={setInflUs} placeholder="3" />}
              <Input label={tr("Dólar MEP al vencimiento ($)")} value={mepEnd} onChange={setMepEnd} placeholder={mep > 0 ? formatDec(mep, 0) : "1.500"} />
            </div>
            <Table columns={[tr("Comparación"), tr("Resultado"), tr("Qué significa")]} rows={rows} />
            <p className="inv-hint">
              {lastInf ? tr("Última inflación publicada: {0} en {1} (INDEC).", YLD(lastInf[1], 1), monthName(lastInf[0])) : ""}{" "}
              {mep > 0 ? tr("Dólar MEP de hoy: {0}.", PESOS(mep, 0)) : ""}{" "}
              {tr("Nadie conoce la inflación ni el dólar que vienen: son escenarios, no pronósticos.")}
            </p>
          </Section>
        </>
      ) : (
        <p className="inv-hint">{filled ? tr("Revisá los números: el monto y el plazo tienen que ser mayores a cero.") : tr("Completá el monto, la tasa y el plazo.")}</p>
      )}
    </Section>
  );
}

/** Dirección de la página publicada, para que el QR la abra en el otro dispositivo. */
function syncBaseUrl(): string | null {
  try {
    if (/^https?:$/.test(location.protocol)) return location.origin + location.pathname;
    if (/^https?:\/\//.test(DATA_URL)) return DATA_URL.replace(/[^/]*$/, "");
  } catch { /* sin ventana */ }
  return null;
}
// Más texto que esto da un QR demasiado denso para leerlo desde una pantalla.
const QR_MAX_CHARS = 2200;

function QrImage({ text }: { text: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "L");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4},${r + 4}h1v1h-1z`;
    return { size: n + 8, d };
  }, [text]);
  return (
    <svg className="inv-qr" viewBox={`0 0 ${svg.size} ${svg.size}`} role="img" aria-label={tr("Código QR con tu cartera cifrada")} shapeRendering="crispEdges">
      <rect width={svg.size} height={svg.size} fill="#fff" />
      <path d={svg.d} fill="#000" />
    </svg>
  );
}

function QrSyncPanel({ watch, lots, sales, extras, incoming, onIncoming, onOpen }: {
  watch: string[]; lots: Lot[]; sales: Sale[]; extras: Extra[];
  incoming: string | null; onIncoming: (s: string | null) => void; onOpen: (data: Full) => void;
}) {
  const [out, setOut] = useState<{ url: string | null; packed: string; key: string } | null>(null);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const can = syncAvailable();

  const make = async () => {
    setErr(""); setMsg(""); setBusy(true);
    try {
      const key = newSyncKey();
      const packed = await packSync({ v: 1, w: watch, l: lots, ...(sales.length ? { s: sales } : {}), ...(extras.length ? { e: extras } : {}) }, key);
      const base = syncBaseUrl();
      const url = base ? `${base}#s=${packed}` : null;
      setOut({ url: url && url.length <= QR_MAX_CHARS ? url : null, packed, key });
      if (!base) setMsg(tr("Esta copia no está publicada en la web, así que no hay QR: copiá el código cifrado y pegalo en el otro dispositivo, en «Pasar por mensaje»."));
      else if (url && url.length > QR_MAX_CHARS) setMsg(tr("Tu cartera es demasiado grande para un QR que se pueda leer. Copiá el código cifrado y pegalo en el otro dispositivo, en «Pasar por mensaje»."));
    } catch {
      setErr(tr("Este navegador no pudo cifrar la cartera. Usá «Descargar respaldo»."));
    }
    setBusy(false);
  };

  const open = async () => {
    if (!incoming) return;
    setErr(""); setBusy(true);
    try {
      const parsed = parseBackupObject(await unpackSync(incoming, typed));
      if (!parsed.ok) setErr(parsed.error);
      else { onOpen({ watch: parsed.watch, lots: parsed.lots, sales: parsed.sales, extras: parsed.extras }); onIncoming(null); setTyped(""); }
    } catch {
      setErr(tr("Esa clave no abre este QR. Revisala en el otro dispositivo y probá de nuevo."));
    }
    setBusy(false);
  };

  return (
    <>
      {incoming ? (
        <Callout tone="info" lead={tr("Llegó una cartera cifrada.")}>
          {tr("Escribí la clave de 8 caracteres que muestra el otro dispositivo junto al QR.")}
          <div className="inv-row" style={{ marginTop: 10, alignItems: "flex-end" }}>
            <Input label={tr("Clave")} value={typed} onChange={setTyped} placeholder="ABCD-2345" />
            <Button label={tr("Abrir")} variant="primary" disabled={busy || !can} onClick={() => { void open(); }} />
            <Button label={tr("Cancelar")} onClick={() => { onIncoming(null); setErr(""); }} />
          </div>
          {!can ? <p className="inv-hint">{tr("Este navegador no puede descifrar. Abrí la página en Chrome, Safari, Edge o Firefox actualizados.")}</p> : null}
        </Callout>
      ) : null}
      <Section heading={tr("Pasar con un QR cifrado")} collapsible defaultOpen={false}>
        <p className="inv-hint">{tr("Mostrá el QR en este dispositivo y escanealo con la cámara del otro: se abre esta página y te pide la clave. El QR va cifrado; sin la clave no se puede leer. No pasa nada por ningún servidor.")}</p>
        <div className="inv-row">
          <Button label={out ? tr("Generar otro QR") : tr("Mostrar QR")} variant="primary" disabled={busy || !can} onClick={() => { void make(); }} />
          {out ? <Button label={tr("Copiar código cifrado")} onClick={() => { void copyText(out.url ?? out.packed).then((ok) => setMsg(ok ? tr("Código cifrado copiado. En el otro dispositivo también vas a necesitar la clave.") : tr("No pude copiar al portapapeles."))); }} /> : null}
          {out ? <Button label={tr("Ocultar")} onClick={() => { setOut(null); setMsg(""); }} /> : null}
        </div>
        {!can ? <p className="inv-hint">{tr("Este navegador no puede cifrar. Usá «Descargar respaldo».")}</p> : null}
        {out ? (
          <div className="inv-qr-box">
            {out.url ? <QrImage text={out.url} /> : null}
            <div className="inv-qr-key">
              <span>{tr("Clave")}</span>
              <strong>{out.key}</strong>
              <small>{tr("Escribila en el otro dispositivo. No la mandes junto con una foto del QR. Cada QR tiene una clave nueva.")}</small>
            </div>
          </div>
        ) : null}
        {msg ? <p className="inv-hint">{msg}</p> : null}
      </Section>
      {err ? <Callout tone="danger" lead={err} /> : null}
    </>
  );
}

function BackupPanel({
  watch,
  lots,
  sales,
  extras,
  lastSavedAt,
  mode,
  incoming,
  onIncoming,
  onReplace,
  onMerge,
}: {
  watch: string[];
  lots: Lot[];
  sales: Sale[];
  extras: Extra[];
  lastSavedAt: string | null;
  mode: PersistMode;
  incoming: string | null;
  onIncoming: (s: string | null) => void;
  onReplace: (data: Full) => void;
  onMerge: (data: Full) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<Full | null>(null);

  const status = mode === "memory"
    ? tr("Este navegador no deja guardar: descargá un respaldo para no perder lo que cargues.")
    : mode === "loading"
      ? ""
      : lastSavedAt ? tr("Tu cartera se guarda sola en este navegador. Último cambio: {0}.", formatStampBA(lastSavedAt)) : tr("Tu cartera se guarda sola en este navegador.");

  const offer = (data: Full, okMsg = "") => {
    setPending(data);
    setErr("");
    setMsg(okMsg);
  };

  const download = () => {
    setErr("");
    const json = buildBackupJson(watch, lots, sales, extras);
    const name = `tu-cartera-libre-${todayIsoBA()}.json`;
    const ok = downloadJsonFile(name, json);
    setPending(null);
    if (ok) {
      setMsg(tr("Se descargó {0}.", name));
      return;
    }
    const packed = buildBackupCode(watch, lots, sales, extras);
    setCode(packed);
    setMsg(tr("Este navegador no dejó descargar el archivo. Abrí «Pasar por mensaje» y copiá el código."));
  };

  const onFile = (input: HTMLInputElement) => {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const parsed = parseBackupJson(text);
      if (!parsed.ok) {
        setPending(null);
        setErr(parsed.error);
        setMsg("");
        return;
      }
      offer({ watch: parsed.watch, lots: parsed.lots, sales: parsed.sales, extras: parsed.extras });
    };
    reader.onerror = () => {
      setPending(null);
      setErr(tr("No pude leer ese archivo."));
      setMsg("");
    };
    reader.readAsText(file);
  };

  const copyCode = async () => {
    const packed = buildBackupCode(watch, lots, sales, extras);
    setCode(packed);
    setPending(null);
    const ok = await copyText(packed);
    setErr("");
    if (ok) {
      setMsg(tr("Código copiado. Pegalo en el otro dispositivo, en este mismo lugar."));
      return;
    }
    setMsg(tr("No pude copiar al portapapeles. Copiá a mano el código del cuadro."));
  };

  const pasteCode = async () => {
    let text = code.trim();
    if (!text) {
      const clip = await readClipboardText();
      if (clip) {
        text = clip;
        setCode(clip);
      }
    }
    const enc = findSync(text);
    if (enc) { // es un código cifrado (el del QR): falta la clave
      onIncoming(enc);
      setCode("");
      setErr("");
      setMsg("");
      return;
    }
    const parsed = parseBackupCode(text);
    if (!parsed.ok) {
      setPending(null);
      setErr(parsed.error);
      setMsg("");
      return;
    }
    offer({ watch: parsed.watch, lots: parsed.lots, sales: parsed.sales, extras: parsed.extras });
  };

  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

  return (
    <Section heading={tr("Respaldo")} caption={tr("Para llevar tu cartera a otro celular o computadora, o recuperarla si se borra este navegador.")}>
      <input ref={fileRef} type="file" accept="application/json,.json,text/plain" style={{ display: "none" }} onChange={(e) => onFile(e.currentTarget)} />
      <div className="inv-row">
        <Button label={tr("Descargar respaldo")} variant="primary" onClick={download} />
        <Button label={tr("Cargar un respaldo")} onClick={() => fileRef.current?.click()} />
      </div>
      {status ? <p className="inv-hint">{status}</p> : null}
      <Section heading={tr("Pasar por mensaje, sin archivo")} collapsible defaultOpen={false}>
        <p className="inv-hint">{tr("En este dispositivo, copiá el código y mandátelo. En el otro, pegalo acá y tocá «Recuperar».")}</p>
        <textarea className="inv-area" aria-label={tr("Código de respaldo")} value={code} placeholder={tr("Pegá acá un código de respaldo")} autoComplete="off" spellCheck={false} onChange={(e) => setCode(e.target.value)} />
        <div className="inv-row">
          <Button label={tr("Copiar mi código")} onClick={() => { void copyCode(); }} />
          <Button label={tr("Recuperar")} onClick={() => { void pasteCode(); }} />
        </div>
      </Section>
      <QrSyncPanel watch={watch} lots={lots} sales={sales} extras={extras} incoming={incoming} onIncoming={onIncoming} onOpen={(data) => offer(data)} />
      {pending ? (
        <Callout tone="warning" lead={tr("El respaldo trae {0} y {1}.", n(pending.watch.length, tr("título"), tr("títulos")), n(pending.lots.length, tr("compra"), tr("compras")))}>
          {tr("Reemplazar deja solo lo del respaldo. Combinar suma lo que falte, sin duplicar.")}
          <div className="inv-row" style={{ marginTop: 10 }}>
            <Button label={tr("Reemplazar")} variant="primary" onClick={() => { onReplace(pending); setPending(null); setErr(""); setMsg(tr("Se reemplazó la cartera de este navegador con el respaldo.")); }} />
            <Button label={tr("Combinar")} onClick={() => { onMerge(pending); setPending(null); setErr(""); setMsg(tr("Se combinó el respaldo con lo que ya tenías.")); }} />
            <Button label={tr("Cancelar")} onClick={() => { setPending(null); setMsg(""); }} />
          </div>
        </Callout>
      ) : null}
      {err ? <Callout tone="danger">{err}</Callout> : null}
      {msg && !err ? <Callout tone="info">{msg}</Callout> : null}
    </Section>
  );
}

/* Minimal offline CSV / XLSX / XLS importer. */

const TICKER_HEADERS = ["accion", "acciones", "ticker", "titulo", "title", "symbol", "stock", "papel", "instrumento", "activo"];
const MARKET_HEADERS = ["mercado/moneda", "market/currency", "market currency", "mercado moneda", "mercado", "moneda", "currency", "market", "ccy", "plaza"];
const QTY_HEADERS = ["cantidad", "qty", "quantity", "shares", "cant", "cantidad de acciones", "unidades"];
const PRICE_HEADERS = ["precio de compra", "precio compra", "precio", "price", "cost", "purchase price", "px", "costo", "costo unitario", "precio unitario"];
const DATE_HEADERS = ["fecha de compra", "fecha compra", "fecha", "date", "purchase date", "dia"];

function normHeader(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function headerKind(norm: string): "ticker" | "market" | "qty" | "price" | "date" | null {
  if (!norm) return null;
  if (TICKER_HEADERS.includes(norm)) return "ticker";
  if (MARKET_HEADERS.includes(norm)) return "market";
  if (QTY_HEADERS.includes(norm)) return "qty";
  if (PRICE_HEADERS.includes(norm)) return "price";
  if (DATE_HEADERS.includes(norm)) return "date";
  return null;
}

function parseImportNum(raw: unknown, ccy?: Ccy): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let t = String(raw).trim().replace(/\s/g, "").replace(/[$€]/g, "");
  t = t.replace(/^A\$/i, "").replace(/^US\$/i, "").replace(/^U\$S/i, "");
  if (!t) return null;
  t = t.replace(/'/g, "");
  if (t.includes(",") && t.includes(".")) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  } else if ((t.match(/\./g) || []).length > 1) {
    t = t.replace(/\./g, "");
  } else if (ccy === "ARS" && /^[1-9]\d{0,2}\.\d{3}$/.test(t)) {
    t = t.replace(".", "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function excelSerialToISO(n: number): string | null {
  if (!Number.isFinite(n)) return null;
  const day = Math.floor(n);
  if (day < 1 || day > 80000) return null;
  const ms = Date.UTC(1899, 11, 30) + day * 86400000;
  const dt = new Date(ms);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

function parseImportDate(raw: unknown): string | null {
  if (raw == null || raw === "") return "";
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.getUTCFullYear() + "-" + String(raw.getUTCMonth() + 1).padStart(2, "0") + "-" + String(raw.getUTCDate()).padStart(2, "0");
  }
  if (typeof raw === "number") return excelSerialToISO(raw) ?? null;
  const s = String(raw).trim();
  if (!s) return "";
  if (/^[\d.,]+$/.test(s)) {
    const asNum = Number(s.replace(",", "."));
    if (Number.isFinite(asNum) && asNum >= 20000 && asNum <= 80000) {
      const iso = excelSerialToISO(asNum);
      if (iso) return iso;
    }
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
  const dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  let y = 0, m = 0, d = 0;
  if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]); }
  else if (dmy) { d = Number(dmy[1]); m = Number(dmy[2]); y = Number(dmy[3]); }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

function parseMarket(raw: unknown): { ok: true; ccy: Ccy } | { ok: false; error: string } {
  const s = normHeader(raw);
  const compact = s.replace(/\s+/g, "");
  if (!s) return { ok: false, error: tr("Falta el mercado o la moneda.") };
  if (/(austral|asx|\baud\b|australiano)/.test(s) || compact === "au" || compact === "a") return { ok: true, ccy: "AUD" };
  if (/(byma|merval|peso|ars|bcba|argentina|\barg\b)/.test(s) || compact === "ars") return { ok: true, ccy: "ARS" };
  if (/(nyse|nasdaq|eeuu|ee uu|estados unidos|estadosunidos|united states|unitedstates|\busd\b|\bus\b|\bny\b|\busa\b|dolar|dollar)/.test(s) || /(nyse|nasdaq|eeuu|estadosunidos|unitedstates|usd|usa)/.test(compact) || compact === "us") return { ok: true, ccy: "USD" };
  return { ok: false, error: tr("No reconocí el mercado o la moneda \"") + String(raw).trim() + tr("\". Usá USD, ARS/BYMA o AUD/ASX.") };
}

function mapTicker(raw: unknown, ccy: Ccy, catalog: Record<string, unknown>, ba: Record<string, unknown>): { ok: true; ticker: string } | { ok: false; error: string } {
  let t = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return { ok: false, error: tr("Falta el ticker.") };
  t = t.replace(/^\./, "");
  if (t.endsWith(".BA")) t = t.slice(0, -3);
  if (ccy === "AUD") {
    if (!t.endsWith(".AX")) t = t + ".AX";
    if (!catalog[t]) return { ok: false, error: t + tr(" no está en el catálogo de ASX.") };
    return { ok: true, ticker: t };
  }
  if (t.endsWith(".AX")) {
    if (ccy === "ARS") return { ok: false, error: tr("Los títulos de ASX no se pueden cargar en pesos (no hay .BA).") };
    if (catalog[t]) return { ok: true, ticker: t };
    t = t.slice(0, -3);
  }
  if (ccy === "ARS") {
    if (!catalog[t]) return { ok: false, error: t + tr(" no está en el catálogo.") };
    if (!ba[t]) return { ok: false, error: tr("No hay cotización BYMA (.BA) para ") + t + tr(" en esta página. Cargalo en USD o sacá esa fila.") };
    return { ok: true, ticker: t };
  }
  if (catalog[t]) return { ok: true, ticker: t };
  if (catalog[t + ".AX"] && !catalog[t]) {
    return { ok: false, error: t + tr(" en este catálogo es de ASX (") + t + ".AX). Poné AUD o ASX en Mercado/Moneda, o usá el ticker " + t + ".AX." };
  }
  return { ok: false, error: t + tr(" no está en el catálogo.") };
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function u16(b: Uint8Array, o: number): number { return b[o] | (b[o + 1] << 8); }
function u32(b: Uint8Array, o: number): number { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
function i32(b: Uint8Array, o: number): number { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) | 0; }

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const CS = (globalThis as unknown as { DecompressionStream?: new (fmt: string) => unknown }).DecompressionStream;
  if (!CS) throw new Error("Este navegador no puede descomprimir un .xlsx (falta DecompressionStream). Guardá el archivo como CSV e importalo de nuevo.");
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const stream = (new Blob([copy]).stream() as unknown as { pipeThrough: (x: unknown) => ReadableStream }).pipeThrough(new CS("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function unzip(buffer: ArrayBuffer | Uint8Array): Promise<Record<string, Uint8Array>> {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let eocd = -1;
  for (let i = b.length - 22; i >= 0 && i >= b.length - 22 - 0x10000; i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("El archivo no parece un .xlsx válido (no encontré el índice ZIP).");
  const entries = u16(b, eocd + 10);
  let cd = u32(b, eocd + 16);
  const files: Record<string, Uint8Array> = {};
  for (let n = 0; n < entries; n++) {
    if (u32(b, cd) !== 0x02014b50) throw new Error("El .xlsx está dañado (directorio ZIP).");
    const method = u16(b, cd + 10);
    const compSize = u32(b, cd + 20);
    const nameLen = u16(b, cd + 28);
    const extraLen = u16(b, cd + 30);
    const commentLen = u16(b, cd + 32);
    const localOff = u32(b, cd + 42);
    const name = utf8Decode(b.subarray(cd + 46, cd + 46 + nameLen)).replace(/\\/g, "/");
    const lh = localOff;
    if (u32(b, lh) !== 0x04034b50) throw new Error("El .xlsx está dañado (entrada ZIP).");
    const lhName = u16(b, lh + 26);
    const lhExtra = u16(b, lh + 28);
    const dataStart = lh + 30 + lhName + lhExtra;
    const comp = b.subarray(dataStart, dataStart + compSize);
    let raw: Uint8Array;
    if (method === 0) raw = comp;
    else if (method === 8) raw = await inflateRaw(comp);
    else throw new Error("Este .xlsx usa una compresión que no puedo leer. Guardalo como CSV e importalo de nuevo.");
    files[name] = raw;
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function stripXmlNs(xml: string): string {
  return xml.replace(/<\/?([A-Za-z0-9]+):/g, "<$1").replace(/\sxmlns(?::[A-Za-z0-9]+)?="[^"]*"/g, "");
}

function colFromA1(r: string): number {
  const m = String(r).match(/^([A-Z]+)/i);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSharedStrings(xml: string): string[] {
  if (!xml) return [];
  const body = stripXmlNs(xml);
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(body))) {
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null, parts: string[] = [];
    while ((t = tRe.exec(m[1]))) parts.push(decodeXml(t[1]));
    out.push(parts.join(""));
  }
  return out;
}

function cellTypeAndValue(cXml: string): { ref: string; typ: string; value: string } {
  const typeM = cXml.match(/\bt="([^"]+)"/);
  const typ = typeM ? typeM[1] : "n";
  const rM = cXml.match(/\br="([^"]+)"/);
  const ref = rM ? rM[1] : "";
  if (typ === "inlineStr" || typ === "inline") {
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null, parts: string[] = [];
    while ((t = tRe.exec(cXml))) parts.push(decodeXml(t[1]));
    return { ref, typ, value: parts.join("") };
  }
  const vM = cXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  const v = vM ? decodeXml(vM[1]) : "";
  return { ref, typ, value: v };
}

function parseSheetXml(sheetXml: string, sst: string[]): unknown[][] {
  const body = stripXmlNs(sheetXml);
  const rows: unknown[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(body))) {
    const cells: unknown[] = [];
    const inner = rm[1];
    const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(inner))) {
      const attrs = c[1];
      const content = c[2] || "";
      const parsed = cellTypeAndValue("<c " + attrs + ">" + content + "</c>");
      const col = colFromA1(parsed.ref || "");
      let val: unknown = parsed.value;
      const typ = (attrs.match(/\bt="([^"]+)"/) || [])[1] || parsed.typ || "n";
      if (typ === "s") {
        const idx = Number(val);
        val = Number.isFinite(idx) && sst[idx] != null ? sst[idx] : "";
      } else if (typ === "b") {
        val = val === "1" ? "TRUE" : "FALSE";
      } else if (typ === "str" || typ === "e" || typ === "d" || typ === "inlineStr" || typ === "inline") {
        val = val == null ? "" : String(val);
      } else if (val !== "") {
        const num = Number(val);
        val = Number.isFinite(num) ? num : val;
      }
      cells[col] = val;
    }
    rows.push(cells);
  }
  return rows;
}

function firstWorkbookSheetPath(files: Record<string, Uint8Array>): string {
  const names = Object.keys(files);
  const wbName = names.find((n) => /xl\/workbook\.xml$/i.test(n));
  const relsName = names.find((n) => /xl\/_rels\/workbook\.xml\.rels$/i.test(n));
  const sheetFiles = names.filter((n) => /xl\/worksheets\/[^/]+\.xml$/i.test(n)).sort();
  if (!sheetFiles.length) throw new Error("El .xlsx no tiene una hoja de cálculo que pueda leer.");
  if (!wbName || !relsName) return sheetFiles[0];
  const wb = stripXmlNs(utf8Decode(files[wbName]));
  const rels = stripXmlNs(utf8Decode(files[relsName]));
  const sheetM = wb.match(/<sheet\b[^>]*>/);
  if (!sheetM) return sheetFiles[0];
  const ridM = sheetM[0].match(/r:id="([^"]+)"/) || sheetM[0].match(/id="([^"]+)"/);
  if (!ridM) return sheetFiles[0];
  const rid = ridM[1];
  const re = new RegExp("<Relationship\\b[^>]*Id=\"" + rid + "\"[^>]*Target=\"([^\"]+)\"", "i");
  const re2 = new RegExp("<Relationship\\b[^>]*Target=\"([^\"]+)\"[^>]*Id=\"" + rid + "\"", "i");
  const tm = rels.match(re) || rels.match(re2);
  if (!tm) return sheetFiles[0];
  let target = tm[1].replace(/^\//, "");
  if (!target.startsWith("xl/")) target = "xl/" + target.replace(/^\.\.\//, "");
  const hit = names.find((n) => n.replace(/\\/g, "/") === target || n.endsWith(target.split("/").pop() || ""));
  return hit || sheetFiles[0];
}

async function readXlsxRows(buffer: ArrayBuffer | Uint8Array): Promise<unknown[][]> {
  const files = await unzip(buffer);
  const sstName = Object.keys(files).find((n) => /xl\/sharedStrings\.xml$/i.test(n));
  const sst = sstName ? parseSharedStrings(utf8Decode(files[sstName])) : [];
  const sheetPath = firstWorkbookSheetPath(files);
  return parseSheetXml(utf8Decode(files[sheetPath]), sst);
}

function parseCsvText(text: string): unknown[][] {
  let s = text.replace(new RegExp("^" + String.fromCharCode(65279)), "");
  if (!s.trim()) return [];
  const firstLine = (s.split(/\r?\n/).find((l) => l.trim()) || "");
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  const tab = (firstLine.match(/\t/g) || []).length;
  const delim = tab >= semi && tab >= comma && tab > 0 ? "\t" : semi > comma ? ";" : ",";
  const rows: unknown[][] = [];
  let i = 0, field = "", row: unknown[] = [], inQ = false;
  while (i < s.length) {
    const ch = s[i];
    if (inQ) {
      if (ch === "\"") {
        if (s[i + 1] === "\"") { field += "\""; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === "\"") { inQ = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ""; i++; continue; }
    if (ch === "\n" || ch === "\r") {
      row.push(field); field = "";
      rows.push(row); row = [] as unknown[];
      if (ch === "\r" && s[i + 1] === "\n") i += 2; else i++;
      continue;
    }
    field += ch; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function cfbReadStream(buf: ArrayBuffer | Uint8Array, nameWanted: string): Uint8Array | null {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  for (let i = 0; i < 8; i++) if (b[i] !== sig[i]) return null;
  const sectorShift = u16(b, 0x1E);
  const sectorSize = 1 << sectorShift;
  const miniShift = u16(b, 0x20);
  const miniSize = 1 << miniShift;
  const dirStart = u32(b, 0x30);
  const miniCutoff = u32(b, 0x38);
  const miniFatStart = u32(b, 0x3C);
  const difatStart = u32(b, 0x44);
  const difatCount = u32(b, 0x48);
  const fatSects: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = u32(b, 0x4C + i * 4);
    if (s !== 0xFFFFFFFF) fatSects.push(s);
  }
  let d = difatStart;
  for (let n = 0; n < difatCount; n++) {
    const off = (d + 1) * sectorSize;
    for (let i = 0; i < sectorSize / 4 - 1; i++) {
      const s = u32(b, off + i * 4);
      if (s !== 0xFFFFFFFF) fatSects.push(s);
    }
    d = u32(b, off + sectorSize - 4);
  }
  const fat: number[] = [];
  for (const sec of fatSects) {
    const off = (sec + 1) * sectorSize;
    for (let i = 0; i < sectorSize / 4; i++) fat.push(u32(b, off + i * 4));
  }
  function chain(start: number): number[] {
    const out: number[] = [];
    let s = start, guard = 0;
    while (s < 0xFFFFFFFA && guard++ < 1e6) {
      out.push(s);
      s = fat[s];
      if (s === undefined) break;
    }
    return out;
  }
  function readChain(start: number): Uint8Array {
    const parts: Uint8Array[] = [];
    for (const s of chain(start)) {
      const off = (s + 1) * sectorSize;
      parts.push(b.subarray(off, off + sectorSize));
    }
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const dirData = readChain(dirStart);
  const entries: { name: string; type: number; start: number; size: number }[] = [];
  for (let off = 0; off + 128 <= dirData.length; off += 128) {
    const nameLen = u16(dirData, off + 64);
    const type = dirData[off + 66];
    if (!type) continue;
    let name = "";
    const nChars = Math.max(0, Math.floor(nameLen / 2) - 1);
    for (let i = 0; i < nChars; i++) name += String.fromCharCode(u16(dirData, off + i * 2));
    const start = u32(dirData, off + 116);
    const sizeLow = u32(dirData, off + 120);
    entries.push({ name, type, start, size: sizeLow });
  }
  const root = entries.find((e) => e.type === 5) || entries[0];
  const miniFat: number[] = [];
  for (const s of chain(miniFatStart)) {
    const off = (s + 1) * sectorSize;
    for (let i = 0; i < sectorSize / 4; i++) miniFat.push(u32(b, off + i * 4));
  }
  const miniContainer = root ? readChain(root.start) : new Uint8Array();
  function readStream(ent: { name: string; type: number; start: number; size: number }): Uint8Array {
    if (ent.size < miniCutoff) {
      const parts: Uint8Array[] = [];
      let s = ent.start, guard = 0, total = 0;
      while (s < 0xFFFFFFFA && guard++ < 1e6 && total < ent.size) {
        const off = s * miniSize;
        parts.push(miniContainer.subarray(off, off + miniSize));
        total += miniSize;
        s = miniFat[s];
        if (s === undefined) break;
      }
      const out = new Uint8Array(ent.size);
      let o = 0;
      for (const p of parts) {
        const n = Math.min(p.length, ent.size - o);
        out.set(p.subarray(0, n), o);
        o += n;
        if (o >= ent.size) break;
      }
      return out;
    }
    const raw = readChain(ent.start);
    return raw.subarray(0, ent.size);
  }
  const want = entries.find((e) => e.type === 2 && (e.name === nameWanted || e.name.toLowerCase() === nameWanted.toLowerCase()));
  return want ? readStream(want) : null;
}

function parseWorkbookStream(stream: Uint8Array): unknown[][] {
  const b = stream;
  const recs: { op: number; data: Uint8Array }[] = [];
  let i = 0;
  while (i + 4 <= b.length) {
    const op = u16(b, i);
    const len = u16(b, i + 2);
    if (i + 4 + len > b.length) break;
    recs.push({ op, data: b.subarray(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  const sst: string[] = [];
  for (let ri = 0; ri < recs.length; ri++) {
    const rec = recs[ri];
    if (rec.op !== 0x00FC) continue;
    const parts: Uint8Array[] = [rec.data];
    let k = ri + 1;
    while (k < recs.length && recs[k].op === 0x003C) { parts.push(recs[k].data); k++; }
    let si = 0, so = 8;
    function avail(): number {
      let n = 0;
      if (si < parts.length) n += parts[si].length - so;
      for (let t = si + 1; t < parts.length; t++) n += parts[t].length;
      return n;
    }
    function readByte(): number {
      while (si < parts.length && so >= parts[si].length) { si++; so = 0; }
      if (si >= parts.length) return 0;
      return parts[si][so++];
    }
    function atSegStart(): boolean { return so === 0 && si > 0; }
    function readU16s(): number { return readByte() | (readByte() << 8); }
    function readU32s(): number { return (readByte() | (readByte() << 8) | (readByte() << 16) | (readByte() << 24)) >>> 0; }
    const unique = u32(rec.data, 4);
    for (let u = 0; u < unique && avail() >= 3; u++) {
      const cch = readU16s();
      let flags = readByte();
      let sixteen = !!(flags & 0x01);
      const rich = !!(flags & 0x08);
      const phonetic = !!(flags & 0x04);
      let richCount = 0, phonLen = 0;
      if (rich) richCount = readU16s();
      if (phonetic) phonLen = readU32s();
      let text = "";
      for (let chars = 0; chars < cch && avail() > 0; chars++) {
        if (atSegStart()) {
          const f = readByte();
          sixteen = !!(f & 0x01);
        }
        if (sixteen) {
          if (avail() < 2) break;
          text += String.fromCharCode(readU16s());
        } else {
          text += String.fromCharCode(readByte());
        }
      }
      for (let r = 0; r < richCount; r++) { readU16s(); readU16s(); }
      for (let r = 0; r < phonLen; r++) readByte();
      sst.push(text);
    }
  }

  function parseRk(v: number): number {
    const fx = v & 0x03;
    let n: number;
    if (fx & 2) n = v >> 2;
    else {
      const buf = new ArrayBuffer(8);
      const u = new Uint32Array(buf);
      const f = new Float64Array(buf);
      u[1] = v & 0xFFFFFFFC;
      u[0] = 0;
      n = f[0];
    }
    if (fx & 1) n /= 100;
    return n;
  }
  function f64(data: Uint8Array, o: number): number {
    return new DataView(data.buffer as ArrayBuffer, data.byteOffset + o, 8).getFloat64(0, true);
  }

  const rowsBySheet = new Map<number, unknown[][]>();
  let inSheet = false, sheetIndex = -1, currentRows: unknown[][] = [];
  function put(r: number, c: number, v: unknown): void {
    while (currentRows.length <= r) currentRows.push([] as unknown[]);
    currentRows[r][c] = v;
  }

  for (const rec of recs) {
    const d = rec.data;
    if (rec.op === 0x0809) {
      const type = d.length >= 4 ? u16(d, 2) : 0;
      if (type === 0x0005) inSheet = false;
      else if (type === 0x0010) {
        inSheet = true;
        sheetIndex++;
        currentRows = [] as unknown[][];
        rowsBySheet.set(sheetIndex, currentRows);
      }
    } else if (rec.op === 0x000A) {
      inSheet = false;
    } else if (!inSheet) {
      continue;
    } else if (rec.op === 0x00FD && d.length >= 10) {
      const r = u16(d, 0), c = u16(d, 2), idx = u32(d, 6);
      put(r, c, sst[idx] != null ? sst[idx] : "");
    } else if (rec.op === 0x0204 && d.length >= 8) {
      const r = u16(d, 0), c = u16(d, 2), cch = u16(d, 6);
      let text = "";
      if (d.length >= 9 && (d[8] === 0 || d[8] === 1)) {
        const wide = d[8] === 1;
        let p = 9;
        for (let n = 0; n < cch && p < d.length; n++) {
          if (wide) { text += String.fromCharCode(u16(d, p)); p += 2; }
          else { text += String.fromCharCode(d[p++]); }
        }
      } else {
        for (let n = 0; n < cch && 8 + n < d.length; n++) text += String.fromCharCode(d[8 + n]);
      }
      put(r, c, text);
    } else if (rec.op === 0x0203 && d.length >= 14) {
      put(u16(d, 0), u16(d, 2), f64(d, 6));
    } else if (rec.op === 0x027E && d.length >= 10) {
      put(u16(d, 0), u16(d, 2), parseRk(i32(d, 6)));
    } else if (rec.op === 0x00BD) {
      const r = u16(d, 0);
      let c = u16(d, 2);
      let p = 4;
      while (p + 6 <= d.length - 2) {
        put(r, c, parseRk(i32(d, p + 2)));
        p += 6; c++;
      }
    }
  }
  const first = rowsBySheet.get(0);
  if (first && first.length) return first;
  if (rowsBySheet.size) return rowsBySheet.values().next().value || [];
  return [];
}

function readXlsRows(buffer: ArrayBuffer | Uint8Array): unknown[][] {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (b.length >= 8 && b[0] === 0xD0 && b[1] === 0xCF) {
    const stream = cfbReadStream(b, "Workbook") || cfbReadStream(b, "Book");
    if (!stream) throw new Error("No encontré la hoja de cálculo dentro del .xls. Guardalo como .xlsx o CSV e importalo de nuevo.");
    const rows = parseWorkbookStream(stream);
    if (!rows || !rows.length) throw new Error("El .xls no tiene filas que pueda leer. Guardalo como .xlsx o CSV e importalo de nuevo.");
    return rows;
  }
  throw new Error("No pude leer este .xls (formato Excel 97-2003). Abrilo y guardalo como .xlsx o como CSV e importalo de nuevo.");
}

function findHeaderMap(rows: unknown[][]): { row: number; map: Record<string, number> } | null {
  const maxScan = Math.min(rows.length, 15);
  for (let r = 0; r < maxScan; r++) {
    const row = rows[r] || [];
    const map: Partial<Record<"ticker" | "market" | "qty" | "price" | "date", number>> = {};
    row.forEach((cell, c) => {
      const kind = headerKind(normHeader(cell));
      if (kind && map[kind] == null) map[kind] = c;
    });
    if (map.ticker != null && map.qty != null && map.price != null && map.market != null) {
      return { row: r, map: map as Record<string, number> };
    }
  }
  return null;
}

function cellStr(v: unknown): string {
  if (v == null || v === "") return "";
  return String(v).trim();
}

function interpretGrid(rows: unknown[][], catalog: Record<string, unknown>, ba: Record<string, unknown>): { ok: boolean; error?: string; valid: { row: number; ticker: string; ccy: Ccy; qty: number; price: number; date: string }[]; errors: { row: number; ticker: string; market: string; qty: string; price: string; date: string; error: string }[]; headerRow?: number } {
  const header = findHeaderMap(rows);
  if (!header) {
    return { ok: false, error: tr("No encontré las columnas necesarias. Tiene que haber Acción (o ticker), Mercado/Moneda, Cantidad y Precio de compra. Podés descargar la plantilla para ver el formato."), valid: [], errors: [] };
  }
  const { map, row: headerRow } = header;
  const valid: { row: number; ticker: string; ccy: Ccy; qty: number; price: number; date: string }[] = [];
  const errors: { row: number; ticker: string; market: string; qty: string; price: string; date: string; error: string }[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const rawTicker = row[map.ticker];
    const rawMarket = row[map.market];
    const rawQty = row[map.qty];
    const rawPrice = row[map.price];
    const rawDate = map.date != null ? row[map.date] : "";
    const empty = !cellStr(rawTicker) && !cellStr(rawMarket) && (rawQty == null || cellStr(rawQty) === "") && (rawPrice == null || cellStr(rawPrice) === "") && (rawDate == null || cellStr(rawDate) === "");
    if (empty) continue;
    const excelRow = r + 1;
    const issues: string[] = [];
    const mkt = parseMarket(rawMarket);
    if (!mkt.ok) issues.push(mkt.error);
    const qty = parseImportNum(rawQty, mkt.ok ? mkt.ccy : undefined);
    if (qty == null || !(qty > 0)) issues.push("La cantidad tiene que ser un número mayor a cero.");
    const price = parseImportNum(rawPrice, mkt.ok ? mkt.ccy : undefined);
    if (price == null || !(price > 0)) issues.push("El precio de compra tiene que ser un número mayor a cero.");
    const date = parseImportDate(rawDate);
    if (date === null) issues.push("La fecha no se entiende. Usá DD/MM/AAAA, AAAA-MM-DD, o una fecha de Excel.");
    let ticker: string | null = null;
    if (mkt.ok) {
      const mapped = mapTicker(rawTicker, mkt.ccy, catalog, ba);
      if (!mapped.ok) issues.push(mapped.error);
      else ticker = mapped.ticker;
    } else if (!cellStr(rawTicker)) {
      issues.push("Falta el ticker.");
    }
    if (issues.length || !mkt.ok || ticker == null || qty == null || price == null) {
      errors.push({ row: excelRow, ticker: cellStr(rawTicker), market: cellStr(rawMarket), qty: cellStr(rawQty), price: cellStr(rawPrice), date: cellStr(rawDate), error: issues.join(" ") });
    } else {
      valid.push({ row: excelRow, ticker, ccy: mkt.ccy, qty, price, date: date || "" });
    }
  }
  if (!valid.length && !errors.length) {
    return { ok: false, error: tr("El archivo no tiene filas de compras debajo del encabezado."), valid: [], errors: [] };
  }
  return { ok: true, valid, errors, headerRow: headerRow + 1 };
}

function sniffKind(name: string, buffer: ArrayBuffer | Uint8Array): "xlsx" | "xls" | "csv" | "unknown" {
  const lower = String(name || "").toLowerCase();
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return "xlsx";
  if (b.length >= 8 && b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return "xls";
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return "xlsx";
  if (lower.endsWith(".xls")) return "xls";
  const sample = utf8Decode(b.subarray(0, Math.min(b.length, 200)));
  if (/accion|ticker|cantidad|precio|mercado/i.test(sample) && (sample.includes(",") || sample.includes(";"))) return "csv";
  return "unknown";
}

async function parseImportFile(name: string, buffer: ArrayBuffer | Uint8Array, catalog: Record<string, unknown>, ba: Record<string, unknown>): Promise<{ ok: boolean; error?: string; valid: { row: number; ticker: string; ccy: Ccy; qty: number; price: number; date: string }[]; errors: { row: number; ticker: string; market: string; qty: string; price: string; date: string; error: string }[]; headerRow?: number }> {
  try {
    const kind = sniffKind(name, buffer);
    let rows: unknown[][];
    if (kind === "xlsx") rows = await readXlsxRows(buffer);
    else if (kind === "xls") rows = readXlsRows(buffer);
    else if (kind === "csv") rows = parseCsvText(utf8Decode(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)));
    else {
      return { ok: false, error: tr("Ese archivo no parece un Excel o un CSV. Usá .xlsx, .xls o .csv, o descargá la plantilla."), valid: [], errors: [] };
    }
    return interpretGrid(rows, catalog, ba);
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : tr("No pude leer ese archivo.");
    return { ok: false, error: msg, valid: [], errors: [] };
  }
}

const CRC32_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let k = n;
    for (let i = 0; i < 8; i++) k = k & 1 ? 0xEDB88320 ^ (k >>> 1) : k >>> 1;
    t[n] = k >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return ~c >>> 0;
}

function pushU16(arr: number[], n: number): void { arr.push(n & 0xFF, (n >> 8) & 0xFF); }
function pushU32(arr: number[], n: number): void { arr.push(n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >>> 24) & 0xFF); }

function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const chunks: Uint8Array[] = [];
  for (const file of files) {
    const nameB = enc.encode(file.name);
    const data = file.data;
    const crc = crc32(data);
    const local: number[] = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    pushU32(local, crc); pushU32(local, data.length); pushU32(local, data.length);
    pushU16(local, nameB.length); pushU16(local, 0);
    const localA = new Uint8Array(local.length + nameB.length + data.length);
    localA.set(local, 0);
    localA.set(nameB, local.length);
    localA.set(data, local.length + nameB.length);
    chunks.push(localA);
    const central: number[] = [0x50, 0x4b, 0x01, 0x02, 0x14, 0x00, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    pushU32(central, crc); pushU32(central, data.length); pushU32(central, data.length);
    pushU16(central, nameB.length); pushU16(central, 0); pushU16(central, 0);
    pushU16(central, 0); pushU16(central, 0); pushU32(central, 0); pushU32(central, offset);
    const centralA = new Uint8Array(central.length + nameB.length);
    centralA.set(central, 0);
    centralA.set(nameB, central.length);
    centrals.push(centralA);
    offset += localA.length;
  }
  const cdLen = centrals.reduce((n, c) => n + c.length, 0);
  const cd = new Uint8Array(cdLen);
  let o = 0; for (const c of centrals) { cd.set(c, o); o += c.length; }
  const eocd: number[] = [0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00];
  pushU16(eocd, files.length); pushU16(eocd, files.length);
  pushU32(eocd, cd.length); pushU32(eocd, offset);
  pushU16(eocd, 0);
  const out = new Uint8Array(offset + cd.length + eocd.length);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  out.set(cd, p); p += cd.length;
  out.set(new Uint8Array(eocd), p);
  return out;
}

function xmlEscape(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildTemplateXlsx(): Uint8Array {
  const headers = ["Acción", "Mercado/Moneda", "Cantidad", "Precio de compra", "Fecha de compra"];
  const examples = [
    ["PBR", "USD", "10", "17,30", "16/11/2026"],
    ["BHP.AX", "AUD", "5", "55,37", "16/11/2026"],
  ];
  function inlineRow(rIdx: number, cells: string[]): string {
    const parts: string[] = [];
    cells.forEach((val, i) => {
      const ref = String.fromCharCode(65 + i) + rIdx;
      parts.push("<c r=\"" + ref + "\" t=\"inlineStr\"><is><t>" + xmlEscape(val) + "</t></is></c>");
    });
    return "<row r=\"" + rIdx + "\">" + parts.join("") + "</row>";
  }
  const sheet = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>" +
    inlineRow(1, headers) + inlineRow(2, examples[0]) + inlineRow(3, examples[1]) +
    "</sheetData></worksheet>";
  const workbook = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Compras\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>";
  const rels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>";
  const wbRels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>";
  const types = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>";
  const enc = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: enc.encode(types) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "xl/workbook.xml", data: enc.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(wbRels) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheet) },
  ]);
}

function buildTemplateCsv(): Uint8Array {
  const lines = [
    "Acción,Mercado/Moneda,Cantidad,Precio de compra,Fecha de compra",
    "PBR,USD,10,\"17,30\",16/11/2026",
    "BHP.AX,AUD,5,\"55,37\",16/11/2026",
  ];
  return new TextEncoder().encode(String.fromCharCode(65279) + lines.join("\r\n") + "\r\n");
}

function lotsFromValid(valid: { ticker: string; ccy: Ccy; qty: number; price: number; date: string }[], idPrefix?: string): Lot[] {
  const prefix = idPrefix || "xls";
  return valid.map((v, i) => ({
    id: prefix + "-" + Date.now() + "-" + i + "-" + v.ticker,
    ticker: v.ticker,
    qty: v.qty,
    price: v.price,
    date: v.date || "",
    ccy: v.ccy,
  }));
}

function appendLots(current: Lot[], incoming: Lot[]): Lot[] {
  const seen = new Set(current.map(lotKey));
  const out = current.slice();
  for (const lot of incoming) {
    const k = lotKey(lot);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(lot);
  }
  return out;
}


function ExcelImportPanel({
  onAppend,
  onReplace,
}: {
  onAppend: (incoming: Lot[]) => void;
  onReplace: (incoming: Lot[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [source, setSource] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<{ valid: { row: number; ticker: string; ccy: Ccy; qty: number; price: number; date: string }[]; errors: { row: number; ticker: string; market: string; qty: string; price: string; date: string; error: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const downloadTemplate = () => {
    setErr("");
    const xlsx = buildTemplateXlsx();
    const csv = buildTemplateCsv();
    const xlsxOk = downloadBytes("plantilla-compras.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx);
    const csvOk = xlsxOk ? false : downloadBytes("plantilla-compras.csv", "text/csv;charset=utf-8", csv);
    if (xlsxOk) {
      setMsg(tr("Se descargó plantilla-compras.xlsx. Completala y arrastrala acá."));
      return;
    }
    if (csvOk) {
      setMsg(tr("Se descargó plantilla-compras.csv. Completala y arrastrala acá."));
      return;
    }
    setMsg(tr("Este navegador no dejó descargar la plantilla. Armá un Excel con las columnas del ejemplo."));
  };

  const previewGrid = (rows: unknown[][]) => {
    const parsed = interpretGrid(rows, CATALOG, BA);
    if (!parsed.ok && !parsed.valid.length && !parsed.errors.length) {
      setPending(null);
      setErr(parsed.error || tr("No pude leer esos datos."));
      return;
    }
    setPending({ valid: parsed.valid, errors: parsed.errors });
    if (parsed.error && !parsed.valid.length) setErr(parsed.error);
    else setErr("");
  };

  const previewText = (raw: string) => {
    setMsg("");
    const text = raw.trim();
    if (!text) {
      setPending(null);
      setErr(tr("Pegá las celdas copiadas desde Excel, con la fila de encabezados."));
      return;
    }
    setSource(tr("lo que pegaste"));
    previewGrid(parseCsvText(text));
  };

  const readFile = (file: File | null | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    setMsg("");
    setPending(null);
    setSource(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result;
      if (!(buf instanceof ArrayBuffer)) {
        setBusy(false);
        setErr(tr("No pude leer ese archivo."));
        return;
      }
      void (async () => {
        const parsed = await parseImportFile(file.name, new Uint8Array(buf), CATALOG, BA);
        setBusy(false);
        if (!parsed.ok && !parsed.valid.length && !parsed.errors.length) {
          setPending(null);
          setErr(parsed.error || tr("No pude leer ese archivo."));
          return;
        }
        setPending({ valid: parsed.valid, errors: parsed.errors });
        if (parsed.error && !parsed.valid.length) setErr(parsed.error);
        else setErr("");
      })();
    };
    reader.onerror = () => {
      setBusy(false);
      setPending(null);
      setErr(tr("No pude leer ese archivo."));
    };
    reader.readAsArrayBuffer(file);
  };

  const apply = (mode: "add" | "replace") => {
    if (!pending || !pending.valid.length) return;
    const incoming = lotsFromValid(pending.valid, "xls");
    if (mode === "add") onAppend(incoming);
    else onReplace(incoming);
    setPending(null);
    setErr("");
    setPaste("");
    setShowPaste(false);
    const k = incoming.length === 1 ? tr("1 compra") : tr("{0} compras", incoming.length);
    setMsg(mode === "add" ? tr("Se agregaron {0} a tu cartera. Las que ya estaban iguales no se duplicaron.", k) : tr("Tu cartera ahora tiene las {0} del archivo.", k));
  };

  const nValid = pending?.valid.length ?? 0;
  const nErr = pending?.errors.length ?? 0;

  return (
    <Section heading={tr("Importar compras desde Excel")} caption={tr("Acepta .xlsx, .xls y .csv. El archivo se lee en este dispositivo y no se sube a ningún lado.")}>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; readFile(f); }}
      />
      {!pending ? (
        <>
          <button
            type="button"
            className={over ? "inv-drop inv-drop-over" : "inv-drop"}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); readFile(e.dataTransfer.files?.[0]); }}
          >
            <strong>{busy ? tr("Leyendo el archivo…") : tr("Arrastrá tu Excel acá")}</strong>
            <span>{tr("o hacé clic para elegirlo")}</span>
          </button>
          <div className="inv-row">
            <Button label={tr("Descargar plantilla")} onClick={downloadTemplate} />
            <Button label={showPaste ? tr("Ocultar pegado") : tr("Pegar celdas copiadas")} onClick={() => setShowPaste((v) => !v)} />
          </div>
          {showPaste ? (
            <>
              <textarea
                className="inv-area"
                aria-label={tr("Celdas copiadas desde Excel")}
                value={paste}
                placeholder={tr("Copiá las celdas en Excel (con los encabezados) y pegalas acá")}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setPaste(e.target.value)}
                onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t.trim()) { e.preventDefault(); setPaste(t); previewText(t); } }}
              />
              <Button label={tr("Revisar")} variant="primary" onClick={() => previewText(paste)} />
            </>
          ) : null}
          <Section heading={tr("Qué columnas tiene que tener")} collapsible defaultOpen={false}>
            <Table
              columns={[tr("Acción"), tr("Mercado/Moneda"), tr("Cantidad"), tr("Precio de compra"), tr("Fecha de compra")]}
              align={["start", "start", "end", "end", "start"]}
              rows={[["PBR", "USD", "10", "17,30", "16/11/2026"], ["GGAL", "ARS", "200", "6.040", "03/02/2026"], ["BHP.AX", "AUD", "5", "55,37", "16/11/2026"]]}
            />
            <p className="inv-hint">{tr("Acción es el ticker. Mercado/Moneda: USD (o NYSE, NASDAQ), ARS (o BYMA, pesos) o AUD (o ASX). La fecha es opcional, pero con ella el costo usa el dólar de ese día. Los encabezados también pueden estar en inglés.")}</p>
          </Section>
        </>
      ) : (
        <>
          <Callout tone={nValid ? "info" : "warning"} lead={tr("{0}: {1} {2} para importar{3}.", source, nValid, nValid === 1 ? tr("compra lista") : tr("compras listas"), nErr ? `, ${nErr} ${nErr === 1 ? tr("fila con error") : tr("filas con error")}` : "")}>
            {nErr ? tr("Las filas con error no se importan. Corregilas en el Excel y volvé a cargarlo, o importá solo las que están bien.") : null}
          </Callout>
          {nErr ? (
            <Section heading={tr("Filas con error")}>
              <Table
                columns={[tr("Fila"), tr("Lo que dice"), tr("Problema")]}
                align={["end", "start", "start"]}
                rows={pending.errors.map((e) => [String(e.row), [e.ticker, e.market, e.qty, e.price, e.date].filter(Boolean).join(" · "), { text: e.error, tone: "danger" as const }])}
              />
            </Section>
          ) : null}
          {nValid ? (
            <Section heading={tr("Compras a importar")}>
              <Table
                columns={[tr("Fila"), tr("Título"), tr("Moneda"), tr("Cantidad"), tr("Precio"), tr("Fecha"), tr("Dólar de ese día")]}
                align={["end", "start", "start", "end", "end", "start", "end"]}
                rows={pending.valid.map((v) => {
                  const fx = v.date ? mepOn(v.date) : null;
                  return [String(v.row), v.ticker, v.ccy, qtyText(v.qty), nativeMoney(v.ccy, v.price), v.date ? formatDate(v.date) : "—", fx ? PESOS(fx, 2) : { text: tr("se usa el de hoy"), tone: "warning" as const }];
                })}
              />
            </Section>
          ) : null}
          <div className="inv-row">
            {nValid ? <Button label={tr("Agregar {0}", nValid === 1 ? tr("la compra") : tr("las {0} compras", nValid))} variant="primary" onClick={() => apply("add")} /> : null}
            {nValid ? <Button label={tr("Reemplazar toda mi cartera")} onClick={() => apply("replace")} /> : null}
            <Button label={tr("Cancelar")} onClick={() => { setPending(null); setErr(""); setMsg(""); }} />
          </div>
        </>
      )}
      {err && !pending ? <Callout tone="danger">{err}</Callout> : null}
      {msg && !err ? <Callout tone="info">{msg}</Callout> : null}
    </Section>
  );
}

// ── Valuación de una unidad (acción, CEDEAR, acción local) ───────────────────
type Unit = { ok: boolean; usd: number; native: number; dayUsd: number; dayNative: number; market: string };

function unitOf(x: { ticker: string; ccy: Ccy; ced?: boolean }): Unit {
  const none: Unit = { ok: false, usd: 0, native: 0, dayUsd: 0, dayNative: 0, market: x.ccy === "ARS" ? "BYMA" : "—" };
  const q = CATALOG[x.ticker];
  const ba = BA[x.ticker];
  if (x.ccy === "ARS") {
    if (!ba) return none;
    return { ok: true, usd: ba.price / MEP_VENTA, native: ba.price, dayUsd: ba.dayChg / MEP_VENTA, dayNative: ba.dayChg, market: ba.symbol };
  }
  if (x.ced) {
    // CEDEAR en dólares (especie D): se estima con el precio en pesos dividido el MEP.
    if (!ba) return { ...none, market: "CEDEAR USD" };
    const usd = ba.price / MEP_VENTA;
    return { ok: true, usd, native: usd, dayUsd: ba.dayChg / MEP_VENTA, dayNative: ba.dayChg / MEP_VENTA, market: `${ba.symbol.replace(/\.BA$/, "")}D` };
  }
  if (!q) return none;
  if (quoteCcyOf(x.ticker) === "AUD") {
    const usd = q.price * AUDUSD;
    const dayUsd = q.dayChg * AUDUSD;
    return x.ccy === "AUD"
      ? { ok: true, usd, native: q.price, dayUsd, dayNative: q.dayChg, market: "ASX" }
      : { ok: true, usd, native: usd, dayUsd, dayNative: dayUsd, market: "ASX" };
  }
  return { ok: true, usd: q.price, native: q.price, dayUsd: q.dayChg, dayNative: q.dayChg, market: x.ticker.endsWith("-USD") ? tr("Cripto") : tr("Nueva York") };
}

const EXTRA_KINDS = ["Bono", "Obligación negociable", "Fondo común", "Cripto", "Efectivo", "Plazo fijo", "Otro"];
type FormMarket = "USD" | "ARS" | "CED" | "AUD";
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function demoPortfolio(): { lots: Lot[]; sales: Sale[]; extras: Extra[] } {
  const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const pick = (t: string) => Boolean(CATALOG[t]);
  const lots: Lot[] = [
    { id: "ej1", ticker: "SPY", qty: 4, price: Math.round((CATALOG.SPY?.price ?? 600) * 0.82), date: ago(700), ccy: "USD", fee: 4 },
    { id: "ej2", ticker: "KO", qty: 100, price: Math.round((BA.KO?.price ?? 30000) * 0.55), date: ago(520), ccy: "ARS" },
    { id: "ej3", ticker: "GGAL", qty: 300, price: Math.round((BA.GGAL?.price ?? 6000) * 0.7), date: ago(400), ccy: "ARS" },
    { id: "ej4", ticker: "MSFT", qty: 3, price: Math.round((CATALOG.MSFT?.price ?? 500) * 0.9), date: ago(300), ccy: "USD", fee: 3 },
    { id: "ej5", ticker: "AAPL", qty: 40, price: Math.round(((BA.AAPL?.price ?? 20000) / MEP_VENTA) * 0.85 * 100) / 100, date: ago(200), ccy: "USD", ced: true },
    { id: "ej6", ticker: "MSFT", qty: 2, price: Math.round((CATALOG.MSFT?.price ?? 500) * 1.04), date: ago(60), ccy: "USD" },
  ].filter((l) => pick(l.ticker)) as Lot[];
  const sales: Sale[] = pick("SPY") ? [{ id: "ejv1", ticker: "SPY", qty: 1, price: Math.round((CATALOG.SPY?.price ?? 600) * 0.97), date: ago(90), ccy: "USD", fee: 2 }] : [];
  const extras: Extra[] = [{ id: "ejx1", name: tr("Dólares en la cuenta"), kind: "Efectivo", ccy: "USD", cost: 500, value: 500, date: ago(30) }];
  return { lots, sales, extras };
}

export default function InversionesPage() {
  const [watch, setWatch] = useState<string[]>(DEFAULT_WATCH);
  const [lots, setLots] = useState<Lot[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [pf, setPf] = useState<{ active: string; list: PortfolioRef[] }>({ active: MAIN_PORTFOLIO.id, list: [MAIN_PORTFOLIO] });
  const [pfEdit, setPfEdit] = useState<{ mode: "new" | "rename"; name: string } | null>(null);
  const [mode, setMode] = useState<PersistMode>("loading");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const hydrated = useRef(false);
  const [chartSym, setChartSym] = useState("PBR");
  const [chartRange, setChartRange] = useState<"m3" | "y1" | "y5">("m3");
  const [histRange, setHistRange] = useState<"all" | "y1" | "m3">("all");
  const [allocBy, setAllocBy] = useState<"titulo" | "sector" | "pais">("titulo");
  // Formulario de compra
  const [lotTicker, setLotTicker] = useState("PBR");
  const [market, setMarket] = useState<FormMarket>("USD");
  const [qtyStr, setQtyStr] = useState("");
  const [pxStr, setPxStr] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [fxStr, setFxStr] = useState("");
  const [feeStr, setFeeStr] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  // Venta
  const [sellKey, setSellKey] = useState<string | null>(null);
  const [sQty, setSQty] = useState("");
  const [sPx, setSPx] = useState("");
  const [sDate, setSDate] = useState("");
  const [sFee, setSFee] = useState("");
  const [sellError, setSellError] = useState("");
  // Otros activos
  const [xOpen, setXOpen] = useState(false);
  const [xId, setXId] = useState<string | null>(null);
  const [xName, setXName] = useState("");
  const [xKind, setXKind] = useState(EXTRA_KINDS[0]);
  const [xCcy, setXCcy] = useState<"USD" | "ARS">("USD");
  const [xCost, setXCost] = useState("");
  const [xValue, setXValue] = useState("");
  const [xDate, setXDate] = useState("");
  const [xError, setXError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [heatWin, setHeatWin] = useState<HeatWindow>("d");
  const [tab, setTab] = useState<MainTab>("cartera");
  const [syncIn, setSyncIn] = useState<string | null>(null);
  const [calMsg, setCalMsg] = useState("");
  // Sube cuando llegan datos nuevos de DATA_URL, para recalcular todo.
  const [dataVer, setDataVer] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [installEvt, setInstallEvt] = useState<{ prompt: () => void } | null>(null);
  const [lang, setLangState] = useState<Lang>(() => { const l = readLang(); setLang(l); return l; });
  const changeLang = (l: Lang) => { setLang(l, true); setLangState(l); };

  const lotCcy: Ccy = market === "CED" ? "USD" : market;
  const lotCed = market === "CED";

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Chrome/Android ofrece instalar la página: guardamos el aviso para mostrar un botón.
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as unknown as { prompt: () => void }); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    if (!DATA_URL) return;
    // Abierta como archivo (doble clic): solo se puede buscar una dirección completa (https://...).
    if (globalThis.location?.protocol === "file:" && !/^https?:\/\//.test(DATA_URL)) return;
    let alive = true;
    const g = globalThis as unknown as { fetch?: (u: string, o?: { cache?: string }) => Promise<{ ok: boolean; json(): Promise<unknown> }> };
    if (!g.fetch) return;
    const load = () => {
      // El parámetro evita que el navegador o el servidor devuelvan una copia vieja.
      g.fetch!(`${DATA_URL}${DATA_URL.includes("?") ? "&" : "?"}t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((ds) => {
          if (!alive || !isDataset(ds)) return;
          if (Date.parse(ds.generatedAt) <= Date.parse(D.generatedAt)) return;
          applyDataset(ds);
          setDataVer((v) => v + 1);
          setNow(new Date());
        })
        .catch(() => { /* sin red o bloqueado: quedan los datos de la página */ });
    };
    load();
    // Mientras la página está abierta, busca datos nuevos cada 5 minutos y al volver a la pestaña.
    const id = setInterval(load, 5 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  const skipTabWrite = useRef(true);
  const skipPersistWrite = useRef(true);

  useEffect(() => {
    const ports = readPortfolios();
    setPf(ports);
    storageKey = keyOfPortfolio(ports.active);
    const stored = readPersisted();
    const incoming = stored;
    dropLegacyCookie();
    if (incoming) {
      setWatch(incoming.watch);
      setLots(incoming.lots);
      setSales(incoming.sales ?? []);
      setExtras(incoming.extras ?? []);
      if (incoming.watch[0]) setChartSym(incoming.watch[0]);
      if (incoming.updatedAt) setLastSavedAt(incoming.updatedAt);
    }
    const ok = incoming
      ? writePersisted(incoming.watch, incoming.lots, incoming.updatedAt, { sales: incoming.sales ?? [], extras: incoming.extras ?? [] })
      : writePersisted(DEFAULT_WATCH, []);
    setMode(ok ? "local" : "memory");
    // Si la página se abrió desde un QR, la cartera cifrada viene después del # (no viaja al servidor).
    let fromQr: string | null = null;
    try {
      fromQr = location.hash.startsWith("#s=") ? findSync(location.hash) : null;
      if (location.hash.startsWith("#s=")) history.replaceState(null, "", location.pathname + location.search);
    } catch { /* sin ventana */ }
    if (fromQr) { setSyncIn(fromQr); setTab("datos"); } else setTab(readTab());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    if (skipPersistWrite.current) {
      skipPersistWrite.current = false;
      return;
    }
    const updatedAt = new Date().toISOString();
    const ok = writePersisted(watch, lots, updatedAt, { sales, extras });
    if (ok) {
      setLastSavedAt(updatedAt);
    }
    setMode(ok ? "local" : "memory");
  }, [watch, lots, sales, extras]);

  useEffect(() => {
    if (skipTabWrite.current) {
      skipTabWrite.current = false;
      return;
    }
    writeTab(tab);
  }, [tab]);

  // ── Carteras ───────────────────────────────────────────────────────────────
  const resetForms = () => {
    setEditingId(null); setSellKey(null); setXOpen(false); setXId(null); setFormError(""); setSellError(""); setXError(""); setConfirmClear(false);
  };
  const loadPortfolio = (id: string, list: PortfolioRef[], seed?: { lots: Lot[]; sales: Sale[]; extras: Extra[] }) => {
    storageKey = keyOfPortfolio(id);
    const st = seed ? null : readPersisted();
    const nextLots = seed?.lots ?? st?.lots ?? [];
    setWatch([...(st?.watch ?? ensureWatch(DEFAULT_WATCH, nextLots))]);
    setLots([...nextLots]);
    setSales([...(seed?.sales ?? st?.sales ?? [])]);
    setExtras([...(seed?.extras ?? st?.extras ?? [])]);
    setLastSavedAt(st?.updatedAt ?? null);
    setPf({ active: id, list });
    writePortfolios(id, list);
    resetForms();
    if (!seed && st) skipPersistWrite.current = true;
  };
  const savePfName = () => {
    if (!pfEdit) return;
    const name = pfEdit.name.trim().slice(0, 30);
    if (!name) return;
    if (pfEdit.mode === "rename") {
      const list = pf.list.map((p) => (p.id === pf.active ? { ...p, name } : p));
      setPf({ active: pf.active, list });
      writePortfolios(pf.active, list);
    } else {
      const id = `c${Date.now().toString(36)}`;
      loadPortfolio(id, [...pf.list, { id, name }], { lots: [], sales: [], extras: [] });
    }
    setPfEdit(null);
  };
  const deletePortfolio = () => {
    if (pf.active === MAIN_PORTFOLIO.id) return;
    try { (globalThis as unknown as { localStorage?: { removeItem(k: string): void } }).localStorage?.removeItem(keyOfPortfolio(pf.active)); } catch { /* nada */ }
    loadPortfolio(MAIN_PORTFOLIO.id, pf.list.filter((p) => p.id !== pf.active));
  };
  const openDemo = () => {
    const list = pf.list.some((p) => p.id === "ejemplo") ? pf.list : [...pf.list, { id: "ejemplo", name: tr("Ejemplo") }];
    loadPortfolio("ejemplo", list, demoPortfolio());
  };

  // ── Cálculo de la cartera ──────────────────────────────────────────────────
  const computed = useMemo(() => {
    const env: Env = { mepOn, mepToday: MEP_VENTA, audusd: AUDUSD };
    const divInfo: DivInfo = { hist: (t) => DIV[t]?.hist ?? [], ratio: (t) => BA[t]?.ratio ?? null, payCcy: (t) => quoteCcyOf(t) };
    const sr = applySales(lots, sales);
    // Cada compra convierte su costo con el dólar MEP de su fecha; el valor de hoy, con el MEP de hoy.
    const rows = sr.open.map((lot) => {
      const fx = lotFx(lot);
      const u = unitOf(lot);
      const costN = lot.qty * lot.price + (lot.fee ?? 0);
      const costUsd = lot.ccy === "ARS" ? costN / fx.rate : lot.ccy === "AUD" ? costN * AUDUSD : costN;
      const costArs = lot.ccy === "ARS" ? costN : costUsd * fx.rate;
      const valueUsd = u.ok ? lot.qty * u.usd : 0;
      const valueArs = valueUsd * MEP_VENTA;
      const valueN = u.ok ? lot.qty * u.native : 0;
      const f = divFactor(lot, divInfo, env);
      const ttmInc = u.ok && f != null ? lot.qty * (DIV[lot.ticker]?.ttm ?? 0) * f : 0;
      return {
        lot, fxRate: fx.rate, fxSrc: fx.src, ok: u.ok, market: u.market, key: posKey(lot),
        costN, valueN, pnlN: valueN - costN,
        costUsd, valueUsd, pnlUsd: valueUsd - costUsd, dayUsd: u.ok ? lot.qty * u.dayUsd : 0,
        costArs, valueArs, pnlArs: valueArs - costArs,
        pct: costN ? ((valueN - costN) / costN) * 100 : 0,
        pctUsd: costUsd ? ((valueUsd - costUsd) / costUsd) * 100 : 0,
        ttmInc, divKnown: f != null,
      };
    });
    type Agg = { key: string; ticker: string; ccy: Ccy; ced: boolean; market: string; label: string; qty: number; costN: number; valueN: number; costUsd: number; valueUsd: number; dayUsd: number; costArs: number; valueArs: number; ttmInc: number; ok: boolean; divKnown: boolean };
    const byKey = new Map<string, Agg>();
    for (const r of rows) {
      const a = byKey.get(r.key) ?? { key: r.key, ticker: r.lot.ticker, ccy: r.lot.ccy, ced: Boolean(r.lot.ced), market: r.market, label: r.lot.ccy === "ARS" || r.lot.ced ? `${r.lot.ticker} (${r.market})` : r.lot.ticker, qty: 0, costN: 0, valueN: 0, costUsd: 0, valueUsd: 0, dayUsd: 0, costArs: 0, valueArs: 0, ttmInc: 0, ok: true, divKnown: true };
      a.qty += r.lot.qty; a.costN += r.costN; a.valueN += r.valueN; a.costUsd += r.costUsd; a.valueUsd += r.valueUsd; a.dayUsd += r.dayUsd;
      a.costArs += r.costArs; a.valueArs += r.valueArs; a.ttmInc += r.ttmInc; a.ok = a.ok && r.ok; a.divKnown = a.divKnown && r.divKnown;
      byKey.set(r.key, a);
    }
    const positions = Array.from(byKey.values()).map((p) => ({
      ...p,
      pnlN: p.valueN - p.costN,
      pnlUsd: p.valueUsd - p.costUsd,
      pct: p.costN ? ((p.valueN - p.costN) / p.costN) * 100 : 0,
      pctUsd: p.costUsd ? ((p.valueUsd - p.costUsd) / p.costUsd) * 100 : 0,
      // En pesos: el costo al dólar del día de cada compra y el valor al dólar de hoy (incluye la devaluación).
      pctArs: p.costArs ? ((p.valueArs - p.costArs) / p.costArs) * 100 : 0,
      yoc: p.costUsd ? (p.ttmInc / p.costUsd) * 100 : 0,
    })).sort((a, b) => b.valueUsd - a.valueUsd);
    const extraRows = extras.map((x) => {
      const fx = lotFx({ date: x.date, fx: x.fx } as Lot).rate;
      const costUsd = x.ccy === "ARS" ? x.cost / fx : x.cost;
      const valueUsd = x.ccy === "ARS" ? x.value / MEP_VENTA : x.value;
      return { x, costUsd, valueUsd, costArs: x.ccy === "ARS" ? x.cost : x.cost * fx, valueArs: valueUsd * MEP_VENTA, pct: x.cost ? (x.value / x.cost - 1) * 100 : 0 };
    });
    const okRows = rows.filter((r) => r.ok);
    const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
    const costUsd = sum(okRows, (r) => r.costUsd) + sum(extraRows, (r) => r.costUsd);
    const valueUsd = sum(okRows, (r) => r.valueUsd) + sum(extraRows, (r) => r.valueUsd);
    const costArs = sum(okRows, (r) => r.costArs) + sum(extraRows, (r) => r.costArs);
    const valueArs = sum(okRows, (r) => r.valueArs) + sum(extraRows, (r) => r.valueArs);
    const dayUsd = sum(okRows, (r) => r.dayUsd);
    const prev = valueUsd - dayUsd;
    const realized = realizedBySale(sr.pieces, env);
    const received = receivedDividends(sr.pieces, divInfo, env);
    const history = D.hist
      ? portfolioHistory(sr.pieces, { weeks: D.hist.weeks, series: (t) => D.hist?.series[t] ?? null, unitUsdToday: (x) => { const u = unitOf(x); return u.ok ? u.usd : null; }, benchmark: "SPY" }, env)
      : { points: [], skipped: 0 };
    const parts = [
      ...positions.filter((p) => p.ok).map((p) => ({ titulo: p.label, sector: D.meta?.[p.ticker]?.[0] ?? tr("Otros"), pais: p.ccy === "ARS" && BA[p.ticker]?.kind === "local" ? tr("Argentina") : D.meta?.[p.ticker]?.[1] ?? tr("Otros"), value: p.valueUsd })),
      ...extraRows.map((r) => ({ titulo: tr(r.x.name), sector: r.x.kind, pais: tr("Otros activos"), value: r.valueUsd })),
    ];
    return {
      rows, positions, extraRows, realized, received, history, parts, unmatched: sr.unmatched,
      costUsd, valueUsd, pnlUsd: valueUsd - costUsd, dayUsd, costArs, valueArs, pnlArs: valueArs - costArs,
      ttmInc: sum(okRows, (r) => r.ttmInc),
      realizedUsd: sum(realized, (r) => r.pnlUsd), realizedArs: sum(realized, (r) => r.pnlArs),
      fxToday: okRows.filter((r) => r.fxSrc === "hoy").length,
      pct: costUsd ? ((valueUsd - costUsd) / costUsd) * 100 : 0,
      pctArs: costArs ? ((valueArs - costArs) / costArs) * 100 : 0,
      dayPct: prev ? (dayUsd / prev) * 100 : 0,
    };
  }, [lots, sales, extras, dataVer, lang]);

  const followed = ORDER.filter((s) => watch.includes(s) || computed.positions.some((p) => p.ticker === s));
  const heldTickers = new Set(computed.positions.map((p) => p.ticker));

  useEffect(() => {
    if (followed.length && !followed.includes(chartSym)) setChartSym(followed[0]);
  }, [followed, chartSym]);

  useEffect(() => {
    if (isAsxTicker(lotTicker)) {
      if (market === "ARS" || market === "CED") setMarket("AUD");
    } else if (market === "AUD") {
      setMarket("USD");
    }
  }, [lotTicker]);

  const heatItems = followed.map((sym) => {
    const q = CATALOG[sym];
    const posVal = computed.positions.filter((p) => p.ticker === sym && p.ok).reduce((s, p) => s + p.valueUsd, 0);
    const hasW = computed.positions.some((p) => p.ok);
    return { id: sym, label: sym, sub: quotePx(sym, q.price), chg: changeOf(q, heatWin), weight: hasW ? (posVal > 0 ? posVal : computed.valueUsd * 0.04 || 1) : 1 };
  });
  const heatCap = heatWin === "d" ? 5 : heatWin === "m1" ? 15 : 20;

  const addToWatch = (sym: string) => {
    if (!CATALOG[sym] || watch.includes(sym) || heldTickers.has(sym)) return;
    setWatch((w) => (w.includes(sym) ? w : [...w, sym]));
    setChartSym(sym);
  };
  const removeFromWatch = (sym: string) => {
    if (heldTickers.has(sym)) return;
    setWatch((w) => w.filter((s) => s !== sym));
  };

  // ── Compras: agregar, editar, quitar ───────────────────────────────────────
  const clearLotForm = () => { setQtyStr(""); setPxStr(""); setDateStr(""); setFxStr(""); setFeeStr(""); setFormError(""); setEditingId(null); };
  const saveLot = () => {
    setConfirmClear(false);
    const qty = parseNum(qtyStr, lotCcy);
    const price = parseNum(pxStr, lotCcy);
    const date = parseDate(dateStr);
    if (!CATALOG[lotTicker]) { setFormError(tr("Elegí un título de la lista.")); return; }
    if ((market === "ARS" || market === "CED") && !BA[lotTicker]) { setFormError(tr("No hay cotización en BYMA para {0}. Cargalo como comprado en Nueva York.", lotTicker)); return; }
    if (qty === null || !(qty > 0)) { setFormError(tr("La cantidad tiene que ser un número mayor a cero.")); return; }
    if (price === null || !(price > 0)) { setFormError(tr("El precio tiene que ser un número mayor a cero.")); return; }
    if (date === null) { setFormError(tr("Escribí la fecha como DD/MM/AAAA, o dejala vacía.")); return; }
    const fxIn = fxStr.trim() ? parseNum(fxStr, "ARS") : null;
    if (fxStr.trim() && (fxIn === null || !(fxIn > 0))) { setFormError(tr("El dólar de ese día tiene que ser un número mayor a cero (por ejemplo 1.575,50), o quedar vacío.")); return; }
    const feeIn = feeStr.trim() ? parseNum(feeStr, lotCcy) : null;
    if (feeStr.trim() && (feeIn === null || feeIn < 0)) { setFormError(tr("La comisión tiene que ser un número, o quedar vacía.")); return; }
    const lot: Lot = { id: editingId ?? newId(), ticker: lotTicker, qty, price, date, ccy: lotCcy };
    if (fxIn) lot.fx = fxIn;
    if (feeIn) lot.fee = feeIn;
    if (lotCed) lot.ced = true;
    const next = editingId ? lots.map((l) => (l.id === editingId ? lot : l)) : [...lots, lot];
    if (applySales(next, sales).unmatched.length) { setFormError(tr("Con ese cambio quedarían ventas sin compras que las respalden. Quitá primero la venta.")); return; }
    setLots(next);
    clearLotForm();
    if (!watch.includes(lotTicker)) setWatch((w) => [...w, lotTicker]);
  };
  const editLot = (lot: Lot) => {
    setLotTicker(lot.ticker);
    setMarket(lot.ced ? "CED" : lot.ccy);
    const num = (n: number) => String(n).replace(".", ",");
    setQtyStr(num(lot.qty)); setPxStr(num(lot.price)); setDateStr(lot.date ? formatDate(lot.date) : ""); setFxStr(lot.fx ? num(lot.fx) : ""); setFeeStr(lot.fee ? num(lot.fee) : "");
    setEditingId(lot.id); setFormError(""); setSellKey(null);
    document.getElementById("compras")?.scrollIntoView({ behavior: "smooth" });
  };
  const removeLot = (id: string) => {
    const next = lots.filter((l) => l.id !== id);
    if (applySales(next, sales).unmatched.length) { setFormError(tr("Esa compra tiene ventas cargadas. Quitá primero la venta.")); return; }
    setLots(next);
    setConfirmClear(false);
    if (editingId === id) clearLotForm();
  };

  // ── Ventas ─────────────────────────────────────────────────────────────────
  const sellPos = sellKey ? computed.positions.find((p) => p.key === sellKey) ?? null : null;
  const startSell = (key: string) => { setSellKey(key); setSQty(""); setSPx(""); setSDate(""); setSFee(""); setSellError(""); setEditingId(null); };
  const saveSale = () => {
    if (!sellPos) return;
    const qty = parseNum(sQty, sellPos.ccy);
    const price = parseNum(sPx, sellPos.ccy);
    const date = parseDate(sDate);
    if (qty === null || !(qty > 0)) { setSellError(tr("La cantidad tiene que ser un número mayor a cero.")); return; }
    if (qty > sellPos.qty + 1e-9) { setSellError(tr("Tenés {0}; no podés vender más que eso.", qtyText(sellPos.qty))); return; }
    if (price === null || !(price > 0)) { setSellError(tr("El precio de venta tiene que ser un número mayor a cero.")); return; }
    if (!date) { setSellError(tr("Escribí la fecha de la venta como DD/MM/AAAA.")); return; }
    const feeIn = sFee.trim() ? parseNum(sFee, sellPos.ccy) : null;
    if (sFee.trim() && (feeIn === null || feeIn < 0)) { setSellError(tr("La comisión tiene que ser un número, o quedar vacía.")); return; }
    const sale: Sale = { id: newId(), ticker: sellPos.ticker, qty, price, date, ccy: sellPos.ccy };
    if (feeIn) sale.fee = feeIn;
    if (sellPos.ced) sale.ced = true;
    setSales((prev) => [...prev, sale]);
    setSellKey(null);
  };

  // ── Otros activos ──────────────────────────────────────────────────────────
  const openExtra = (x?: Extra) => {
    const num = (n: number) => String(n).replace(".", ",");
    setXOpen(true); setXError("");
    setXId(x?.id ?? null); setXName(x?.name ?? ""); setXKind(x?.kind ?? EXTRA_KINDS[0]); setXCcy(x?.ccy ?? "USD");
    setXCost(x ? num(x.cost) : ""); setXValue(x ? num(x.value) : ""); setXDate(x?.date ? formatDate(x.date) : "");
  };
  const saveExtra = () => {
    const cost = parseNum(xCost, xCcy);
    const value = parseNum(xValue, xCcy);
    const date = parseDate(xDate);
    if (!xName.trim()) { setXError(tr("Ponele un nombre (por ejemplo «Bono AL30» o «Fondo en dólares»).")); return; }
    if (cost === null || cost < 0) { setXError(tr("Lo que pusiste tiene que ser un número.")); return; }
    if (value === null || value < 0) { setXError(tr("Lo que vale hoy tiene que ser un número.")); return; }
    if (date === null) { setXError(tr("Escribí la fecha como DD/MM/AAAA, o dejala vacía.")); return; }
    const x: Extra = { id: xId ?? newId(), name: xName.trim().slice(0, 60), kind: xKind, ccy: xCcy, cost, value, date };
    setExtras((prev) => (xId ? prev.map((e) => (e.id === xId ? x : e)) : [...prev, x]));
    setXOpen(false); setXId(null);
  };

  // ── Fechas y calendario ────────────────────────────────────────────────────
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const fresh = freshness(D.generatedAt, now);
  const nyDay = fmtIso(D.sessions.ny);
  const asxDay = fmtIso(D.sessions.asx);
  const baDay = fmtIso(D.sessions.ba);
  const fxStamp = fmtStampBA(D.sessions.fx);
  const dataStamp = fmtStampBA(D.generatedAt);

  type CalRow = CalEvent & { kind: "nota" | "div" | "earn" };
  const calHorizon = addDaysIso(todayIso, 60);
  const calAll: CalRow[] = D.notes.calendar.map((e) => ({ ...e, kind: "nota" as const }));
  const hasNote = (sym: string, iso: string) => D.notes.calendar.some((e) => e.ticker === sym && e.date === iso);
  for (const sym of followed) {
    const d = DIV[sym];
    if (d?.nextEx && !hasNote(sym, d.nextEx)) calAll.push({ kind: "div", date: d.nextEx, ticker: sym, title: tr("Fecha ex de dividendo"), detail: d.nextPay ? tr("Pago el {0}.", fmtIso(d.nextPay)) : "", src: "Yahoo Finance" });
    if (d?.nextPay && !hasNote(sym, d.nextPay)) calAll.push({ kind: "div", date: d.nextPay, ticker: sym, title: tr("Pago de dividendo"), detail: d.nextEx ? tr("Fecha ex {0}.", fmtIso(d.nextEx)) : "", src: "Yahoo Finance" });
    const e = D.earnings[sym];
    if (e && !hasNote(sym, e.date)) calAll.push({ kind: "earn", date: e.date, ticker: sym, title: e.estimate ? tr("Resultados (fecha estimada)") : tr("Resultados trimestrales"), detail: "", src: "Yahoo Finance" });
  }
  const calMine = calAll
    .filter((e) => followed.includes(e.ticker) && e.date >= todayIso && e.date <= calHorizon)
    .sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
  const exportCalendar = () => {
    const evs: IcsEvent[] = calAll
      .filter((e) => e.kind !== "earn" && followed.includes(e.ticker) && e.date >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker))
      .map((e) => ({ date: e.date, title: `${e.ticker}: ${e.title}`, detail: [CATALOG[e.ticker]?.name ? `${CATALOG[e.ticker].name}.` : "", e.detail, tr("Fuente: {0}. Las fechas pueden cambiar.", e.src)].filter(Boolean).join(" "), uid: `${e.ticker}-${e.title.replace(/[^A-Za-z0-9]+/g, "")}-${e.date}@seguimiento-inversiones` }));
    if (evs.length === 0) { setCalMsg(tr("No hay fechas de dividendos anunciadas para tu lista.")); return; }
    const ok = downloadBytes("dividendos.ics", "text/calendar;charset=utf-8", new TextEncoder().encode(buildIcs(evs, tr("Dividendos"))));
    setCalMsg(ok ? tr("Se descargó dividendos.ics con {0}. Abrilo para sumarlo a tu calendario.", evs.length === 1 ? tr("1 fecha") : tr("{0} fechas", evs.length)) : tr("Este navegador no dejó descargar el archivo."));
  };
  // Fuera de hora: qué rueda extendida muestran los datos y cuánto mueve a las posiciones de Nueva York.
  const extKind = followed.map((s) => extOf(s)?.s).find(Boolean) ?? null;
  const extHeld = computed.positions.filter((p) => p.ok && p.ccy === "USD" && !p.ced && extOf(p.ticker));
  const extUsd = extHeld.reduce((sum, p) => sum + (p.valueUsd * (extOf(p.ticker)?.chg ?? 0)) / 100, 0);
  const extBase = extHeld.reduce((sum, p) => sum + p.valueUsd, 0);
  const weekEnd = addDaysIso(todayIso, 7);
  const weekEvents = calMine.filter((e) => e.date <= weekEnd);

  // ── Gráficos ───────────────────────────────────────────────────────────────
  const hasPort = lots.length > 0 || extras.length > 0 || sales.length > 0;
  const okPositions = computed.positions.filter((p) => p.ok);
  const costValue = [
    ...okPositions.map((p) => ({ label: p.label, cost: p.costUsd, value: p.valueUsd })),
    ...computed.extraRows.map((r) => ({ label: tr(r.x.name), cost: r.costUsd, value: r.valueUsd })),
  ].sort((a, b) => b.value - a.value);
  const alloc = allocation(computed.parts.map((p) => ({ label: allocBy === "titulo" ? p.titulo : tr(p[allocBy]), value: p.value })));
  const pieParts = alloc.map((a) => ({ label: a.label, value: a.value, display: `${MONEY(a.value)} · ${YLD(a.pct, 1)}` }));
  const bySector = allocation(computed.parts.map((p) => ({ label: tr(p.sector), value: p.value })));
  const byTitle = allocation(computed.parts.map((p) => ({ label: p.titulo, value: p.value })));
  const warnings: string[] = [];
  if (byTitle.length > 1 && byTitle[0].pct > 35) warnings.push(tr("{0} es el {1} de tu cartera.", byTitle[0].label, YLD(byTitle[0].pct, 0)));
  if (bySector.length > 1 && bySector[0].pct > 60 && bySector[0].label !== tr("Índices")) warnings.push(tr("El {0} está en un solo sector: {1}.", YLD(bySector[0].pct, 0), bySector[0].label));

  // Evolución: valor, invertido y S&P 500 con las mismas fechas
  const histAll = computed.history.points;
  const histPts = histRange === "all" ? histAll : histAll.slice(-(histRange === "y1" ? 53 : 14));
  const histLast = histAll.length ? histAll[histAll.length - 1] : null;

  // Gráfico de un título: 3 meses (diario→semanal de la página) o 1 y 5 años (historia semanal)
  const chartQ = CATALOG[chartSym];
  const chartData = (() => {
    if (!chartQ) return null;
    const s = D.hist?.series[chartSym];
    if (chartRange === "m3" || !s || !D.hist) return chartOf(chartQ);
    const n = chartRange === "y1" ? 53 : s.length;
    const pts = D.hist.weeks.slice(-n).map((w, i) => ({ w, v: s.slice(-n)[i] })).filter((p): p is { w: string; v: number } => p.v != null);
    if (pts.length < 2) return chartOf(chartQ);
    const vals = pts.map((p) => p.v);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08 || 1;
    return { points: pts.map((p) => ({ label: `${monthShort(Number(p.w.slice(5, 7)) - 1)} ${p.w.slice(2, 4)}`, value: p.v })), floor: lo - pad, ceil: hi + pad };
  })();

  // Dividendos de los últimos 12 meses por mes de la fecha ex, con las cantidades de hoy.
  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const [y, m] = todayIso.split("-").map(Number);
    monthKeys.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  }
  const byMonth = new Map(monthKeys.map((k) => [k, 0]));
  for (const p of okPositions) {
    const d = DIV[p.ticker];
    if (!d || !p.ttmInc || !d.ttm) continue;
    const perUnit = p.ttmInc / p.qty / d.ttm; // USD por unidad por cada USD/A$ de dividendo
    for (const [iso, amt] of d.hist) {
      const k = iso.slice(0, 7);
      if (byMonth.has(k)) byMonth.set(k, byMonth.get(k)! + p.qty * amt * perUnit);
    }
  }
  const monthPoints = monthKeys.map((k) => {
    const v = byMonth.get(k) ?? 0;
    return { label: monthShort(Number(k.slice(5, 7)) - 1), value: Math.round(v * 100) / 100, display: formatDec(v, v >= 100 ? 0 : 2) };
  });
  const monthTotal = monthPoints.reduce((s, p) => s + p.value, 0);
  const receivedYears = Object.entries(computed.received.byYear).sort((a, b) => a[0].localeCompare(b[0]));

  const baOfForm = BA[lotTicker];
  const curLabel = (c: Ccy) => (c === "ARS" ? "ARS" : c === "AUD" ? "A$" : "USD");
  const formDate = parseDate(dateStr);
  const formMep = formDate ? mepOn(formDate) : null;
  const fxPlaceholder = formMep ? tr("Automático: {0}", formatDec(formMep, 2)) : tr("Automático");

  const idxLevel = (r: IndexRow) => r.kind === "tasa" ? YLD(r.level, 3) : r.kind === "usd" ? `USD ${formatDec(r.level)}` : r.kind === "fx" ? formatDec(r.level, 4) : formatDec(r.level);
  const bp = (n: number | null | undefined): TableCell => {
    if (n == null) return "—";
    const v = n * 100;
    return { text: `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatDec(Math.abs(v), 1)} ${tr("pb")}`, tone: tone(-v) };
  };
  const pctCell = (n: number | null | undefined): TableCell => ({ text: PCT(n), tone: tone(n) });
  const sgn = (n: number) => (n > 0 ? "ui-tone-success" : n < 0 ? "ui-tone-danger" : undefined);
  const money = (ccy: Ccy, n: number) => nativeMoney(ccy, n);
  const isDemo = pf.active === "ejemplo";
  const pfName = tr(pf.list.find((p) => p.id === pf.active)?.name ?? MAIN_PORTFOLIO.name);

  const lotForm = (
    <div className="inv-form">
      <div className="inv-form-grid">
        <Select label={tr("Título")} options={ORDER.map((s) => ({ value: s, label: `${s} · ${CATALOG[s].name}` }))} value={lotTicker} onChange={setLotTicker} />
        <Select
          label={tr("Dónde lo compraste")}
          options={isAsxTicker(lotTicker)
            ? [{ value: "AUD", label: tr("Australia (ASX), en A$") }, { value: "USD", label: tr("En dólares") }]
            : [
                { value: "USD", label: lotTicker.endsWith("-USD") ? tr("En dólares") : tr("Nueva York, en dólares") },
                ...(baOfForm ? [
                  { value: "ARS", label: tr("Argentina ({0}), en pesos", baOfForm.symbol) },
                  { value: "CED", label: tr("Argentina ({0}D), en dólares", baOfForm.symbol.replace(/\.BA$/, "")) },
                ] : []),
              ]}
          value={market}
          onChange={(v: string) => setMarket(v === "ARS" || v === "AUD" || v === "CED" ? v : "USD")}
        />
        <Input label={tr("Cantidad")} value={qtyStr} onChange={setQtyStr} placeholder={lotCcy === "ARS" ? "1.500" : "10"} />
        <Input label={tr("Precio ({0})", curLabel(lotCcy))} value={pxStr} onChange={setPxStr} placeholder={lotCcy === "ARS" ? "6.040" : "25,50"} />
        <Input label={tr("Fecha de compra")} value={dateStr} onChange={setDateStr} placeholder="DD/MM/AAAA" />
        <Input label={tr("Comisión ({0})", curLabel(lotCcy))} value={feeStr} onChange={setFeeStr} placeholder={tr("Opcional")} />
        <Input label={tr("Dólar de ese día")} value={fxStr} onChange={setFxStr} placeholder={fxPlaceholder} />
      </div>
      <div className="inv-row">
        <Button label={editingId ? tr("Guardar cambios") : tr("Agregar compra")} variant="primary" onClick={saveLot} />
        {editingId ? <Button label={tr("Cancelar")} onClick={clearLotForm} /> : null}
        {(market === "ARS" || market === "CED") && baOfForm ? (
          <span className="inv-hint">
            {market === "ARS" ? tr("{0} cotiza a {1}.", baOfForm.symbol, PESOS(baOfForm.price, baOfForm.price % 1 === 0 ? 0 : 2)) : tr("Se valúa a {0} (precio en pesos ÷ dólar MEP).", MONEY(baOfForm.price / MEP_VENTA))}
            {baOfForm.ratio ? ` ${baOfForm.ratio >= 1 ? tr("{0} {1} = 1 acción de Nueva York", baOfForm.ratio, baOfForm.kind === "local" ? tr("acciones locales") : tr("CEDEARs")) : tr("1 {0} = {1} acciones de Nueva York", baOfForm.kind === "local" ? tr("acción local") : "CEDEAR", Math.round(1 / baOfForm.ratio))}.` : ""}
          </span>
        ) : null}
      </div>
      {formError ? <Callout tone="danger">{formError}</Callout> : null}
    </div>
  );

  return (
    <Page
      title={APP_NAME}
      sources={[tr("Precios, dividendos, resultados y noticias: Yahoo Finance. Dólar: DolarApi y ArgentinaDatos. Nueva York al cierre del {0}, Sídney del {1}, Buenos Aires del {2}. No es una recomendación de inversión.", nyDay, asxDay, baDay)]}
    >
      <DashShell tab={tab} onChange={setTab} stamp={tr("Actualizado {0}", fresh.text)} stampTone={fresh.tone} lang={lang} onLang={changeLang}>
      {fresh.tone === "old" ? <Callout tone="warning" lead={tr("Los precios están desactualizados.")}>{tr("La última actualización fue el ")}{dataStamp}.</Callout> : null}
      {mode === "memory" ? <Callout tone="warning" lead={tr("Este navegador no deja guardar la cartera.")}>{tr("Lo que cargues se pierde al cerrar la página. Descargá un respaldo en «Importar y respaldo».")}</Callout> : null}

      {tab === "cartera" ? (
      <>
        <div className="inv-pf">
          {pfEdit ? (
            <>
              <input className="inv-input" style={{ maxWidth: 220 }} aria-label={tr("Nombre de la cartera")} autoFocus value={pfEdit.name} placeholder={tr("Nombre de la cartera")} onChange={(e) => setPfEdit({ ...pfEdit, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") savePfName(); }} />
              <Button label={tr("Guardar")} variant="primary" onClick={savePfName} />
              <Button label={tr("Cancelar")} onClick={() => setPfEdit(null)} />
            </>
          ) : (
            <>
              <select aria-label={tr("Cartera")} value={pf.active} onChange={(e) => loadPortfolio(e.target.value, pf.list)}>
                {pf.list.map((p) => <option key={p.id} value={p.id}>{tr(p.name)}</option>)}
              </select>
              <Button label={tr("+ Nueva cartera")} onClick={() => setPfEdit({ mode: "new", name: "" })} />
              <Button label={tr("Cambiar nombre")} onClick={() => setPfEdit({ mode: "rename", name: pfName })} />
              {pf.active !== MAIN_PORTFOLIO.id && !isDemo ? <Button label={tr("Borrar esta cartera")} onClick={deletePortfolio} /> : null}
            </>
          )}
        </div>
        {isDemo ? (
          <div className="inv-banner">
            <span>{tr("Esta es una cartera de ejemplo, con compras inventadas, para que veas cómo funciona.")}</span>
            <Button label={tr("Salir y borrar el ejemplo")} variant="primary" onClick={deletePortfolio} />
          </div>
        ) : null}
        {hasPort ? (
          <div className="inv-sum">
            <div>
              <div className="inv-sum-label">{tr("Valor de ")}{pfName}</div>
              <div className="inv-sum-value">{MONEY(computed.valueUsd)} <span className={`inv-pill ${computed.dayUsd >= 0 ? "inv-pill-up" : "inv-pill-down"}`}>{PCT(computed.dayPct)}{tr(" hoy")}</span></div>
              <div className="inv-sum-sub">{PESOS(computed.valueArs, 0)}{tr(" al dólar MEP de hoy (")}{PESOS(MEP_VENTA, 0)})</div>
              {extKind && extBase > 0 ? <div className="inv-sum-sub">{extLabel(extKind)}{": "}<strong className={sgn(extUsd)}>{PCT((extUsd / extBase) * 100)}</strong>{" "}{tr("en tus posiciones de Nueva York ({0})", MONEY(extUsd))}</div> : null}
            </div>
            <dl className="inv-sum-stats">
              <div><dt>{tr("Resultado en dólares")}</dt><dd className={sgn(computed.pnlUsd)}>{MONEY(computed.pnlUsd)}<small>{PCT(computed.pct)}</small></dd></div>
              <div><dt>{tr("Resultado en pesos")}</dt><dd className={sgn(computed.pnlArs)}>{PESOS(computed.pnlArs, 0)}<small>{PCT(computed.pctArs)}</small></dd></div>
              {sales.length ? <div><dt>{tr("Ya vendido")}</dt><dd className={sgn(computed.realizedUsd)}>{MONEY(computed.realizedUsd)}<small>{tr("resultado de ")}{sales.length === 1 ? tr("1 venta") : tr("{0} ventas", sales.length)}</small></dd></div> : null}
              <div><dt>{tr("Dividendos cobrados")}</dt><dd>{MONEY(computed.received.total)}<small>{tr("estimado")}</small></dd></div>
            </dl>
          </div>
        ) : (
          <div className="inv-empty">
            <strong>{tr("Todavía no cargaste compras")}</strong>
            {tr("Agregá la primera acá abajo, importá todas desde un Excel, o mirá un ejemplo.")}
          </div>
        )}
        <div className="inv-actions">
          <Button label={tr("+ Agregar compra")} variant="primary" onClick={() => document.getElementById("compras")?.scrollIntoView({ behavior: "smooth" })} />
          <Button label={tr("+ Otro activo")} onClick={() => { openExtra(); setTimeout(() => document.getElementById("otros")?.scrollIntoView({ behavior: "smooth" }), 50); }} />
          <Button label={tr("Importar desde Excel")} onClick={() => setTab("datos")} />
          <Button label={tr("Guardar respaldo")} onClick={() => setTab("datos")} />
          {!hasPort && !isDemo ? <Button label={tr("Ver un ejemplo")} onClick={openDemo} /> : null}
        </div>
        {weekEvents.length > 0 ? (
          <div className="inv-week">
            {weekEvents.map((e) => (
              <div key={`${e.ticker}-${e.date}-${e.title}`} className={`inv-week-card inv-week-${e.kind}`} title={e.detail}>
                <div className="inv-week-date">{e.date === todayIso ? tr("Hoy") : fmtIso(e.date, false)}</div>
                <div className="inv-week-tk">{e.ticker}</div>
                <div className="inv-week-what">{e.title}</div>
              </div>
            ))}
          </div>
        ) : null}
        {warnings.length ? <Callout tone="warning" lead={tr("Cartera concentrada.")}>{warnings.join(" ")}</Callout> : null}
        {computed.unmatched.length ? <Callout tone="danger">{tr("Hay ventas cargadas por más cantidad de la que compraste. Revisá la tabla de ventas.")}</Callout> : null}

        {histAll.length > 1 && histLast ? (
          <Section heading={tr("Cómo viene tu cartera")} actions={
            <Segmented<"all" | "y1" | "m3"> options={[{ value: "all", label: tr("Todo") }, { value: "y1", label: tr("1 año") }, { value: "m3", label: tr("3 meses") }]} value={histRange} onChange={setHistRange} />
          }>
            <MultiLine
              labels={histPts.map((p) => `${Number(p.week.slice(8, 10))} ${monthShort(Number(p.week.slice(5, 7)) - 1)} ${p.week.slice(2, 4)}`)}
              unit="USD"
              format={(v: number) => formatDec(v, 0)}
              series={[
                { name: tr("Tu cartera"), color: "#22c55e", values: histPts.map((p) => p.value) },
                { name: tr("Lo mismo en el S&P 500"), color: "#38bdf8", values: histPts.map((p) => p.bench) },
                { name: tr("Lo que pusiste (dólares guardados)"), color: "#9aa6bf", values: histPts.map((p) => p.invested), dashed: true },
              ]}
            />
            <p className="inv-hint">
              {tr("Hoy tus títulos valen ")}{MONEY(histLast.value)}{tr(" y pusiste ")}{MONEY(histLast.invested)}{tr(" (neto de ventas).")}
              {histLast.bench != null ? tr(" Con las mismas compras y ventas en el S&P 500 tendrías {0}.", MONEY(histLast.bench)) : ""}
              {computed.history.skipped ? tr(" No incluye {0} sin fecha.", computed.history.skipped === 1 ? tr("una compra") : `${computed.history.skipped} compras`) : ""}
              {extras.length ? tr(" No incluye los otros activos.") : ""}
            </p>
          </Section>
        ) : null}

        {okPositions.length || computed.positions.length ? (
          <Section heading={tr("Posiciones")}>
            <Table
              sortable
              columns={[tr("Título"), tr("Mercado"), tr("Cantidad"), tr("Costo"), tr("Valor"), tr("Resultado"), tr("% en pesos"), tr("% en dólares"), tr("Dividendo s/costo"), ""]}
              align={["start", "start", "end", "end", "end", "end", "end", "end", "end", "end"]}
              rows={computed.positions.map((p) => [
                p.ticker,
                p.market,
                qtyText(p.qty),
                money(p.ccy, p.costN),
                p.ok ? money(p.ccy, p.valueN) : tr("Sin cotización"),
                p.ok ? { text: money(p.ccy, p.pnlN), tone: tone(p.pnlN) } : "—",
                p.ok ? { text: PCT(p.pctArs), tone: tone(p.pctArs) } : "—",
                p.ok ? { text: PCT(p.pctUsd), tone: tone(p.pctUsd) } : "—",
                p.yoc > 0 ? YLD(p.yoc) : "—",
                <Button label={tr("Vender")} onClick={() => startSell(p.key)} />,
              ])}
            />
            {sellPos ? (
              <div className="inv-inline">
                <h3>{tr("Vender ")}{sellPos.ticker} ({sellPos.market})</h3>
                <div className="inv-inline-grid">
                  <Input label={tr("Cantidad (tenés {0})", qtyText(sellPos.qty))} value={sQty} onChange={setSQty} placeholder={qtyText(sellPos.qty)} />
                  <Input label={tr("Precio de venta ({0})", curLabel(sellPos.ccy))} value={sPx} onChange={setSPx} placeholder={formatDec(unitOf(sellPos).native)} />
                  <Input label={tr("Fecha de la venta")} value={sDate} onChange={setSDate} placeholder="DD/MM/AAAA" />
                  <Input label={tr("Comisión ({0})", curLabel(sellPos.ccy))} value={sFee} onChange={setSFee} placeholder={tr("Opcional")} />
                </div>
                <div className="inv-row">
                  <Button label={tr("Registrar venta")} variant="primary" onClick={saveSale} />
                  <Button label={tr("Cancelar")} onClick={() => setSellKey(null)} />
                  <span className="inv-hint">{tr("Se descuentan primero las compras más viejas.")}</span>
                </div>
                {sellError ? <Callout tone="danger">{sellError}</Callout> : null}
              </div>
            ) : null}
          </Section>
        ) : null}

        {costValue.length ? (
          <Grid columns={2}>
            <Section heading={tr("Costo y valor, en dólares")} caption={tr("Gris: lo que pagaste, al dólar del día de compra. Color: lo que vale hoy.")}>
              <CostValueBars rows={costValue} total={{ cost: computed.costUsd, value: computed.valueUsd }} />
            </Section>
            <Section heading={tr("Cómo está repartida")} actions={
              <Segmented<"titulo" | "sector" | "pais"> options={[{ value: "titulo", label: tr("Título") }, { value: "sector", label: tr("Sector") }, { value: "pais", label: tr("País") }]} value={allocBy} onChange={setAllocBy} />
            }>
              <Pie parts={pieParts} total={MONEY(computed.valueUsd)} label={tr("Valor")} />
            </Section>
          </Grid>
        ) : null}

        <Section heading={editingId ? tr("Editar compra") : lots.length ? tr("Compras") : tr("Agregar una compra")} id="compras">
          {lotForm}
          {computed.fxToday > 0 ? (
            <Callout tone="warning">
              {computed.fxToday === 1 ? tr("Una compra no tiene fecha") : tr("{0} compras no tienen fecha", computed.fxToday)}{tr(", así que su costo se convierte con el dólar de hoy. Tocá «Editar» para ponerle la fecha.")}
            </Callout>
          ) : null}
          {computed.rows.length ? (
            <Table
              sortable
              columns={[tr("Título"), tr("Mercado"), tr("Cantidad × precio"), tr("Fecha"), tr("Comisión"), tr("Dólar de compra"), tr("Valor"), "%", ""]}
              align={["start", "start", "start", "start", "end", "end", "end", "end", "end"]}
              rows={computed.rows.map((row) => [
                row.lot.ticker,
                row.market,
                `${qtyText(row.lot.qty)} × ${money(row.lot.ccy, row.lot.price)}`,
                row.lot.date ? formatDate(row.lot.date) : "—",
                row.lot.fee ? money(row.lot.ccy, row.lot.fee) : "—",
                row.fxSrc === "hoy" ? { text: `${PESOS(row.fxRate, 2)} (hoy)`, tone: "warning" as const } : PESOS(row.fxRate, 2),
                row.ok ? money(row.lot.ccy, row.valueN) : tr("Sin cotización"),
                row.ok ? { text: PCT(row.pct), tone: tone(row.pct) } : "—",
                <span className="inv-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  <Button label={tr("Editar")} onClick={() => { const full = lots.find((l) => l.id === row.lot.id); if (full) editLot(full); }} />
                  <Button label={tr("Quitar")} onClick={() => removeLot(row.lot.id)} />
                </span>,
              ])}
            />
          ) : null}
        </Section>

        {computed.realized.length ? (
          <Section heading={tr("Ventas")} caption={tr("El resultado compara lo cobrado con lo que habían costado esos títulos, cada uno al dólar de su fecha.")}>
            <Table
              sortable
              columns={[tr("Fecha"), tr("Título"), tr("Cantidad × precio"), tr("Cobrado"), tr("Resultado"), tr("Resultado en dólares"), ""]}
              align={["start", "start", "start", "end", "end", "end", "end"]}
              rows={computed.realized.map((r) => [
                formatDate(r.sale.date),
                r.sale.ticker,
                `${qtyText(r.sale.qty)} × ${money(r.sale.ccy, r.sale.price)}`,
                money(r.sale.ccy, r.proceedsNative),
                { text: `${money(r.sale.ccy, r.proceedsNative - r.costNative)} (${PCT(r.costNative ? (r.proceedsNative / r.costNative - 1) * 100 : 0)})`, tone: tone(r.proceedsNative - r.costNative) },
                { text: `${MONEY(r.pnlUsd)} (${PCT(r.costUsd ? (r.pnlUsd / r.costUsd) * 100 : 0)})`, tone: tone(r.pnlUsd) },
                <Button label={tr("Quitar")} onClick={() => setSales((prev) => prev.filter((s) => s.id !== r.sale.id))} />,
              ])}
              footer={[tr("Total"), "", "", "", "", { text: MONEY(computed.realizedUsd), tone: tone(computed.realizedUsd) }, ""]}
            />
          </Section>
        ) : null}

        {extras.length || xOpen ? (
          <Section heading={tr("Otros activos")} id="otros" caption={tr("Bonos, obligaciones negociables, fondos, efectivo o lo que no tenga cotización acá. El valor de hoy lo actualizás vos.")}>
            {extras.length ? (
              <Table
                columns={[tr("Nombre"), tr("Tipo"), tr("Fecha"), tr("Pusiste"), tr("Vale hoy"), "%", ""]}
                align={["start", "start", "start", "end", "end", "end", "end"]}
                rows={computed.extraRows.map((r) => [
                  tr(r.x.name), tr(r.x.kind), r.x.date ? formatDate(r.x.date) : "—", money(r.x.ccy, r.x.cost), money(r.x.ccy, r.x.value),
                  { text: PCT(r.pct), tone: tone(r.pct) },
                  <span className="inv-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    <Button label={tr("Actualizar")} onClick={() => openExtra(r.x)} />
                    <Button label={tr("Quitar")} onClick={() => setExtras((prev) => prev.filter((e) => e.id !== r.x.id))} />
                  </span>,
                ])}
              />
            ) : null}
            {xOpen ? (
              <div className="inv-inline">
                <h3>{xId ? tr("Actualizar activo") : tr("Agregar otro activo")}</h3>
                <div className="inv-inline-grid">
                  <Input label={tr("Nombre")} value={xName} onChange={setXName} placeholder={tr("Bono AL30")} />
                  <Select label={tr("Tipo")} options={EXTRA_KINDS.map((k) => ({ value: k, label: tr(k) }))} value={xKind} onChange={setXKind} />
                  <Select label={tr("Moneda")} options={[{ value: "USD", label: tr("Dólares") }, { value: "ARS", label: tr("Pesos") }]} value={xCcy} onChange={(v: string) => setXCcy(v === "ARS" ? "ARS" : "USD")} />
                  <Input label={tr("Fecha")} value={xDate} onChange={setXDate} placeholder="DD/MM/AAAA" />
                  <Input label={tr("Lo que pusiste ({0})", xCcy)} value={xCost} onChange={setXCost} placeholder="1.000" />
                  <Input label={tr("Lo que vale hoy ({0})", xCcy)} value={xValue} onChange={setXValue} placeholder="1.100" />
                </div>
                <div className="inv-row">
                  <Button label={xId ? tr("Guardar cambios") : tr("Agregar")} variant="primary" onClick={saveExtra} />
                  <Button label={tr("Cancelar")} onClick={() => { setXOpen(false); setXId(null); }} />
                </div>
                {xError ? <Callout tone="danger">{xError}</Callout> : null}
              </div>
            ) : <Button label={tr("+ Otro activo")} onClick={() => openExtra()} />}
          </Section>
        ) : null}

        {hasPort && !isDemo ? (
          confirmClear ? (
            <div className="inv-row">
              <span>{tr("¿Borrar todas las compras, ventas y otros activos de ")}{pfName}?</span>
              <Button label={tr("Sí, borrar todo")} variant="primary" onClick={() => { setLots([]); setSales([]); setExtras([]); resetForms(); }} />
              <Button label={tr("Cancelar")} onClick={() => setConfirmClear(false)} />
            </div>
          ) : <Button label={tr("Vaciar esta cartera")} onClick={() => setConfirmClear(true)} />
        ) : null}
      </>
      ) : null}

      {tab === "calor" ? (
      <>
        <Section heading={tr("Tu lista")} caption={tr("Estos títulos aparecen acá, en Dividendos y en Noticias. Los que tenés en cartera se agregan solos.")} actions={<Button label={tr("Volver a la lista inicial")} onClick={() => setWatch([...DEFAULT_WATCH])} />}>
          <WatchPicker followed={followed} held={heldTickers} onAdd={addToWatch} onRemove={removeFromWatch} />
        </Section>
        {followed.length > 0 ? (
          <>
            <Section heading={tr("Mapa de calor")} caption={okPositions.length ? tr("El tamaño de cada recuadro sigue el valor de tu posición.") : undefined} actions={
              <Segmented<HeatWindow> options={[{ value: "d", label: tr("Hoy") }, { value: "m1", label: tr("1 mes") }, { value: "m3", label: tr("3 meses") }]} value={heatWin} onChange={setHeatWin} />
            }>
              <HeatTiles items={heatItems} cap={heatCap} />
            </Section>
            <Section heading={tr("Precios")} caption={extKind ? tr("«{0}» es el movimiento fuera del horario de Nueva York, contra el último cierre. Los demás números usan el precio de la rueda normal.", extLabel(extKind)) : undefined}>
              <Table sortable columns={[tr("Título"), "", tr("Precio"), tr("Hoy"), tr("1 mes"), tr("3 meses"), ...(extKind ? [extLabel(extKind)] : [])]} align={["start", "start", "end", "end", "end", "end", "end"]} rows={followed.map((s) => quoteRow(s, heldTickers.has(s), Boolean(extKind)))} />
            </Section>
            <Section heading={tr("Gráfico")} actions={
              <div className="inv-row">
                <Select options={followed.map((s) => ({ value: s, label: `${s} · ${CATALOG[s].name}` }))} value={followed.includes(chartSym) ? chartSym : followed[0]} onChange={setChartSym} />
                <Segmented<"m3" | "y1" | "y5"> options={[{ value: "m3", label: tr("3 meses") }, { value: "y1", label: tr("1 año") }, { value: "y5", label: tr("5 años") }]} value={chartRange} onChange={setChartRange} />
              </div>
            }>
              {chartQ && chartData ? (
                <>
                  <LineChart points={chartData.points} floor={chartData.floor} ceiling={chartData.ceil} unit={quoteCcyOf(chartSym) === "AUD" ? "A$" : "USD"} format={(v: number) => formatDec(v)} labels={[`${chartSym} · ${chartQ.name}`]} />
                  <Properties items={[
                    { label: tr("Hoy"), value: `${quotePx(chartSym, chartQ.low)} a ${pxDec(chartQ.high)}` },
                    { label: tr("52 semanas"), value: `${quotePx(chartSym, chartQ.lo52)} a ${pxDec(chartQ.hi52)}` },
                  ]} />
                </>
              ) : null}
            </Section>
          </>
        ) : null}
      </>
      ) : null}

      {tab === "divs" ? (
      <>
        {hasPort ? (
          <Metrics metrics={[
            { value: MONEY(computed.received.total), label: tr("Ya cobraste (estimado)"), detail: receivedYears.length ? receivedYears.map(([y, v]) => `${y}: ${MONEY(v)}`).join(" · ") : tr("Según tus fechas de compra") },
            { value: MONEY(computed.ttmInc), label: tr("Cobrarías en un año"), detail: tr("Con lo que tenés hoy") },
            { value: computed.costUsd ? YLD((computed.ttmInc / computed.costUsd) * 100) : "—", label: tr("Rendimiento sobre tu costo"), detail: computed.valueUsd ? tr("{0} sobre el valor de hoy", YLD((computed.ttmInc / computed.valueUsd) * 100)) : "" },
          ]} />
        ) : null}
        {followed.length === 0 ? (
          <div className="inv-empty"><strong>{tr("Tu lista está vacía")}</strong>{tr("Agregá títulos en Seguimiento para ver sus dividendos.")}</div>
        ) : (
          <Section heading={tr("Dividendos de tu lista")} caption={tr("Monto por acción de los últimos 12 meses y rendimiento sobre el precio de hoy.")}>
            <Table
              sortable
              columns={[tr("Título"), tr("12 meses"), tr("Rendimiento"), tr("Frecuencia"), tr("Último"), tr("Próximo")]}
              align={["start", "end", "end", "start", "start", "start"]}
              rows={followed.map((s) => {
                const d = DIV[s];
                if (!d || (d.ttm === 0 && !d.lastEx)) return [s, "—", "—", tr("No paga"), "—", "—"];
                const next = [d.nextEx ? `ex ${fmtIso(d.nextEx, false)}` : "", d.nextPay ? tr("pago {0}", fmtIso(d.nextPay, false)) : "", D.notes.divNotes[s] ?? ""].filter(Boolean).join(", ");
                return [s, divAmt(s, d.ttm), d.ttm > 0 ? YLD((d.ttm / CATALOG[s].price) * 100) : "—", freqText(d), d.lastEx ? `${fmtIso(d.lastEx)}, ${d.lastAmt != null ? divAmt(s, d.lastAmt) : ""}` : "—", next || "—"];
              })}
            />
          </Section>
        )}
        <Grid columns={2}>
          <Section heading={tr("Lo que cobrarías en un año")} caption={tr("Con las cantidades de hoy, en dólares y antes de impuestos. Los CEDEARs y las acciones locales cobran según su ratio.")}>
            {computed.ttmInc === 0 ? (
              <p className="inv-hint">{okPositions.length ? tr("Tus posiciones no pagaron dividendos en los últimos 12 meses.") : tr("Cargá compras en Cartera para ver el estimado.")}</p>
            ) : (
              <>
                <Table
                  columns={[tr("Título"), tr("Cantidad"), tr("Por unidad"), tr("Al año"), tr("Sobre tu costo")]}
                  align={["start", "end", "end", "end", "end"]}
                  rows={okPositions.filter((p) => p.ttmInc > 0).map((p) => [p.label, qtyText(p.qty), `USD ${formatDec(p.ttmInc / p.qty, 3)}`, MONEY(p.ttmInc), YLD(p.yoc)])}
                  footer={[tr("Total"), "", "", MONEY(computed.ttmInc), ""]}
                />
                {monthTotal > 0 ? <Section heading={tr("Por mes, en dólares")}><Columns points={monthPoints} /></Section> : null}
              </>
            )}
          </Section>
          <Section heading={tr("Próximos 60 días")} caption={tr("Fechas ex, pagos y resultados de tu lista.")}>
            {calMine.length === 0 ? (
              <p className="inv-hint">{tr("No hay fechas en los próximos 60 días.")}</p>
            ) : (
              <Table columns={[tr("Fecha"), tr("Título"), tr("Qué pasa")]} rows={calMine.map((e) => [e.date === todayIso ? tr("Hoy") : fmtIso(e.date, false), e.ticker, e.title])} />
            )}
            <div className="inv-row">
              <Button label={tr("Agregar dividendos al calendario (.ics)")} onClick={exportCalendar} />
            </div>
            <p className="inv-hint">{calMsg || tr("Baja un archivo con las fechas ex y de pago ya anunciadas de tu lista. Sirve para Google Calendar, Outlook y el calendario del celular.")}</p>
          </Section>
        </Grid>
      </>
      ) : null}

      {tab === "mercado" ? (
      <>
        <Section heading={tr("Dólar")} caption={tr("Cotizaciones de DolarApi, {0}.", fxStamp)}>
          <Metrics metrics={[
            { value: PESOS(D.fx.mep.venta, 1), label: "MEP", detail: tr("Compra {0}", PESOS(D.fx.mep.compra, 1)) },
            ...(D.fx.ccl ? [{ value: PESOS(D.fx.ccl.venta, 1), label: tr("Contado con liquidación"), detail: tr("Compra {0}", PESOS(D.fx.ccl.compra, 1)) }] : []),
            ...(D.fx.oficial ? [{ value: PESOS(D.fx.oficial.venta, 0), label: tr("Oficial"), detail: tr("Compra {0}", PESOS(D.fx.oficial.compra, 0)) }] : []),
            ...(D.fx.blue ? [{ value: PESOS(D.fx.blue.venta, 0), label: tr("Blue"), detail: tr("Compra {0}", PESOS(D.fx.blue.compra, 0)) }] : []),
          ]} />
        </Section>
        <Section heading={tr("Mercados")}>
          <Table
            columns={["", tr("Nivel"), tr("Hoy"), tr("1 mes"), tr("3 meses")]}
            align={["start", "end", "end", "end", "end"]}
            rows={D.indices.map((r) => r.kind === "tasa"
              ? [r.label, idxLevel(r), bp(r.chgAbs), bp(r.m1Abs), bp(r.m3Abs)]
              : [r.label, idxLevel(r), pctCell(r.chg), pctCell(r.m1), pctCell(r.m3)])}
          />
          {D.notes.market ? <Text>{D.notes.market}</Text> : null}
        </Section>
        <Section heading={tr("CEDEARs y acciones locales (BYMA)")} caption={tr("El dólar implícito es el que resulta de comparar el precio en pesos con el de Nueva York: si está por encima del MEP, ese CEDEAR está caro en pesos.")}>
          <Table
            sortable
            filterable
            columns={[tr("Título"), tr("Símbolo"), tr("Tipo"), tr("Ratio"), tr("Precio"), tr("Hoy"), tr("Dólar implícito"), tr("Contra el MEP")]}
            align={["start", "start", "start", "end", "end", "end", "end", "end"]}
            rows={ORDER.filter((s) => BA[s]).map((s) => {
              const b = BA[s]!;
              const imp = b.ratio && CATALOG[s].price ? (b.price * b.ratio) / CATALOG[s].price : null;
              const gap = imp ? (imp / MEP_VENTA - 1) * 100 : null;
              return [
                s, b.symbol, b.kind === "cedear" ? "CEDEAR" : tr("Acción local"),
                b.ratio ? (b.ratio >= 1 ? `${b.ratio}:1` : `1:${Math.round(1 / b.ratio)}`) : "—",
                PESOS(b.price, b.price % 1 === 0 ? 0 : 2), { text: PCT(b.chg), tone: tone(b.chg) },
                imp ? PESOS(imp, 0) : "—", gap != null ? PCT(gap, 1) : "—",
              ];
            })}
          />
        </Section>
      </>
      ) : null}

      {tab === "plazo" ? <DepositCalculator mep={D.fx.mep.venta} todayIso={todayIso} /> : null}

      {tab === "analisis" ? (
        followed.length === 0 ? (
          <div className="inv-empty"><strong>{tr("Tu lista está vacía")}</strong>{tr("Agregá títulos en Seguimiento para ver sus noticias.")}</div>
        ) : (
          <div className="inv-news-grid">
            {followed.map((sym) => {
              const q = CATALOG[sym];
              const note = D.notes.tickers[sym];
              const e = D.earnings[sym];
              return (
                <article key={sym} className={`inv-news-card ${isFlat(q.chg) ? "inv-flat" : q.chg > 0 ? "inv-up" : "inv-down"}`}>
                  <div className="inv-news-head">
                    <h3>{sym} <span>{q.name}</span></h3>
                    <div className="inv-news-px">{quotePx(sym, q.price)} <span className={sgn(q.chg)}>{PCT(q.chg)}</span></div>
                  </div>
                  <p className="inv-hint">{tr("1 mes ")}{PCT(q.m1)}{tr(", 3 meses ")}{PCT(q.m3)}.{e ? tr(" Presenta resultados el {0}{1}.", fmtIso(e.date, false), e.estimate ? " (estimado)" : "") : ""}</p>
                  {note && note.text ? <Text>{note.text}</Text> : null}
                  {note && note.news.length > 0 ? (
                    <ul className="inv-news-list">
                      {note.news.map((n) => (
                        <li key={n.href}>
                          <a href={safeHref(n.href)} target="_blank" rel="noopener noreferrer">{n.title}</a>
                          <small>{[n.site, n.date].filter(Boolean).join(", ")}</small>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="inv-hint">{tr("Sin noticias recientes.")}</p>}
                </article>
              );
            })}
          </div>
        )
      ) : null}

      {tab === "datos" ? (
      <>
        <ExcelImportPanel
          onAppend={(incoming) => { setLots((prev) => appendLots(prev, incoming)); setWatch((w) => ensureWatch(w, incoming)); }}
          onReplace={(incoming) => { setLots(incoming); setSales([]); setWatch((w) => ensureWatch(w, incoming)); }}
        />
        <BackupPanel
          watch={watch}
          lots={lots}
          sales={sales}
          extras={extras}
          lastSavedAt={lastSavedAt}
          mode={mode}
          incoming={syncIn}
          onIncoming={setSyncIn}
          onReplace={(data) => { setWatch(data.watch); setLots(data.lots); setSales(data.sales); setExtras(data.extras); }}
          onMerge={(data) => {
            const m = mergeBackup({ watch, lots }, data);
            setWatch(m.watch);
            setLots(m.lots);
            setSales(mergeById(sales, data.sales));
            setExtras(mergeById(extras, data.extras));
          }}
        />
        <p className="inv-hint">{tr("El respaldo y la importación trabajan sobre la cartera que tenés abierta: ")}{pfName}.</p>
      </>
      ) : null}

      {tab === "info" ? (
      <>
        <Section heading={tr("Tenerla en el celular")}>
          {installEvt ? <Button label={tr("Instalar en este dispositivo")} variant="primary" onClick={() => { installEvt.prompt(); setInstallEvt(null); }} /> : null}
          <ol className="inv-help">
            <li><b>{tr("iPhone o iPad (Safari).")}</b>{tr(" Tocá el botón Compartir (el cuadrado con la flecha) y elegí «Agregar a inicio».")}</li>
            <li><b>{tr("Android (Chrome).")}</b>{tr(" Tocá los tres puntos de arriba a la derecha y elegí «Agregar a la pantalla principal» o «Instalar app».")}</li>
            <li><b>{tr("Computadora (Chrome o Edge).")}</b>{tr(" Tocá el ícono de instalar que aparece a la derecha de la barra de direcciones.")}</li>
          </ol>
          <p className="inv-hint">{tr("Queda con su ícono, se abre a pantalla completa y funciona sin conexión con los últimos precios que haya bajado.")}</p>
        </Section>
        <Section heading={tr("Cómo funciona")}>
          <ol className="inv-help">
            <li><b>{tr("Tus datos son solo tuyos.")}</b>{tr(" Todo se guarda en este navegador y no se manda a ningún lado. Para pasarlo a otro dispositivo, usá «Importar y respaldo».")}</li>
            <li><b>{tr("Cargá cada compra con su fecha.")}</b>{tr(" Así el costo se convierte con el dólar MEP de ese día: el resultado en dólares descuenta la devaluación y el resultado en pesos la incluye. La comisión, si la cargás, se suma al costo.")}</li>
            <li><b>{tr("Elegí dónde compraste.")}</b>{tr(" En pesos se usa el precio del CEDEAR o de la acción local; en Nueva York, el de allá; un CEDEAR en dólares se valúa con su precio en pesos dividido el MEP.")}</li>
            <li><b>{tr("Ventas.")}</b>{tr(" Tocá «Vender» en la posición. Se descuentan primero las compras más viejas y el resultado queda guardado en «Ventas».")}</li>
            <li><b>{tr("Otros activos.")}</b>{tr(" Bonos, fondos o efectivo se cargan con lo que pusiste y lo que valen hoy; ese valor lo actualizás vos.")}</li>
            <li><b>{tr("Varias carteras.")}</b>{tr(" Podés tener una por persona o por broker y cambiar entre ellas arriba de todo en Cartera.")}</li>
            <li><b>{tr("El gráfico de la cartera")}</b>{tr(" compara tus títulos con haber puesto la misma plata, en las mismas fechas, en el S&P 500. Las posiciones en pesos se siguen con el precio de Nueva York.")}</li>
            <li><b>{tr("Los dividendos")}</b>{tr(" son estimados, antes de impuestos: lo que pagó cada título después de tu fecha de compra, por tu cantidad (ajustada por el ratio en los CEDEARs).")}</li>
            <li><b>{tr("Los precios no son en vivo.")}</b>{tr(" Se actualizan cada 30 minutos mientras los mercados están abiertos, con unos 15 minutos de demora.")}</li>
            <li><b>{tr("Los números con punto.")}</b>{tr(" En pesos, «12.350» es doce mil trescientos cincuenta. En dólares, «17.945» es diecisiete con 945.")}</li>
          </ol>
        </Section>
        <Section heading={tr("Código abierto")}>
          <p className="inv-hint">
            {tr("Esta aplicación es software libre con licencia MIT: podés usarla, copiarla y modificarla gratis, sin garantía de ningún tipo. Los precios y las noticias pertenecen a sus fuentes.")}{" "}
            <a className="inv-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">{tr("Ver el código y la licencia")}</a>
          </p>
        </Section>
      </>
      ) : null}

      <Floating edge="bottom" align="end">
        <BackToTop label={tr("Volver arriba")} />
      </Floating>
      </DashShell>
    </Page>
  );
}
