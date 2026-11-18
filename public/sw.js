// Permite instalar la página y abrirla sin conexión con los últimos datos bajados.
// Siempre intenta primero la red; si no hay, usa la copia guardada.
const CACHE = "seguimiento-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./manifest.webmanifest", "./icon-192.png"])).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  ]));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  // datos.json se pide con ?t=...: se guarda sin el parámetro para encontrarlo sin conexión.
  const key = url.pathname.endsWith("datos.json") ? url.origin + url.pathname : e.request;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(key).then((hit) => hit || (e.request.mode === "navigate" ? caches.match("./") : Response.error()))),
  );
});
