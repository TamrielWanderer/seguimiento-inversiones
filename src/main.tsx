import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui.css";
import InversionesPage from "./seguimiento";
import { readMode, setMode } from "./tema";

setMode(readMode()); // antes de dibujar, para que no parpadee

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <InversionesPage />
  </StrictMode>,
);

// Instalable y con uso sin conexión (solo cuando se sirve por http/https, no como archivo suelto).
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* sin service worker: la página funciona igual */ });
  });
}
