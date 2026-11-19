// Idiomas de la aplicación. Los textos están escritos en español en el código y pasan por tr().
// Para sumar un idioma: crear src/lang/<código>.json con las mismas claves que en.json,
// importarlo acá y agregarlo a LANGS y a DICT. `npm run probar` avisa si falta alguna traducción.
import en from "./lang/en.json";

export type Lang = "es" | "en";
export const LANGS: { id: Lang; name: string }[] = [
  { id: "es", name: "Español" },
  { id: "en", name: "English" },
];
const DICT: Record<Lang, Record<string, string>> = { es: {}, en: en as Record<string, string> };
const MONTHS: Record<Lang, string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const LANG_KEY = "familia-inversiones-idioma-v1";

let lang: Lang = "es";
export const getLang = (): Lang => lang;
const isLang = (x: unknown): x is Lang => LANGS.some((l) => l.id === x);

/** Idioma guardado; si no hay, el del dispositivo cuando lo tenemos, y si no, español. */
export function readLang(): Lang {
  try {
    const saved = globalThis.localStorage?.getItem(LANG_KEY);
    if (isLang(saved)) return saved;
  } catch { /* sin guardado */ }
  const nav = (globalThis.navigator?.language || "es").slice(0, 2).toLowerCase();
  return isLang(nav) ? nav : "es";
}

export function setLang(l: Lang, save = false): void {
  lang = l;
  try {
    if (typeof document !== "undefined") document.documentElement.lang = l;
    if (save) globalThis.localStorage?.setItem(LANG_KEY, l);
  } catch { /* sin guardado */ }
}

export const monthShort = (i: number): string => MONTHS[lang][i] ?? "";

/** Traduce un texto escrito en español. {0}, {1}... se reemplazan por los argumentos. */
export function tr(s: string, ...args: unknown[]): string {
  const key = s.trim();
  if (!key) return s;
  const found = lang === "es" ? key : DICT[lang][key] ?? key;
  const out = args.length ? found.replace(/\{(\d+)\}/g, (_m, i: string) => String(args[Number(i)] ?? "")) : found;
  return s.slice(0, s.length - s.trimStart().length) + out + s.slice(s.trimEnd().length);
}
