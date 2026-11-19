// Lista todos los textos que pasan por tr() y los que vienen de listas (pestañas, tipos, sectores, países).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function collectKeys() {
  const keys = new Set();
  for (const f of ["src/seguimiento.tsx", "src/ui.tsx"]) {
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of s.matchAll(/\btr\(("(?:[^"\\]|\\.)*")/g)) keys.add(JSON.parse(m[1]).trim());
    const tabs = s.match(/const TABS[^=]*= \[([\s\S]*?)\];/);
    if (tabs) for (const m of tabs[1].matchAll(/(?:label|short): "([^"]+)"/g)) keys.add(m[1]);
    const kinds = s.match(/const EXTRA_KINDS = \[([^\]]*)\]/);
    if (kinds) for (const m of kinds[1].matchAll(/"([^"]+)"/g)) keys.add(m[1]);
  }
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, "datos/catalogo.json"), "utf8"));
  for (const t of cat.titulos) { if (t.sector) keys.add(t.sector); if (t.pais) keys.add(t.pais); }
  for (const k of ["Otros", "Otros activos", "Argentina"]) keys.add(k);
  keys.delete("");
  return [...keys].sort((a, b) => a.localeCompare(b, "es"));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(collectKeys(), null, 1));
