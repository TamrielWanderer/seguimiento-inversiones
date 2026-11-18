# Seguimiento de inversiones · aplicación web

Una página web común (React + TypeScript), sin Grok. Se compila en **un solo archivo**,
`dist/index.html`, que trae adentro el código, los estilos y los datos del día.

La cartera de cada persona (lista de títulos y compras) se guarda **solo en su navegador**.
Nada se manda a un servidor, así que el mismo link o el mismo archivo sirve para toda la familia:
cada uno ve lo suyo.

## Tres formas de compartirla

### 1. Mandar el archivo
Mandá `dist/index.html` (renombralo, por ejemplo, `seguimiento-de-inversiones.html`) por mail,
WhatsApp o Drive. Se abre con doble clic en cualquier navegador, en la computadora o en el celular.
- Muestra los precios del día en que se compiló.
- Si además publicaste el sitio (opción 2), el archivo busca solo los datos nuevos cada vez que
  se abre con internet. Sin internet, usa los suyos.

### 2. Sitio web gratis que se actualiza solo (GitHub Pages) · recomendado
1. Creá un repositorio **público** en GitHub (por ejemplo `seguimiento-inversiones`) y subí esta
   carpeta completa (sin `node_modules` ni `dist`).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Pestaña **Actions → «Actualizar y publicar» → Run workflow** (la primera vez, a mano).
4. En unos minutos queda en `https://TU-USUARIO.github.io/seguimiento-inversiones/`.

Desde ahí, de lunes a viernes a las 18:40 (hora de Buenos Aires), GitHub baja precios, dólar y
noticias, compila y publica solo. Mandá el link y listo. En el celular se puede «Agregar a la
pantalla de inicio» para usarla como una app.

Si Yahoo no responde algún día, se publica igual con los datos anteriores y la etiqueta de
arriba a la derecha se pone amarilla o roja según la antigüedad.

### 3. Cualquier hosting estático
Subí `datos.json` e `index.html` de la carpeta `dist` a Netlify (arrastrando la carpeta a
app.netlify.com/drop), Cloudflare Pages, Vercel o tu propio servidor. Así no se actualiza sola:
hay que volver a compilar y subir.

## Comandos (necesitás Node.js 20 o más nuevo)

```
npm install          # una vez
npm run actualizar   # baja precios, dividendos, resultados, dólar y noticias (Yahoo, DolarApi, ArgentinaDatos)
npm run build        # arma dist/index.html y dist/datos.json
npm run dev          # para probar cambios en http://localhost:5173
npm run probar       # pruebas de los cálculos
```

## Datos

| Archivo | Qué es | Quién lo cambia |
|---|---|---|
| `datos/catalogo.json` | Títulos, símbolos BYMA, índices, títulos por defecto y de cuáles buscar noticias (`investigarSiempre`) | Vos |
| `datos/noticias.json` | Opcional: comentarios y fechas oficiales escritos a mano | Vos |
| `datos/mercado.json` | Precios, historia, dividendos, resultados, dólar y titulares | `npm run actualizar` |
| `datos/datos.json`, `public/datos.json` | Todo unido: lo que usa la página | `npm run build` |

Para **sumar un título**, agregalo en `datos/catalogo.json`, dentro de `titulos`:

```json
{ "ticker": "JNJ", "nombre": "Johnson & Johnson", "moneda": "USD",
  "byma": { "simbolo": "JNJ.BA", "nombre": "CEDEAR Johnson & Johnson", "tipo": "cedear" } }
```

`ticker` es el símbolo de Yahoo Finance (los de Australia terminan en `.AX` con `"moneda": "AUD"`).
Con el sitio en GitHub podés editar el archivo directo en la web de GitHub: al guardar se publica solo.

**Noticias:** cada actualización trae titulares recientes de Yahoo Finance (en inglés) para los
títulos de `investigarSiempre` y los que se movieron 4 % o más. Si querés sumar un comentario o una
fecha oficial a mano, usá `datos/noticias.json` con este formato; los comentarios desaparecen
solos a las 3 semanas, para que no queden viejos:

```json
{
  "updatedAt": "2026-11-18",
  "market": "Contexto general, sin precios.",
  "tickers": { "PBR": { "date": "2026-11-18", "text": "Comentario.", "news": [ { "title": "…", "site": "SEC", "date": "12 nov 2026", "href": "https://…" } ] } },
  "calendar": [ { "date": "2026-12-01", "ticker": "MCD", "title": "Registro · USD 1,93", "detail": "Pago el 15 de diciembre.", "src": "McDonald's" } ],
  "divNotes": {}
}
```

## Estructura

```
src/seguimiento.tsx   la página (lógica, cálculos y pantallas)
src/ui.tsx, ui.css    componentes propios (tablas, gráficos, tarjetas) que reemplazan a los de Grok
scripts/              descarga de datos (actualizar.mjs), cálculos y armado (armar.mjs)
.github/workflows/    actualización y publicación automática en GitHub Pages
```
