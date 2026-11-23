// Modo oscuro (el de siempre) o claro. La elección se guarda en el navegador.
export type Mode = "dark" | "light";
const MODE_KEY = "familia-inversiones-tema-v1";
const BAR = { dark: "#121a2b", light: "#f3f5fa" };

export function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** Aplica el modo a toda la página (los colores salen de variables CSS en ui.css). */
export function setMode(mode: Mode, save = false): void {
  try {
    document.documentElement.dataset.theme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR[mode]);
    if (save) localStorage.setItem(MODE_KEY, mode);
  } catch { /* sin ventana o sin almacenamiento */ }
}
