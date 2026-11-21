// Une catalogo.json + mercado.json + noticias.json y escribe los dos archivos generados
// que usa la página: src/datos.generado.ts (lo que va adentro) y public/datos.json (lo que
// la página vuelve a pedir para refrescarse). Ninguno de los dos se guarda en el repositorio.
//
//   node scripts/armar.mjs            -> arma y valida
//   node scripts/armar.mjs --check    -> solo valida, no escribe
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FILES = {
  catalogo: path.join(ROOT, "datos", "catalogo.json"),
  mercado: path.join(ROOT, "datos", "mercado.json"),
  noticias: path.join(ROOT, "datos", "noticias.json"),
  generado: path.join(ROOT, "src", "datos.generado.ts"),
  publico: path.join(ROOT, "public", "datos.json"),
};
const NOTE_MAX_DAYS = 21;

export const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

/** Arma el objeto que usa la página. Solo entran los títulos que tienen cotización. */
export function buildDataset(catalogo, mercado, noticias, now = new Date()) {
  const problems = [];
  const oldest = new Date(now.getTime() - NOTE_MAX_DAYS * 86400000).toISOString().slice(0, 10);
  const order = [];
  const aliases = {};
  for (const t of catalogo.titulos) {
    if (!mercado.catalog[t.ticker]) {
      problems.push(`${t.ticker}: no tiene cotización en mercado.json (corré npm run actualizar)`);
      continue;
    }
    order.push(t.ticker);
    if (t.alias?.length) aliases[t.ticker] = t.alias;
  }
  const known = new Set(order);
  const meta = {};
  const ratios = {};
  for (const t of catalogo.titulos) {
    if (!known.has(t.ticker)) continue;
    if (t.sector || t.pais) meta[t.ticker] = [t.sector || "Otros", t.pais || "Otros"];
    if (t.byma?.ratio) ratios[t.ticker] = t.byma.ratio;
  }
  const tickers = {};
  // Titulares automáticos de Yahoo (actualizar.mjs)
  for (const [sym, items] of Object.entries(mercado.news || {})) {
    if (!known.has(sym) || !items?.length) continue;
    tickers[sym] = { date: items[0].iso, text: "", news: items.map(({ title, site, date, href }) => ({ title, site, date, href })) };
  }
  // Comentarios cargados a mano: van primero, y se descartan solos después de 3 semanas
  for (const [sym, c] of Object.entries(noticias.tickers || {})) {
    if (c && c.date && c.date < oldest) continue;
    if (!known.has(sym)) { problems.push(`noticias.json: ${sym} no está en el catálogo`); continue; }
    if (typeof c.text !== "string" || !Array.isArray(c.news)) { problems.push(`noticias.json: ${sym} tiene un formato inválido`); continue; }
    const news = c.news.filter((n) => {
      const ok = /^https:\/\//.test(n.href || "") && typeof n.title === "string";
      if (!ok) problems.push(`noticias.json: ${sym} tiene un link inválido (${n.href}); lo dejo afuera`);
      return ok;
    });
    const auto = tickers[sym]?.news || [];
    const merged = [...news, ...auto.filter((a) => !news.some((n) => n.href === a.href))].slice(0, 6);
    tickers[sym] = { date: c.date || noticias.updatedAt || null, text: c.text, news: merged };
  }
  const calendar = (noticias.calendar || []).filter((e) => {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(e.date || "") && known.has(e.ticker);
    if (!ok) problems.push(`noticias.json: evento de calendario inválido (${e.ticker} ${e.date})`);
    return ok;
  });
  const dataset = {
    v: 2,
    generatedAt: mercado.generatedAt,
    sessions: mercado.sessions,
    fx: mercado.fx,
    mepHist: mercado.mepHist || [],
    watchDefault: catalogo.seguidosPorDefecto.filter((s) => known.has(s)),
    order,
    aliases,
    catalog: Object.fromEntries(order.map((s) => [s, mercado.catalog[s]])),
    ba: Object.fromEntries(Object.entries(mercado.ba || {}).filter(([s]) => known.has(s)).map(([s, b]) => [s, ratios[s] ? { ...b, ratio: ratios[s] } : b])),
    meta,
    hist: mercado.hist?.weeks ? { weeks: mercado.hist.weeks, series: Object.fromEntries(Object.entries(mercado.hist.series).filter(([s]) => known.has(s))) } : null,
    div: Object.fromEntries(Object.entries(mercado.div || {}).filter(([s]) => known.has(s))),
    earnings: Object.fromEntries(Object.entries(mercado.earnings || {}).filter(([s]) => known.has(s))),
    indices: mercado.indices || [],
    notes: {
      updatedAt: noticias.updatedAt || null,
      market: noticias.updatedAt && noticias.updatedAt >= oldest ? (noticias.market || "") : "",
      tickers,
      calendar,
      divNotes: noticias.divNotes || {},
    },
  };
  return { dataset, problems };
}

/** El módulo con los datos que importa la página. */
export function dataModule(dataset) {
  return `// Archivo generado por scripts/armar.mjs. No editar a mano.\nimport type { Dataset } from "./seguimiento";\nexport const DATOS: Dataset = ${JSON.stringify(dataset)};\n`;
}

export function armar({ check = false, log = console.log } = {}) {
  const { dataset, problems } = buildDataset(readJson(FILES.catalogo), readJson(FILES.mercado), readJson(FILES.noticias));
  for (const p of problems) log(`  aviso: ${p}`);
  if (!check) {
    fs.mkdirSync(path.dirname(FILES.publico), { recursive: true });
    fs.writeFileSync(FILES.publico, JSON.stringify(dataset));
    fs.writeFileSync(FILES.generado, dataModule(dataset));
    log(`Listo: ${dataset.order.length} títulos, datos del ${dataset.generatedAt}.`);
  }
  return { dataset, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  armar({ check: process.argv.includes("--check") });
}
