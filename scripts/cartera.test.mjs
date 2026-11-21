// npm run probar  (Node 22.18+ importa TypeScript directamente)
import test from "node:test";
import assert from "node:assert/strict";
import { applySales, realizedBySale, receivedDividends, portfolioHistory, allocation, openQty, divFactor } from "../src/calc.ts";

const env = { mepOn: (iso) => ({ "2025-01-10": 1000, "2025-06-10": 1200, "2026-01-10": 1500 })[iso] ?? null, mepToday: 1600, audusd: 0.65 };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test("ventas: primero entrado, primero salido, con comisión repartida", () => {
  const lots = [
    { id: "b", ticker: "KO", qty: 10, price: 60, date: "2025-06-10", ccy: "USD", fee: 5 },
    { id: "a", ticker: "KO", qty: 10, price: 50, date: "2025-01-10", ccy: "USD", fee: 10 },
    { id: "c", ticker: "KO", qty: 4, price: 100, date: "2025-01-10", ccy: "ARS" },
  ];
  const sales = [{ id: "s1", ticker: "KO", qty: 15, price: 70, date: "2026-01-10", ccy: "USD", fee: 3 }];
  const r = applySales(lots, sales);
  assert.deepEqual(r.open.map((l) => [l.id, l.qty, l.fee]), [["b", 5, 2.5], ["c", 4, undefined]]);
  assert.equal(r.unmatched.length, 0);
  const [x] = realizedBySale(r.pieces, env);
  // costo: 10×50+10 + 5×60+2,5 = 812,5 ; cobrado: 15×70−3 = 1047
  near(x.costUsd, 812.5);
  near(x.proceedsUsd, 1047);
  near(x.pnlUsd, 234.5);
  // en pesos: costo al dólar de cada compra, venta al dólar de la venta
  near(x.costArs, 510 * 1000 + 302.5 * 1200);
  near(x.proceedsArs, 1047 * 1500);
  assert.equal(openQty(lots, sales, "KO|USD"), 5);
  assert.equal(openQty(lots, sales, "KO|ARS"), 4);
});

test("vender más de lo que hay queda marcado", () => {
  const r = applySales([{ id: "a", ticker: "KO", qty: 2, price: 1, date: "", ccy: "USD" }], [{ id: "s", ticker: "KO", qty: 5, price: 1, date: "2026-01-10", ccy: "USD" }]);
  assert.equal(r.open.length, 0);
  assert.equal(r.unmatched[0].qty, 3);
});

test("resultado realizado de un lote en pesos descuenta la devaluación", () => {
  const lots = [{ id: "a", ticker: "GGAL", qty: 100, price: 1000, date: "2025-01-10", ccy: "ARS" }];
  const sales = [{ id: "s", ticker: "GGAL", qty: 100, price: 1500, date: "2026-01-10", ccy: "ARS" }];
  const [x] = realizedBySale(applySales(lots, sales).pieces, env);
  near(x.pnlArs, 50000); // +50 % en pesos
  near(x.costUsd, 100);
  near(x.proceedsUsd, 100); // 0 % en dólares: el dólar también subió 50 %
  near(x.pnlUsd, 0);
});

const info = {
  hist: (t) => (t === "KO" ? [["2025-03-01", 0.5], ["2025-09-01", 0.5], ["2026-03-01", 0.6]] : []),
  ratio: (t) => (t === "KO" ? 5 : null),
  payCcy: () => "USD",
};

test("dividendos cobrados según las fechas de compra y de venta", () => {
  const lots = [
    { id: "a", ticker: "KO", qty: 10, price: 50, date: "2025-01-10", ccy: "USD" },
    { id: "b", ticker: "KO", qty: 50, price: 100, date: "2025-06-10", ccy: "ARS" }, // CEDEAR 5:1
    { id: "c", ticker: "KO", qty: 99, price: 1, date: "", ccy: "USD" },
    { id: "d", ticker: "XX", qty: 10, price: 1, date: "2025-01-10", ccy: "ARS" }, // sin ratio
  ];
  const sales = [{ id: "s", ticker: "KO", qty: 10, price: 70, date: "2026-01-10", ccy: "USD" }];
  // sale consume el lote sin fecha primero (se considera el más viejo): quedan a (10) y 89 de c
  const r = receivedDividends(applySales(lots, sales).pieces, info, env);
  // a: 10 × (0,5+0,5+0,6) = 16 ; b: 50 × (0,5+0,6)/5 = 11
  near(r.total, 27);
  near(r.byYear["2025"], 10 + 5);
  near(r.byYear["2026"], 6 + 6);
  assert.equal(r.undated, 1);
  assert.equal(divFactor({ ticker: "XX", ccy: "ARS" }, info, env), null);
  near(divFactor({ ticker: "KO", ccy: "USD", ced: true }, info, env), 0.2);
});

test("historia: valor, invertido y referencia con las mismas fechas", () => {
  const weeks = ["2025-01-06", "2025-01-13", "2025-01-20", "2025-01-27"];
  const data = { KO: [50, 55, 60, 66], SPY: [100, 100, 110, 121], GGAL: [10, 10, 20, 20] };
  const h = { weeks, series: (t) => data[t] ?? null, unitUsdToday: (x) => (x.ccy === "ARS" ? 2 : data[x.ticker].at(-1)), benchmark: "SPY" };
  const lots = [
    { id: "a", ticker: "KO", qty: 10, price: 50, date: "2025-01-10", ccy: "USD" },
    { id: "b", ticker: "GGAL", qty: 100, price: 1000, date: "2025-01-10", ccy: "ARS" }, // 100 USD al MEP 1000
    { id: "c", ticker: "KO", qty: 1, price: 1, date: "", ccy: "USD" },
  ];
  const sales = [{ id: "s", ticker: "KO", qty: 4, price: 60, date: "2025-01-22", ccy: "USD" }];
  // el lote sin fecha se vende primero (1), después 3 del lote a
  const { points, skipped } = portfolioHistory(applySales(lots, sales).pieces, h, env);
  assert.equal(points.length, 4);
  assert.equal(skipped, 0);
  // semana 1: KO 10×50 + GGAL 100 × 10 × (2/20) = 500 + 100
  near(points[0].value, 600);
  near(points[0].invested, 600);
  near(points[0].bench, 600);
  // semana 3 (después de vender 3 KO a 60): KO 7×60 + GGAL 100×20×0,1 = 420 + 200
  near(points[2].value, 620);
  near(points[2].invested, 600 - 180);
  // referencia: 6 unidades de SPY, menos 180/110
  near(points[2].bench, (6 - 180 / 110) * 110);
  // última semana = valor de hoy
  near(points[3].value, 7 * 66 + 100 * 2);
});

test("reparto por etiqueta", () => {
  const a = allocation([{ label: "Tec", value: 60 }, { label: "Fin", value: 30 }, { label: "Tec", value: 10 }, { label: "Nada", value: 0 }]);
  assert.deepEqual(a.map((x) => [x.label, x.value, x.pct]), [["Tec", 70, 70], ["Fin", 30, 30]]);
});

test("historia: compras anteriores a los datos de la referencia entran cuando hay precio", () => {
  const weeks = ["2025-01-06", "2025-01-13", "2025-01-20"];
  const data = { KO: [50, 55, 60], SPY: [null, 100, 110] };
  const h = { weeks, series: (t) => data[t] ?? null, unitUsdToday: (x) => data[x.ticker].at(-1), benchmark: "SPY" };
  const { points } = portfolioHistory(applySales([{ id: "a", ticker: "KO", qty: 10, price: 50, date: "2025-01-10", ccy: "USD" }], []).pieces, h, env);
  assert.equal(points[0].bench, null);
  near(points[1].bench, 500);
  near(points[2].bench, 550);
});

test("idiomas: todos los textos tienen traducción al inglés", async () => {
  const { collectKeys } = await import("./textos.mjs");
  const fs = await import("node:fs");
  const en = JSON.parse(fs.readFileSync(new URL("../src/lang/en.json", import.meta.url), "utf8"));
  const missing = collectKeys().filter((k) => !(k in en));
  assert.deepEqual(missing, []);
  // Las variables {0}, {1}... tienen que estar en la traducción
  for (const [k, v] of Object.entries(en)) {
    const a = (k.match(/\{\d+\}/g) || []).sort().join();
    const b = (v.match(/\{\d+\}/g) || []).sort().join();
    assert.equal(b, a, `variables distintas en: ${k}`);
  }
});

test("calendario .ics: eventos de día completo, texto escapado y líneas de hasta 75 bytes", async () => {
  const { buildIcs } = await import("../src/ics.ts");
  const ics = buildIcs([
    { date: "2026-12-31", title: "KO: pago de dividendo", detail: "Fecha ex 30/11; estimado, antes de impuestos. " + "ñ".repeat(60), uid: "KO-pay-2026-12-31@x" },
  ], "Dividendos", new Date("2026-11-21T12:00:00Z"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101"));
  assert.ok(ics.includes("DTSTAMP:20261121T120000Z"));
  assert.ok(ics.replace(/\r\n /g, "").includes(String.raw`Fecha ex 30/11\; estimado\, antes`));
  for (const l of ics.split("\r\n")) assert.ok(new TextEncoder().encode(l).length <= 75, l);
});

test("QR cifrado: ida y vuelta, y con otro código no se puede abrir", async () => {
  const { packSync, unpackSync, newSyncKey, findSync, normalizeKey } = await import("../src/sync.ts");
  const data = { v: 1, w: ["KO", "MSFT"], l: Array.from({ length: 40 }, (_, i) => ({ id: "l" + i, ticker: "KO", qty: i + 1, price: 60.5, date: "2026-01-15", ccy: "USD" })) };
  const key = newSyncKey();
  assert.match(key, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  const packed = await packSync(data, key);
  assert.ok(packed.length < 900, "comprime: " + packed.length);
  assert.ok(!packed.includes("KO"));
  assert.deepEqual(await unpackSync(packed, key.toLowerCase().replace("-", " ")), data);
  await assert.rejects(unpackSync(packed, "AAAA-AAAA"));
  assert.equal(findSync("https://x.github.io/app/#s=" + packed), packed);
  assert.equal(findSync("hola"), null);
  assert.equal(normalizeKey(" ab-cd 23 "), "ABCD23");
});
