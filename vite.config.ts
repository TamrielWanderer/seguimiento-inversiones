import { createHash } from "node:crypto";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Política de seguridad de contenido: la página solo puede ejecutar su propio código (identificado
// por su huella SHA-256) y solo puede conectarse a su propio sitio y al de los datos. Si alguna vez
// se colara código ajeno, el navegador no lo ejecuta ni lo deja mandar la cartera a otro lado.
function contentSecurityPolicy(dataUrl: string): Plugin {
  const dataOrigin = /^https?:\/\//.test(dataUrl) ? new URL(dataUrl).origin : "";
  return {
    name: "politica-de-seguridad",
    enforce: "post",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        for (const file of Object.values(bundle)) {
          if (file.type !== "asset" || !file.fileName.endsWith(".html")) continue;
          const html = String(file.source);
          const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
            .map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
          const csp = [
            "default-src 'none'",
            `script-src ${hashes.join(" ") || "'none'"}`,
            "style-src 'unsafe-inline'",
            "img-src 'self' data:",
            `connect-src 'self' ${dataOrigin}`.trim(),
            "manifest-src 'self'",
            "worker-src 'self'",
            "base-uri 'none'",
            "form-action 'none'",
          ].join("; ");
          file.source = html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
        }
      },
    },
  };
}

// Todo queda en un único dist/index.html (código, estilos y datos), que se puede abrir
// con doble clic, mandar por mail o WhatsApp, o subir a cualquier hosting estático.
// dist/datos.json va al lado, para que el sitio publicado y las copias se actualicen solos.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), viteSingleFile(), contentSecurityPolicy(loadEnv(mode, process.cwd(), "VITE_").VITE_DATA_URL ?? process.env.VITE_DATA_URL ?? "")],
  build: { target: "es2020", chunkSizeWarningLimit: 2000 },
}));
