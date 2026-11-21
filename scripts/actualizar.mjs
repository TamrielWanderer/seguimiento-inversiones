// Baja cotizaciones, dividendos, resultados y dólar, y escribe datos/mercado.json.
// Después arma los datos de la página (scripts/armar.mjs).
//
//   npm run actualizar                 -> datos reales (Yahoo Finance, DolarApi, ArgentinaDatos)
//   node scripts/actualizar.mjs --muestra carpeta   -> usa respuestas guardadas (para probar sin red)
//
// Si un título falla, se conserva su último dato (con su fecha) y se anota en "errors".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { armar, FILES, readJson } from "./armar.mjs";
import { quoteFromChart, dividendsFromChart, applyCalendarEvents, indexFromChart, fxFromDolarApi, mepHistory, isoInTz, newsFromSearch, newsKeywords, baQuoteFromChart, isAmbiguousTicker, weekAxis, weeklySeries, mergeDivHist, impliedRatio } from "./calculos.mjs";

const DAY = 86400000;
const args = process.argv.slice(2);
const muestraIdx = args.indexOf("--muestra");
const MUESTRA = muestraIdx >= 0 ? path.resolve(args[muestraIdx + 1]) : null;

async function realSources() {
  const { default: YahooFinance } = await import("yahoo-finance2");
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const getJson = async (url) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "seguimiento-inversiones/2" } });
      if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  };
  return {
    chart: (sym, days = 400) => yf.chart(sym, { period1: new Date(Date.now() - days * DAY), interval: "1d", events: "div" }),
    calendar: async (sym) => (await yf.quoteSummary(sym, { modules: ["calendarEvents"] })).calendarEvents ?? null,
    news: (sym) => yf.search(sym, { quotesCount: 0, newsCount: 20 }),
    dolares: () => getJson("https://dolarapi.com/v1/dolares"),
    mepHist: () => getJson("https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa"),
  };
}

/** Fuente de prueba: lee archivos JSON guardados con el mismo formato que devuelve yahoo-finance2. */
function sampleSources(dir) {
  const file = (name) => path.join(dir, name.replace(/[^A-Za-z0-9._=-]/g, "_") + ".json");
  const load = (name) => {
    const f = file(name);
    if (!fs.existsSync(f)) throw new Error(`sin muestra para ${name}`);
    return JSON.parse(fs.readFileSync(f, "utf8"), (k, v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && ["date", "exDividendDate", "dividendDate", "regularMarketTime"].includes(k) ? new Date(v) : v));
  };
  const cal = (o) => {
    if (!o) return null;
    if (o.earnings?.earningsDate) o.earnings.earningsDate = o.earnings.earningsDate.map((d) => new Date(d));
    return o;
  };
  return {
    chart: async (sym) => load(`chart_${sym}`),
    calendar: async (sym) => cal(load(`cal_${sym}`)),
    news: async (sym) => {
      const r = load(`news_${sym}`);
      for (const n of r.news || []) n.providerPublishTime = new Date(n.providerPublishTime);
      return r;
    },
    dolares: async () => load("dolares"),
    mepHist: async () => load("mep_hist"),
  };
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

const NOT_COMPANY = /-USD$|^(SPY|QQQ|DIA|IWM|VTI|VOO|VT|IAU|GLD|SLV|SCHR|SCHP|TIP|TLT|IEF|SHY|SGOV|BND|AGG|LQD|HYG|VNQ|VWO|ARGT|EWZ|USO|XLU|GDX|SMH|ARKK|IBIT|IEMG|IOZ\.AX|VAS\.AX)$/;

export async function actualizar({ src, catalogo, prev, now = new Date(), log = console.log, rapido = false }) {
  const todayBA = isoInTz(now, "America/Buenos_Aires");
  const errors = [];
  const fail = (what, e) => errors.push(`${what}: ${e?.message || e}`);

  // 1) Títulos (NY y ASX). La corrida completa baja 5 años para la historia semanal.
  const days = rapido ? 400 : 1900;
  const weeks = weekAxis(todayBA);
  const series = {};
  const prevHist = prev.hist?.weeks ? prev.hist : null;
  const catalog = {};
  const div = {};
  const earnings = {};
  await pool(catalogo.titulos, 4, async (t) => {
    try {
      const chart = await src.chart(t.yahoo || t.ticker, days);
      const { row, tz, bars } = quoteFromChart(chart, { name: t.nombre, ccy: t.moneda });
      catalog[t.ticker] = row;
      const old = prevHist?.series?.[t.ticker];
      series[t.ticker] = weeklySeries(weeks, bars, rapido && old ? { weeks: prevHist.weeks, values: old } : null);
      let d = dividendsFromChart(chart, row.asOf, tz);
      if (rapido) d.hist = mergeDivHist(prev.div?.[t.ticker]?.hist, d.hist, new Date(now.getTime() - 1830 * DAY).toISOString().slice(0, 10));
      if (rapido) {
        // Actualización rápida: solo precios. Fechas de dividendos y resultados quedan las de la última completa.
        const oldDiv = prev.div?.[t.ticker];
        if (oldDiv) {
          if (oldDiv.nextEx > todayBA) d.nextEx = oldDiv.nextEx;
          if (oldDiv.nextPay > todayBA) d.nextPay = oldDiv.nextPay;
          d.lastPay = oldDiv.lastPay ?? null;
        }
        if (prev.earnings?.[t.ticker]?.date >= todayBA) earnings[t.ticker] = prev.earnings[t.ticker];
      } else if (!NOT_COMPANY.test(t.ticker) || d.n12 > 0) {
        try {
          const cal = await src.calendar(t.yahoo || t.ticker);
          const r = applyCalendarEvents(d, cal, todayBA);
          d = r.div;
          if (r.earnings && !NOT_COMPANY.test(t.ticker)) earnings[t.ticker] = r.earnings;
        } catch (e) {
          // calendarEvents es opcional: sin él no hay fechas de pago ni de resultados
          if (prev.earnings?.[t.ticker]?.date >= todayBA) earnings[t.ticker] = prev.earnings[t.ticker];
        }
      }
      div[t.ticker] = d;
    } catch (e) {
      fail(t.ticker, e);
      if (prev.catalog?.[t.ticker]) catalog[t.ticker] = prev.catalog[t.ticker];
      if (prevHist?.series?.[t.ticker]) series[t.ticker] = weeklySeries(weeks, [], { weeks: prevHist.weeks, values: prevHist.series[t.ticker] });
      if (prev.div?.[t.ticker]) div[t.ticker] = prev.div[t.ticker];
      if (prev.earnings?.[t.ticker]?.date >= todayBA) earnings[t.ticker] = prev.earnings[t.ticker];
    }
  });

  // 2) BYMA (.BA)
  const ba = {};
  await pool(catalogo.titulos.filter((t) => t.byma), 4, async (t) => {
    try {
      const row = baQuoteFromChart(await src.chart(t.byma.simbolo));
      ba[t.ticker] = { symbol: t.byma.simbolo, name: t.byma.nombre, kind: t.byma.tipo, price: row.price, chg: row.chg, dayChg: row.dayChg, asOf: row.asOf };
    } catch (e) {
      fail(t.byma.simbolo, e);
      if (prev.ba?.[t.ticker]) ba[t.ticker] = prev.ba[t.ticker];
    }
  });

  // 3) Índices, tasa, futuros, AUD/USD
  const indices = [];
  for (const def of catalogo.indices) {
    try {
      indices.push(indexFromChart(await src.chart(def.yahoo), def));
    } catch (e) {
      fail(def.yahoo, e);
      const old = prev.indices?.find((x) => x.id === def.id);
      if (old) indices.push(old);
    }
  }

  // 4) Titulares de Yahoo para los títulos de "investigarSiempre" (y los que se movieron 4 % o más)
  const news = {};
  const bigMovers = Object.entries(catalog).filter(([, r]) => Math.abs(r.chg ?? 0) >= 4).map(([s]) => s);
  const newsFor = Array.from(new Set([...(catalogo.investigarSiempre || catalogo.seguidosPorDefecto || []), ...bigMovers])).filter((s) => catalog[s]);
  if (rapido) Object.assign(news, prev.news || {});
  await pool(rapido ? [] : newsFor, 3, async (sym) => {
    try {
      const def = catalogo.titulos.find((x) => x.ticker === sym) || {};
      const kws = newsKeywords(def);
      const strict = isAmbiguousTicker(sym, def);
      // Para tickers ambiguos se busca por el nombre de la empresa, no por la sigla.
      const items = newsFromSearch(await src.news(strict && kws[0] ? kws[0] : sym), { now, ticker: sym, keywords: kws, strictTicker: strict });
      if (items.length) news[sym] = items;
    } catch (e) {
      // sin titulares nuevos: se conservan los anteriores que todavía sean recientes
      const old = (prev.news?.[sym] || []).filter((n) => n.iso && Date.parse(n.iso) >= now.getTime() - 21 * DAY);
      if (old.length) news[sym] = old;
    }
  });

  // 5) Dólar
  let fx = prev.fx;
  let fxAt = prev.sessions?.fx;
  try {
    const f = fxFromDolarApi(await src.dolares());
    const aud = indices.find((x) => x.id === "audusd");
    fx = { mep: f.mep, ccl: f.ccl, oficial: f.oficial, blue: f.blue, audusd: aud?.level ?? prev.fx?.audusd, audusdChg: aud?.chg ?? prev.fx?.audusdChg };
    fxAt = f.at ? new Date(f.at).toISOString() : now.toISOString();
  } catch (e) {
    fail("DolarApi", e);
  }
  let mepHist = prev.mepHist || [];
  try {
    if (rapido && mepHist.length) {
      mepHist = mepHist.filter(([d]) => d !== todayBA);
      if (fx?.mep?.venta) mepHist.push([todayBA, fx.mep.venta]);
    } else {
      mepHist = mepHistory(await src.mepHist(), catalogo.mepDesde || "2019-01-01", { iso: todayBA, venta: fx?.mep?.venta });
    }
  } catch (e) {
    fail("Historia del MEP", e);
  }

  // Control de ratios: si el precio deja de coincidir con el ratio cargado, puede haber cambiado.
  for (const t of catalogo.titulos) {
    const r = t.byma?.ratio;
    const b = ba[t.ticker];
    const imp = impliedRatio(catalog[t.ticker]?.price, fx?.ccl?.venta, b?.price);
    if (r && imp && b.asOf >= new Date(now.getTime() - 5 * DAY).toISOString().slice(0, 10) && Math.abs(imp / r - 1) > 0.15) {
      errors.push(`Aviso: el ratio de ${t.byma.simbolo} (${r}) no coincide con los precios (da ${imp.toFixed(2)}). Revisalo en datos/catalogo.json.`);
    }
  }

  const asOfOf = (sym) => catalog[sym]?.asOf;
  const idxAsOf = (id) => indices.find((x) => x.id === id)?.asOf;
  const baDates = Object.values(ba).map((b) => b.asOf).filter(Boolean).sort();
  const mercado = {
    v: 2,
    generatedAt: now.toISOString(),
    sessions: {
      ny: idxAsOf("spx") || asOfOf("SPY") || prev.sessions?.ny,
      asx: idxAsOf("asx") || prev.sessions?.asx,
      ba: baDates.at(-1) || prev.sessions?.ba,
      fx: fxAt,
    },
    fx,
    mepHist,
    catalog,
    ba,
    div,
    earnings,
    indices,
    news,
    hist: { weeks, series },
    errors,
  };
  const total = catalogo.titulos.length;
  const failed = catalogo.titulos.filter((t) => errors.some((e) => e.startsWith(`${t.ticker}:`))).length;
  log(`Títulos: ${total - failed}/${total} actualizados. BYMA: ${Object.keys(ba).length}. Noticias: ${Object.keys(news).length} títulos. Errores: ${errors.length}.`);
  return { mercado, failed };
}

/**
 * Corre la actualización completa. No corta el proceso: devuelve qué pasó.
 * saved=false si fallaron más de la mitad de los títulos (no se pisa mercado.json).
 */
export async function runActualizar({ muestra = MUESTRA, ahora = null, log = console.log, rapido = args.includes("--rapido") } = {}) {
  const catalogo = readJson(FILES.catalogo);
  const prev = fs.existsSync(FILES.mercado) ? readJson(FILES.mercado) : {};
  const src = muestra ? sampleSources(muestra) : await realSources();
  const now = ahora ? new Date(ahora) : new Date();
  const { mercado, failed } = await actualizar({ src, catalogo, prev, now, log, rapido });
  for (const e of mercado.errors.slice(0, 20)) log(`  error: ${e}`);
  const total = catalogo.titulos.length;
  if (failed > total / 2) {
    log(`Fallaron ${failed} de ${total} títulos: no guardo los precios (¿Yahoo bloqueó el pedido?). Quedan los de la última actualización.`);
    return { saved: false, failed, total, errors: mercado.errors, prevGeneratedAt: prev.generatedAt ?? null };
  }
  fs.writeFileSync(FILES.mercado, JSON.stringify(mercado, null, 1) + "\n");
  armar({ log });
  return { saved: true, failed, total, errors: mercado.errors, generatedAt: mercado.generatedAt };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const nowArg = args.indexOf("--ahora");
  runActualizar({ ahora: nowArg >= 0 ? args[nowArg + 1] : null })
    .then((r) => { if (!r.saved) process.exit(1); })
    .catch((e) => { console.error(e); process.exit(1); });
}
