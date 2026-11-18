import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Todo queda en un único dist/index.html (código, estilos y datos), que se puede abrir
// con doble clic, mandar por mail o WhatsApp, o subir a cualquier hosting estático.
// dist/datos.json va al lado, para que el sitio publicado y las copias se actualicen solos.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: { target: "es2020", chunkSizeWarningLimit: 2000 },
});
