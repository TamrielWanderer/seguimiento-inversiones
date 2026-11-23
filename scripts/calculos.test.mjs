// npm run probar
import test from "node:test";
import assert from "node:assert/strict";
import { quoteFromChart, dividendsFromChart, applyCalendarEvents, indexFromChart, fxFromDolarApi, mepHistory, cleanBars, newsFromSearch, newsKeywords, baQuoteFromChart, isAmbiguousTicker } from "./calculos.mjs";
import { buildDataset, dataModule } from "./armar.mjs";

// Serie diaria de días hábiles, a las 14:30 UTC (apertura de NY), con cierre = base + i
function series(fromIso, days, { base = 100, hourUtc = 14.5, step = 1 } = {}) {
  const out = [];
  let t = Date.parse(`${fromIso}T00:00:00Z`);
  let i = 0;
  while (out.length < days) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
      const c = base + i * step;
      out.push({ date: new Date(t + hourUtc * 3600000), open: c - 0.5, high: c + 1, low: c - 1, close: c, volume: 1 });
      i++;
    }
    t += 86400000;
  }
  return out;
}

test("precio, variación del día, 1 y 3 meses salen de la misma serie", () => {
  const quotes = series("2025-10-01", 300);
  const chart = { meta: { exchangeTimezoneName: "America/New_York" }, quotes };
  const { row } = quoteFromChart(chart, { name: "X" });
  const last = quotes.at(-1);
  const prev = quotes.at(-2);
  assert.equal(row.price, last.close);
  assert.equal(row.dayChg, 1);
  assert.equal(row.chg, Math.round((last.close / prev.close - 1) * 10000) / 100);
  // 1 mes: último cierre en o antes de (último día − 30)
  const lastIso = row.asOf;
  const ref = quotes.filter((q) => q.date.toISOString().slice(0, 10) <= new Date(Date.parse(lastIso) - 30 * 86400000).toISOString().slice(0, 10)).at(-1);
  assert.equal(row.m1, Math.round((last.close / ref.close - 1) * 10000) / 100);
  // el último punto del gráfico es el precio
  assert.equal(row.pts.at(-1).v, row.price);
  assert.ok(row.pts.length >= 13 && row.pts.length <= 15, `puntos semanales: ${row.pts.length}`);
  assert.equal(row.hi52, Math.max(...quotes.filter((q) => q.date.toISOString().slice(0, 10) > new Date(Date.parse(lastIso) - 365 * 86400000).toISOString().slice(0, 10)).map((q) => q.high)));
});

test("la fecha de ASX se toma en hora de Sídney, no en UTC", () => {
  // Barra del lunes 16/11 en Sídney = domingo 15/11 23:00 UTC
  const quotes = [
    { date: new Date("2026-11-12T23:00:00Z"), open: 1, high: 1, low: 1, close: 10 },
    { date: new Date("2026-11-15T23:00:00Z"), open: 1, high: 1, low: 1, close: 11 },
  ];
  const { row } = quoteFromChart({ meta: { exchangeTimezoneName: "Australia/Sydney" }, quotes }, { name: "BHP", ccy: "AUD" });
  assert.equal(row.asOf, "2026-11-16");
  assert.equal(row.ccy, "AUD");
});

test("si Yahoo repite la barra del día, queda la última", () => {
  const bars = cleanBars([
    { date: new Date("2026-11-16T14:30:00Z"), close: 10 },
    { date: new Date("2026-11-17T14:30:00Z"), close: 11 },
    { date: new Date("2026-11-17T20:59:00Z"), close: 12 },
  ], "America/New_York");
  assert.deepEqual(bars.map((b) => b.close), [10, 12]);
});

test("dividendos: 12 meses, cantidad de pagos y último", () => {
  const dividends = [
    { date: new Date("2025-08-15T13:30:00Z"), amount: 0.5 }, // > 12 meses
    { date: new Date("2025-12-01T14:30:00Z"), amount: 1.86 },
    { date: new Date("2026-03-02T14:30:00Z"), amount: 1.86 },
    { date: new Date("2026-06-01T13:30:00Z"), amount: 1.86 },
    { date: new Date("2026-09-01T13:30:00Z"), amount: 1.86 },
  ];
  const d = dividendsFromChart({ events: { dividends } }, "2026-11-16", "America/New_York");
  assert.equal(d.ttm, 7.44);
  assert.equal(d.n12, 4);
  assert.equal(d.lastEx, "2026-09-01");
  assert.equal(d.lastAmt, 1.86);
  assert.equal(d.hist.length, 5);
});

test("calendario: próximas fechas, último pago y resultados", () => {
  const div = { ttm: 7.44, n12: 4, lastEx: "2026-09-01", lastAmt: 1.86, lastPay: null, nextEx: null, nextPay: null, hist: [] };
  const r = applyCalendarEvents(div, { exDividendDate: new Date("2026-12-01T00:00:00Z"), dividendDate: new Date("2026-12-15T00:00:00Z"), earnings: { earningsDate: [new Date("2027-02-10T00:00:00Z")], isEarningsDateEstimate: true } }, "2026-11-17");
  assert.equal(r.div.nextEx, "2026-12-01");
  assert.equal(r.div.nextPay, "2026-12-15");
  assert.deepEqual(r.earnings, { date: "2027-02-10", estimate: true });
  const past = applyCalendarEvents(div, { exDividendDate: new Date("2026-09-01T00:00:00Z"), dividendDate: new Date("2026-09-16T00:00:00Z"), earnings: { earningsDate: [new Date("2026-10-20T00:00:00Z")] } }, "2026-11-17");
  assert.equal(past.div.nextEx, null);
  assert.equal(past.div.lastPay, "2026-09-16");
  assert.equal(past.earnings, null);
});

test("tasa del Tesoro: variación en puntos", () => {
  const quotes = series("2026-06-01", 120, { base: 4.5, step: 0.005 });
  const r = indexFromChart({ meta: { exchangeTimezoneName: "America/New_York" }, quotes }, { id: "tnx", nombre: "Tesoro 10 años", tipo: "tasa" });
  assert.equal(r.kind, "tasa");
  assert.equal(r.chgAbs, 0.005);
  assert.ok(r.m1Abs > 0.09 && r.m1Abs < 0.12);
});

test("DolarApi y la historia del MEP", () => {
  const fx = fxFromDolarApi([
    { casa: "oficial", compra: 1525, venta: 1575, fechaActualizacion: "2026-11-16T20:00:00.000Z" },
    { casa: "bolsa", compra: 1581.2, venta: 1588.9, fechaActualizacion: "2026-11-16T20:59:00.000Z" },
    { casa: "contadoconliqui", compra: 1680.1, venta: 1682.9, fechaActualizacion: "2026-11-16T20:59:00.000Z" },
  ]);
  assert.deepEqual(fx.mep, { compra: 1581.2, venta: 1588.9 });
  assert.equal(fx.blue, null);
  assert.throws(() => fxFromDolarApi([{ casa: "oficial", compra: 1, venta: 2 }]));
  const h = mepHistory([{ casa: "bolsa", compra: 1, venta: 1000, fecha: "2018-12-31" }, { casa: "bolsa", compra: 1, venta: 1100, fecha: "2025-01-02" }, { casa: "bolsa", compra: 1, venta: 1200.456, fecha: "2025-01-03" }], "2019-01-01", { iso: "2026-11-17", venta: 1590 });
  assert.deepEqual(h, [["2025-01-02", 1100], ["2025-01-03", 1200.46], ["2026-11-17", 1590]]);
  // Antes de los últimos 3 años queda un dato por semana (el último de cada semana)
  const rows = [];
  for (let t = Date.parse("2020-01-06T12:00:00Z"); t <= Date.parse("2026-11-16T12:00:00Z"); t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() % 6 !== 0) rows.push({ casa: "bolsa", compra: 1, venta: 100 + rows.length, fecha: d.toISOString().slice(0, 10) });
  }
  const thin = mepHistory(rows, "2019-01-01", { iso: "2026-11-17", venta: 1590 });
  const old = thin.filter(([d]) => d < "2023-11-17");
  assert.ok(old.every(([d]) => new Date(`${d}T12:00:00Z`).getUTCDay() === 5 || d === old.at(-1)[0]), "semanal = viernes");
  assert.ok(thin.filter(([d]) => d >= "2023-11-17").length > 700);
  assert.equal(thin.find(([d]) => d === "2020-01-10")[1], rows.find((r) => r.fecha === "2020-01-10").venta);
});

test("armar: deja afuera lo inválido y escribe el módulo de datos", () => {
  const catalogo = { seguidosPorDefecto: ["AAA", "ZZZ"], titulos: [{ ticker: "AAA", nombre: "A" }, { ticker: "ZZZ", nombre: "Z" }] };
  const mercado = { generatedAt: "2026-11-17T22:00:00Z", sessions: {}, fx: { mep: { compra: 1, venta: 2 } }, catalog: { AAA: { price: 1 } }, ba: {}, div: {}, earnings: {}, indices: [] };
  const noticias = { tickers: { AAA: { date: "2026-11-17", text: "x", news: [{ href: "javascript:alert(1)" }] }, QQQ: { text: "y", news: [] } }, calendar: [{ date: "17/11", ticker: "AAA" }] };
  const { dataset, problems } = buildDataset(catalogo, mercado, noticias);
  assert.deepEqual(dataset.order, ["AAA"]);
  assert.deepEqual(dataset.watchDefault, ["AAA"]);
  assert.equal(dataset.notes.calendar.length, 0);
  assert.ok(problems.some((p) => p.includes("link inválido")));
  assert.equal(dataset.notes.tickers.AAA.news.length, 0);
  assert.ok(problems.some((p) => p.includes("QQQ")));
  const mod = dataModule({ v: 2 });
  assert.ok(mod.endsWith('export const DATOS: Dataset = {"v":2};\n'));
});

test("titulares de Yahoo: recientes, del título, con link https", () => {
  const now = new Date("2026-11-18T15:00:00Z");
  const items = newsFromSearch({ news: [
    { title: "Vieja", publisher: "X", link: "https://a/1", providerPublishTime: new Date("2026-10-01T10:00:00Z"), relatedTickers: ["PBR"] },
    { title: " Nueva ", publisher: "Reuters", link: "https://a/2", providerPublishTime: new Date("2026-11-18T02:00:00Z"), relatedTickers: ["PBR"] },
    { title: "Otra empresa", publisher: "X", link: "https://a/3", providerPublishTime: new Date("2026-11-17T10:00:00Z"), relatedTickers: ["VALE"] },
    { title: "Sin https", publisher: "X", link: "http://a/4", providerPublishTime: new Date("2026-11-17T10:00:00Z") },
    { title: "Ayer", publisher: "Bloomberg", link: "https://a/5", providerPublishTime: new Date("2026-11-17T12:00:00Z") },
  ] }, { now, ticker: "PBR", keywords: ["nueva", "ayer", "vieja", "otra", "https"] });
  assert.deepEqual(items.map((n) => n.title), ["Nueva", "Ayer", "Otra empresa"]);
  assert.equal(items[0].date, "17 nov 2026"); // 02:00 UTC del 18 = 23:00 del 17 en Buenos Aires
  assert.equal(items[0].site, "Reuters");
});

test("armar: comentarios a mano primero, titulares automáticos después, y los viejos se descartan", () => {
  const catalogo = { seguidosPorDefecto: ["AAA", "BBB"], titulos: [{ ticker: "AAA" }, { ticker: "BBB" }] };
  const mercado = { generatedAt: "x", sessions: {}, fx: { mep: { venta: 1 } }, catalog: { AAA: {}, BBB: {} }, news: {
    AAA: [{ title: "auto", site: "Y", date: "18 nov 2026", href: "https://y/1", iso: "2026-11-18" }, { title: "dup", site: "Y", date: "", href: "https://m/1", iso: "2026-11-18" }],
    BBB: [{ title: "auto B", site: "Y", date: "", href: "https://y/2", iso: "2026-11-17" }],
  } };
  const noticias = { updatedAt: "2026-10-01", market: "viejo", tickers: {
    AAA: { date: "2026-11-15", text: "comentario", news: [{ title: "manual", site: "M", date: "", href: "https://m/1" }] },
    BBB: { date: "2026-10-01", text: "viejo", news: [] },
  }, calendar: [] };
  const { dataset } = buildDataset(catalogo, mercado, noticias, new Date("2026-11-18T12:00:00Z"));
  assert.deepEqual(dataset.notes.tickers.AAA.news.map((n) => n.title), ["manual", "auto"]);
  assert.equal(dataset.notes.tickers.AAA.text, "comentario");
  assert.equal(dataset.notes.tickers.BBB.text, "");
  assert.deepEqual(dataset.notes.tickers.BBB.news.map((n) => n.title), ["auto B"]);
  assert.equal(dataset.notes.market, "");
});

test("titulares: tienen que nombrar a la empresa", () => {
  const now = new Date("2026-11-18T15:00:00Z");
  const mk = (title) => ({ title, publisher: "X", link: "https://a/" + title.length, providerPublishTime: new Date("2026-11-18T10:00:00Z") });
  const res = { news: [mk("Carvana Grows Faster"), mk("McDonald’s vs Yum Brands"), mk("MCD hits a 52-week high"), mk("AMCD is not MCD-related?")] };
  const items = newsFromSearch(res, { now, ticker: "MCD", keywords: newsKeywords({ nombre: "McDonald's" }) });
  assert.deepEqual(items.map((n) => n.title), ["McDonald’s vs Yum Brands", "MCD hits a 52-week high", "AMCD is not MCD-related?"]);
  assert.deepEqual(newsKeywords({ nombre: "Petrobras (ADR)" }), ["Petrobras"]);
  assert.deepEqual(newsKeywords({ nombre: "X", noticiasClave: ["gold"] }), ["gold"]);
});

test("BYMA: si la serie no alcanza, usa el último precio de Yahoo", () => {
  const r = baQuoteFromChart({ meta: { regularMarketPrice: 15000, previousClose: 14500, regularMarketTime: new Date("2026-11-18T19:00:00Z"), exchangeTimezoneName: "America/Argentina/Buenos_Aires" }, quotes: [{ date: new Date("2026-11-18T13:00:00Z"), close: 15000 }] });
  assert.equal(r.price, 15000);
  assert.equal(r.chg, 3.45);
  assert.equal(r.asOf, "2026-11-18");
  assert.throws(() => baQuoteFromChart({ meta: {}, quotes: [] }));
});

test("IRSA: las notas sobre el IRS (impuestos de EE.UU.) no entran", () => {
  const now = new Date("2026-11-18T15:00:00Z");
  const mk = (title, i) => ({ title, publisher: "X", link: "https://a/" + i, providerPublishTime: new Date("2026-11-18T10:00:00Z") });
  const res = { news: ["New IRS Rules Could Add $4.2 Billion To Retirement Savings", "When the IRS Shows Up at 75", "IRSA announces results for the first quarter", "Why IRSA Inversiones (IRS) Stock Is Up", "Buy NYSE: IRS before earnings?"].map(mk) };
  assert.equal(isAmbiguousTicker("IRS"), true);
  assert.equal(isAmbiguousTicker("PBR"), false);
  const items = newsFromSearch(res, { now, ticker: "IRS", keywords: ["irsa"], strictTicker: true, max: 10 });
  assert.deepEqual(items.map((n) => n.title).sort(), ["Buy NYSE: IRS before earnings?", "IRSA announces results for the first quarter", "Why IRSA Inversiones (IRS) Stock Is Up"]);
  // un ticker no ambiguo sigue aceptando la sigla suelta
  assert.equal(newsFromSearch({ news: [mk("PBR Q3 Earnings Call Highlights", 9)] }, { now, ticker: "PBR", keywords: ["petrobras"] }).length, 1);
});

test("compactJson: mismo contenido, un renglón por dato", async () => {
  const { compactJson } = await import("./actualizar.mjs");
  const data = { v: 1, vacio: {}, hist: { weeks: ["2026-01-02", "2026-01-09"], series: Object.fromEntries(Array.from({ length: 60 }, (_, i) => ["T" + i, Array.from({ length: 30 }, (_, j) => (j % 7 ? i + j / 10 : null))])) }, news: { KO: [{ title: "a \"b\"", href: "https://x" }] } };
  const out = compactJson(data);
  assert.deepEqual(JSON.parse(out), data);
  const lines = out.split("\n");
  assert.ok(lines.length > 60 && lines.length < 80, String(lines.length));
  assert.ok(lines.some((l) => l.startsWith('   "T7": [')));
});
