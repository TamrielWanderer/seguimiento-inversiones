// Cálculos puros (sin red) a partir de las series diarias de Yahoo.
// Todas las variaciones salen de la misma serie de cierres, así que el % de 1 mes
// siempre coincide con el gráfico.

const DAY = 86400000;

/** Fecha ISO (AAAA-MM-DD) de un instante, en la zona horaria del mercado. */
export function isoInTz(date, tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const round = (n, d = 4) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const pctChange = (now, ref) => (ref ? round((now / ref - 1) * 100, 2) : null);

/** Barras válidas (con cierre) ordenadas por fecha, con la fecha ISO del mercado. */
export function cleanBars(quotes, tz) {
  return (quotes || [])
    .filter((q) => q && q.close != null && Number.isFinite(q.close) && q.date)
    .map((q) => ({ ...q, date: new Date(q.date), iso: isoInTz(new Date(q.date), tz) }))
    .sort((a, b) => a.date - b.date)
    // Yahoo a veces repite la última barra (intradía + cierre): nos quedamos con la última de cada día
    .filter((q, i, arr) => i === arr.length - 1 || arr[i + 1].iso !== q.iso);
}

/** Cierre de la última barra con fecha <= ISO pedida. */
function closeOnOrBefore(bars, iso) {
  let ref = null;
  for (const b of bars) {
    if (b.iso <= iso) ref = b;
    else break;
  }
  return ref ? ref.close : null;
}

function isoMinusDays(iso, days) {
  return new Date(Date.parse(`${iso}T12:00:00Z`) - days * DAY).toISOString().slice(0, 10);
}

/** Puntos semanales de los últimos ~3 meses (último cierre de cada semana + el último dato). */
export function weeklyPoints(bars, lastIso) {
  const from = isoMinusDays(lastIso, 91);
  const recent = bars.filter((b) => b.iso >= from);
  const byWeek = new Map();
  for (const b of recent) {
    const d = new Date(`${b.iso}T12:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
    byWeek.set(monday, b);
  }
  const pts = Array.from(byWeek.values()).map((b) => ({ d: b.iso, v: round(b.close, 4) }));
  return pts;
}

/** Fila de cotización para el catálogo, a partir del resultado de chart(). */
export function quoteFromChart(chart, { name, ccy } = {}) {
  const tz = chart?.meta?.exchangeTimezoneName;
  const bars = cleanBars(chart?.quotes, tz);
  if (bars.length < 2) throw new Error("serie sin datos suficientes");
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const price = last.close;
  const dayChg = price - prev.close;
  const yearFrom = isoMinusDays(last.iso, 365);
  const year = bars.filter((b) => b.iso > yearFrom);
  const highs = year.map((b) => b.high ?? b.close).filter(Number.isFinite);
  const lows = year.map((b) => b.low ?? b.close).filter(Number.isFinite);
  const row = {
    name,
    price: round(price),
    chg: pctChange(price, prev.close),
    dayChg: round(dayChg),
    open: round(last.open ?? price),
    high: round(last.high ?? price),
    low: round(last.low ?? price),
    hi52: round(Math.max(...highs, price)),
    lo52: round(Math.min(...lows, price)),
    m1: pctChange(price, closeOnOrBefore(bars, isoMinusDays(last.iso, 30))),
    m3: pctChange(price, closeOnOrBefore(bars, isoMinusDays(last.iso, 91))),
    pts: weeklyPoints(bars, last.iso),
    asOf: last.iso,
  };
  if (ccy === "AUD") row.ccy = "AUD";
  return { row, bars, tz };
}

/** Dividendos: TTM, cantidad de pagos, último y la historia de 24 meses (por fecha ex). */
export function dividendsFromChart(chart, lastIso, tz) {
  const evs = (chart?.events?.dividends || [])
    .filter((e) => e && Number.isFinite(e.amount) && e.date)
    .map((e) => ({ iso: isoInTz(new Date(e.date), tz), amount: e.amount }))
    .sort((a, b) => a.iso.localeCompare(b.iso));
  const from12 = isoMinusDays(lastIso, 365);
  const from24 = isoMinusDays(lastIso, 730);
  const last12 = evs.filter((e) => e.iso > from12 && e.iso <= lastIso);
  const last = evs.filter((e) => e.iso <= lastIso).at(-1) ?? null;
  return {
    ttm: round(last12.reduce((s, e) => s + e.amount, 0), 4),
    n12: last12.length,
    lastEx: last ? last.iso : null,
    lastAmt: last ? round(last.amount, 6) : null,
    lastPay: null,
    nextEx: null,
    nextPay: null,
    hist: evs.filter((e) => e.iso > from24 && e.iso <= lastIso).map((e) => [e.iso, round(e.amount, 6)]),
  };
}

/** Completa fechas de pago / próximas fechas y resultados con calendarEvents de quoteSummary. */
export function applyCalendarEvents(div, cal, todayIso) {
  const out = { div: div ? { ...div } : null, earnings: null };
  if (!cal) return out;
  const utcIso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
  const ex = utcIso(cal.exDividendDate);
  const pay = utcIso(cal.dividendDate);
  if (out.div) {
    if (ex && ex > todayIso) out.div.nextEx = ex;
    if (pay && pay > todayIso) out.div.nextPay = pay;
    else if (pay && out.div.lastEx && pay >= out.div.lastEx) out.div.lastPay = pay;
  }
  const dates = (cal.earnings?.earningsDate || []).map(utcIso).filter(Boolean).sort();
  const next = dates.find((d) => d >= todayIso);
  if (next) out.earnings = { date: next, estimate: Boolean(cal.earnings?.isEarningsDateEstimate) };
  return out;
}

/** Fila para índices / tasas / futuros / tipos de cambio. */
export function indexFromChart(chart, def) {
  const { row } = quoteFromChart(chart, { name: def.nombre });
  const bars = cleanBars(chart.quotes, chart.meta?.exchangeTimezoneName);
  const prev = bars[bars.length - 2].close;
  const ref1 = closeOnOrBefore(bars, isoMinusDays(row.asOf, 30));
  const ref3 = closeOnOrBefore(bars, isoMinusDays(row.asOf, 91));
  return {
    id: def.id,
    label: def.nombre,
    kind: def.tipo,
    level: row.price,
    chg: row.chg,
    // Para la tasa del Tesoro la variación útil es en puntos básicos
    chgAbs: def.tipo === "tasa" ? round(row.price - prev, 4) : null,
    m1: row.m1,
    m3: row.m3,
    m1Abs: def.tipo === "tasa" && ref1 != null ? round(row.price - ref1, 4) : null,
    m3Abs: def.tipo === "tasa" && ref3 != null ? round(row.price - ref3, 4) : null,
    asOf: row.asOf,
  };
}

/** Dólares de DolarApi (/v1/dolares). */
export function fxFromDolarApi(list) {
  const pick = (casa) => {
    const r = (list || []).find((x) => x.casa === casa);
    return r && Number.isFinite(r.venta) ? { compra: r.compra, venta: r.venta, at: r.fechaActualizacion } : null;
  };
  const mep = pick("bolsa");
  if (!mep) throw new Error("DolarApi no devolvió el MEP (casa bolsa)");
  const ccl = pick("contadoconliqui");
  const strip = (x) => (x ? { compra: x.compra, venta: x.venta } : null);
  return { mep: strip(mep), ccl: strip(ccl), oficial: strip(pick("oficial")), blue: strip(pick("blue")), at: mep.at };
}

/** Historia del MEP (ArgentinaDatos) como [[AAAA-MM-DD, venta], ...] desde la fecha pedida. */
export function mepHistory(rows, desde, today) {
  const byDate = new Map();
  for (const r of rows || []) {
    if (!r || typeof r.fecha !== "string" || !Number.isFinite(r.venta)) continue;
    const d = r.fecha.slice(0, 10);
    if (d >= desde) byDate.set(d, round(r.venta, 2));
  }
  // El dato de hoy de DolarApi es el más reciente: reemplaza al que tenga la historia para hoy.
  if (today && today.venta && today.iso) byDate.set(today.iso, today.venta);
  const all = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  // Para que la página no pese de más: diario en los últimos 3 años, semanal (último dato de cada semana) antes.
  const ref = today?.iso || all.at(-1)?.[0];
  if (!ref) return all;
  const dailyFrom = `${Number(ref.slice(0, 4)) - 3}${ref.slice(4)}`;
  const weekOf = (iso) => {
    const d = new Date(`${iso}T12:00:00Z`);
    return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
  };
  return all.filter(([d], i) => d >= dailyFrom || i === all.length - 1 || all[i + 1][0] >= dailyFrom || weekOf(all[i + 1][0]) !== weekOf(d));
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Titulares de Yahoo (search) -> [{ title, site, date, href, iso }], los más nuevos primero. */
export function newsFromSearch(res, { maxAgeDays = 21, now = new Date(), max = 4, ticker, keywords } = {}) {
  const from = now.getTime() - maxAgeDays * DAY;
  const norm = (x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'").toLowerCase();
  const base = ticker ? ticker.replace(/\.[A-Z]+$/, "") : "";
  const kws = (keywords || []).map(norm).filter((k) => k.length >= 3);
  const mentions = (title) => {
    if (!ticker && !kws.length) return true;
    if (base && new RegExp(`(^|[^A-Za-z])${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z]|$)`).test(title)) return true;
    const t = norm(title);
    return kws.some((k) => t.includes(k));
  };
  return (res?.news || [])
    .filter((n) => n && typeof n.title === "string" && /^https:\/\//.test(n.link || "") && n.providerPublishTime)
    .filter((n) => mentions(n.title))
    .map((n) => ({ t: new Date(n.providerPublishTime), n }))
    .filter(({ t }) => t.getTime() >= from)
    .sort((a, b) => b.t - a.t)
    .slice(0, max)
    .map(({ t, n }) => {
      const iso = isoInTz(t, "America/Buenos_Aires");
      return { title: n.title.trim(), site: n.publisher || "Yahoo Finance", date: `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`, href: n.link, iso };
    });
}

/** Palabras para reconocer titulares de un título: las de noticiasClave o la primera del nombre. */
export function newsKeywords(t) {
  if (Array.isArray(t.noticiasClave) && t.noticiasClave.length) return t.noticiasClave;
  const first = String(t.nombre || "").replace(/\(.*?\)/g, " ").replace(/['’]s\b/g, "").split(/[^\p{L}\p{N}&-]+/u).find((w) => w.length >= 4);
  return first ? [first] : [];
}

/** Cotización BYMA: con la serie si alcanza; si no, con el último precio que informa Yahoo. */
export function baQuoteFromChart(chart) {
  try {
    return quoteFromChart(chart, {}).row;
  } catch (e) {
    const m = chart?.meta || {};
    const price = m.regularMarketPrice;
    if (!Number.isFinite(price)) throw e;
    const prev = Number.isFinite(m.previousClose) ? m.previousClose : null;
    const asOf = m.regularMarketTime ? isoInTz(new Date(m.regularMarketTime), m.exchangeTimezoneName || "America/Argentina/Buenos_Aires") : null;
    return { price, chg: prev ? round((price / prev - 1) * 100, 2) : 0, dayChg: prev ? round(price - prev) : 0, asOf };
  }
}
