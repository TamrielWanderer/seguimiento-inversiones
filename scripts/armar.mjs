// Une catalogo.json + mercado.json + noticias.json en datos.json
// y lo inyecta en la página, entre las marcas @@DATOS-INICIO y @@DATOS-FIN.
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
  datos: path.join(ROOT, "datos", "datos.json"),
  pagina: path.join(ROOT, "src", "seguimiento.tsx"),
  publico: path.join(ROOT, "public", "datos.json"),
};
const NOTE_MAX_DAYS = 21;
const START = "// @@DATOS-INICIO";
const END = "// @@DATOS-FIN";

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
    ba: Object.fromEntries(Object.entries(mercado.ba || {}).filter(([s]) => known.has(s))),
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

/** Reemplaza el bloque de datos de la página. */
export function injectIntoPage(pageText, dataset) {
  const a = pageText.indexOf(START);
  const b = pageText.indexOf(END);
  if (a < 0 || b < a) throw new Error(`No encontré las marcas ${START} / ${END} en la página`);
  const lineEnd = pageText.indexOf("\n", a);
  const block = `\nconst DATOS: Dataset = ${JSON.stringify(dataset)};\n`;
  return pageText.slice(0, lineEnd + 1) + block.slice(1) + pageText.slice(b);
}

export function armar({ check = false, log = console.log } = {}) {
  const { dataset, problems } = buildDataset(readJson(FILES.catalogo), readJson(FILES.mercado), readJson(FILES.noticias));
  for (const p of problems) log(`  aviso: ${p}`);
  if (!check) {
    fs.writeFileSync(FILES.datos, JSON.stringify(dataset) + "\n");
    fs.mkdirSync(path.dirname(FILES.publico), { recursive: true });
    fs.writeFileSync(FILES.publico, JSON.stringify(dataset));
    const page = fs.readFileSync(FILES.pagina, "utf8");
    fs.writeFileSync(FILES.pagina, injectIntoPage(page, dataset));
    log(`Listo: ${dataset.order.length} títulos, datos del ${dataset.generatedAt}. Escribí datos/datos.json y la página.`);
  }
  return { dataset, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  armar({ check: process.argv.includes("--check") });
}
