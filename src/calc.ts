// Lógica de la cartera, sin pantalla: ventas (FIFO), resultado realizado, dividendos cobrados
// e historia del valor. Son funciones puras para poder probarlas (scripts/cartera.test.mjs).

export type Ccy = "USD" | "ARS" | "AUD";
/** fx: dólar MEP del día (opcional). fee: comisiones e impuestos, en la moneda de la operación. ced: CEDEAR comprado en dólares. */
export type Lot = { id: string; ticker: string; qty: number; price: number; date: string; ccy: Ccy; fx?: number; fee?: number; ced?: boolean };
export type Sale = { id: string; ticker: string; qty: number; price: number; date: string; ccy: Ccy; fx?: number; fee?: number; ced?: boolean };
/** Activo sin cotización automática (bono, ON, fondo, efectivo...): el valor lo actualiza la persona. */
export type Extra = { id: string; name: string; kind: string; ccy: "USD" | "ARS"; cost: number; value: number; date: string; fx?: number };

export const posKey = (x: { ticker: string; ccy: Ccy; ced?: boolean }): string => `${x.ticker}|${x.ccy}${x.ced ? "|D" : ""}`;

/** Tramo de una compra: cuánto, desde cuándo y (si se vendió) hasta cuándo y a qué precio. */
export type Piece = { lot: Lot; qty: number; fee: number; sale: Sale | null; saleFee: number };

export type SalesResult = { pieces: Piece[]; open: Lot[]; unmatched: { sale: Sale; qty: number }[] };

const EPS = 1e-9;

/**
 * Aplica las ventas a las compras por orden de fecha (primero entrado, primero salido).
 * `open` son las compras con la cantidad que queda (la comisión se reparte en proporción).
 */
export function applySales(lots: Lot[], sales: Sale[]): SalesResult {
  const byDate = <T extends { date: string }>(a: T, b: T) => (a.date || "0000").localeCompare(b.date || "0000");
  const left = new Map<string, number>(lots.map((l) => [l.id, l.qty]));
  const pieces: Piece[] = [];
  const unmatched: { sale: Sale; qty: number }[] = [];
  for (const sale of [...sales].sort(byDate)) {
    let need = sale.qty;
    const candidates = lots.filter((l) => posKey(l) === posKey(sale)).sort(byDate);
    for (const lot of candidates) {
      if (need <= EPS) break;
      const have = left.get(lot.id) ?? 0;
      if (have <= EPS) continue;
      const q = Math.min(have, need);
      left.set(lot.id, have - q);
      need -= q;
      pieces.push({ lot, qty: q, fee: ((lot.fee ?? 0) * q) / lot.qty, sale, saleFee: ((sale.fee ?? 0) * q) / sale.qty });
    }
    if (need > EPS) unmatched.push({ sale, qty: need });
  }
  const open: Lot[] = [];
  for (const lot of lots) {
    const q = left.get(lot.id) ?? 0;
    if (q <= EPS) continue;
    pieces.push({ lot, qty: q, fee: ((lot.fee ?? 0) * q) / lot.qty, sale: null, saleFee: 0 });
    open.push(q === lot.qty ? lot : { ...lot, qty: q, fee: lot.fee ? (lot.fee * q) / lot.qty : undefined });
  }
  return { pieces, open, unmatched };
}

/** Cantidad disponible para vender de una posición. */
export function openQty(lots: Lot[], sales: Sale[], key: string): number {
  return applySales(lots, sales).open.filter((l) => posKey(l) === key).reduce((s, l) => s + l.qty, 0);
}

export type Env = {
  /** Dólar MEP (venta) del día pedido o anterior; null si no hay historia para esa fecha. */
  mepOn: (iso: string) => number | null;
  mepToday: number;
  audusd: number;
};

/** Dólar con el que se convierte una operación. */
export function fxOf(x: { date: string; fx?: number }, env: Env): number {
  if (x.fx && x.fx > 0) return x.fx;
  return (x.date ? env.mepOn(x.date) : null) ?? env.mepToday;
}

/** Importe de una operación en USD y en ARS (precio × cantidad ± comisión), con el dólar de su fecha. */
function amounts(native: number, ccy: Ccy, x: { date: string; fx?: number }, env: Env): { usd: number; ars: number } {
  const fx = fxOf(x, env);
  if (ccy === "ARS") return { usd: native / fx, ars: native };
  const usd = ccy === "AUD" ? native * env.audusd : native;
  return { usd, ars: usd * fx };
}

export type Realized = { sale: Sale; qty: number; costUsd: number; proceedsUsd: number; pnlUsd: number; costArs: number; proceedsArs: number; pnlArs: number; costNative: number; proceedsNative: number };

/** Resultado de cada venta (sumando los tramos de compra que consumió). */
export function realizedBySale(pieces: Piece[], env: Env): Realized[] {
  const out = new Map<string, Realized>();
  for (const p of pieces) {
    if (!p.sale) continue;
    const costNative = p.qty * p.lot.price + p.fee;
    const proceedsNative = p.qty * p.sale.price - p.saleFee;
    const c = amounts(costNative, p.lot.ccy, p.lot, env);
    const r = amounts(proceedsNative, p.sale.ccy, p.sale, env);
    const prev = out.get(p.sale.id) ?? { sale: p.sale, qty: 0, costUsd: 0, proceedsUsd: 0, pnlUsd: 0, costArs: 0, proceedsArs: 0, pnlArs: 0, costNative: 0, proceedsNative: 0 };
    prev.qty += p.qty;
    prev.costUsd += c.usd;
    prev.proceedsUsd += r.usd;
    prev.costArs += c.ars;
    prev.proceedsArs += r.ars;
    prev.costNative += costNative;
    prev.proceedsNative += proceedsNative;
    prev.pnlUsd = prev.proceedsUsd - prev.costUsd;
    prev.pnlArs = prev.proceedsArs - prev.costArs;
    out.set(p.sale.id, prev);
  }
  return Array.from(out.values()).sort((a, b) => (b.sale.date || "").localeCompare(a.sale.date || ""));
}

export type DivInfo = {
  /** [fecha ex, monto por acción de Nueva York o de ASX] */
  hist: (ticker: string) => [string, number][];
  /** CEDEARs (o acciones locales) por cada acción de Nueva York; null si no se conoce. */
  ratio: (ticker: string) => number | null;
  /** Moneda en la que paga el título. */
  payCcy: (ticker: string) => "USD" | "AUD";
};

/** Dividendo en USD por unidad tenida (acción, CEDEAR o acción local). null si falta el ratio. */
export function divFactor(x: { ticker: string; ccy: Ccy; ced?: boolean }, info: DivInfo, env: Env): number | null {
  const toUsd = info.payCcy(x.ticker) === "AUD" ? env.audusd : 1;
  if (x.ccy === "ARS" || x.ced) {
    const r = info.ratio(x.ticker);
    return r ? toUsd / r : null;
  }
  return toUsd;
}

export type Received = { total: number; byTicker: Record<string, number>; byYear: Record<string, number>; undated: number };

/**
 * Dividendos que habría cobrado cada tramo según sus fechas: los que tienen fecha ex posterior
 * a la compra y, si se vendió, no posterior a la venta. Bruto, en USD. Las compras sin fecha no cuentan.
 */
export function receivedDividends(pieces: Piece[], info: DivInfo, env: Env): Received {
  const out: Received = { total: 0, byTicker: {}, byYear: {}, undated: 0 };
  for (const p of pieces) {
    if (!p.lot.date) {
      if (!p.sale) out.undated += 1;
      continue;
    }
    const f = divFactor(p.lot, info, env);
    if (f == null) continue;
    for (const [ex, amt] of info.hist(p.lot.ticker)) {
      if (ex <= p.lot.date) continue;
      if (p.sale && p.sale.date && ex > p.sale.date) continue;
      const usd = p.qty * amt * f;
      out.total += usd;
      out.byTicker[p.lot.ticker] = (out.byTicker[p.lot.ticker] ?? 0) + usd;
      out.byYear[ex.slice(0, 4)] = (out.byYear[ex.slice(0, 4)] ?? 0) + usd;
    }
  }
  return out;
}

export type HistInput = {
  weeks: string[];
  /** Cierres semanales en la moneda del título (USD o AUD), alineados a weeks. */
  series: (ticker: string) => (number | null)[] | null;
  /** Valor de hoy en USD de una unidad de la posición (acción, CEDEAR...). */
  unitUsdToday: (x: { ticker: string; ccy: Ccy; ced?: boolean }) => number | null;
  /** Ticker de referencia (S&P 500). */
  benchmark: string;
};

export type HistPoint = { week: string; value: number; invested: number; bench: number | null };

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Valor semanal de la cartera en USD desde la primera compra con fecha, junto con lo invertido
 * (neto de ventas) y cuánto valdría lo mismo puesto en el índice de referencia en las mismas fechas.
 * Las posiciones en pesos se siguen con el precio de Nueva York, ancladas a su valor de hoy.
 */
export function portfolioHistory(pieces: Piece[], h: HistInput, env: Env): { points: HistPoint[]; skipped: number } {
  const dated = pieces.filter((p) => p.lot.date);
  const skipped = pieces.filter((p) => !p.lot.date && !p.sale).length;
  if (!dated.length || !h.weeks.length) return { points: [], skipped };
  const first = dated.reduce((m, p) => (p.lot.date < m ? p.lot.date : m), dated[0].lot.date);
  const bench = h.series(h.benchmark);
  const n = h.weeks.length;
  const prep = dated.map((p) => {
    const s = h.series(p.lot.ticker);
    const today = h.unitUsdToday(p.lot);
    const lastClose = s ? s[n - 1] : null;
    const cost = amounts(p.qty * p.lot.price + p.fee, p.lot.ccy, p.lot, env).usd;
    const proceeds = p.sale ? amounts(p.qty * p.sale.price - p.saleFee, p.sale.ccy, p.sale, env).usd : 0;
    return { p, s, scale: s && today != null && lastClose ? today / lastClose : null, cost, proceeds, today };
  });
  const points: HistPoint[] = [];
  let units = 0;
  // Plata que entró antes de que haya precio de la referencia: se convierte cuando aparece.
  let pending = 0;
  const done = new Set<string>();
  for (let i = 0; i < n; i++) {
    const end = addDays(h.weeks[i], 6);
    if (end < first) continue;
    let value = 0;
    let invested = 0;
    const b = bench ? bench[i] : null;
    for (const x of prep) {
      const buyKey = `b${x.p.lot.id}|${x.p.sale?.id ?? ""}`;
      const sellKey = `s${x.p.lot.id}|${x.p.sale?.id ?? ""}`;
      const bought = x.p.lot.date <= end;
      const sold = Boolean(x.p.sale && (x.p.sale.date || "9999") <= end);
      if (bought && !done.has(buyKey)) {
        done.add(buyKey);
        if (b) units += x.cost / b; else pending += x.cost;
      }
      if (sold && !done.has(sellKey)) {
        done.add(sellKey);
        if (b) units -= x.proceeds / b; else pending -= x.proceeds;
      }
      if (bought) invested += x.cost;
      if (sold) invested -= x.proceeds;
      if (bought && !sold) {
        const close = x.s ? x.s[i] : null;
        // Sin serie para esa semana: se usa el costo, para no dibujar un salto falso.
        value += close != null && x.scale != null ? x.p.qty * close * x.scale : x.cost;
      }
    }
    if (b && pending) { units += pending / b; pending = 0; }
    points.push({ week: h.weeks[i], value, invested, bench: b ? units * b : null });
  }
  return { points, skipped };
}

/** Agrupa valores por una etiqueta y devuelve las partes ordenadas, con su porcentaje. */
export function allocation(items: { label: string; value: number }[]): { label: string; value: number; pct: number }[] {
  const total = items.reduce((s, x) => s + Math.max(0, x.value), 0);
  const m = new Map<string, number>();
  for (const x of items) if (x.value > 0) m.set(x.label, (m.get(x.label) ?? 0) + x.value);
  return Array.from(m.entries())
    .map(([label, value]) => ({ label, value, pct: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

// ── Plazo fijo y certificado de depósito ────────────────────────────────────

export type DepositInput =
  /** Plazo fijo argentino: tasa nominal anual (TNA), interés simple por los días del plazo. */
  | { kind: "pf"; amount: number; rate: number; days: number; renewals?: number }
  /** Certificado de depósito (CD): rendimiento anual efectivo (APY), interés compuesto. */
  | { kind: "cd"; amount: number; rate: number; months: number };

export type DepositResult = {
  /** Lo que cobrás al final: capital más intereses. */
  final: number;
  interest: number;
  /** Rendimiento de todo el período, en %. */
  periodPct: number;
  /** Tasa efectiva anual, en %. */
  tea: number;
  /** Tasa efectiva cada 30 días, en %. */
  tem: number;
  /** Días totales, contando las renovaciones. */
  days: number;
};

/** rate va en % anual (por ejemplo 32.5). En el plazo fijo, renewals renueva capital más intereses. */
export function depositResult(d: DepositInput): DepositResult | null {
  if (!(d.amount > 0) || !(d.rate >= 0)) return null;
  const r = d.rate / 100;
  if (d.kind === "pf") {
    const n = Math.max(0, Math.floor(d.renewals ?? 0)) + 1;
    if (!(d.days > 0)) return null;
    const per = 1 + (r * d.days) / 365;
    const final = d.amount * per ** n;
    return { final, interest: final - d.amount, periodPct: (per ** n - 1) * 100, tea: (per ** (365 / d.days) - 1) * 100, tem: (per ** (30 / d.days) - 1) * 100, days: d.days * n };
  }
  if (!(d.months > 0)) return null;
  const final = d.amount * (1 + r) ** (d.months / 12);
  return { final, interest: final - d.amount, periodPct: (final / d.amount - 1) * 100, tea: d.rate, tem: ((1 + r) ** (30 / 365) - 1) * 100, days: Math.round((d.months * 365) / 12) };
}
