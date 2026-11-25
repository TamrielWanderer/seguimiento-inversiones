# Tu Cartera Libre · aplicación web

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

## Comandos (necesitás Node.js 22.18 o más nuevo; la publicación usa Node 26)

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
| `src/datos.generado.ts`, `public/datos.json` | Todo unido: lo que usa la página. Se generan solos y no se guardan en el repositorio | `npm run build` |

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

## Qué se puede cargar

- **Compras** con fecha, comisión y dónde se compró (Nueva York, BYMA en pesos, CEDEAR en dólares, ASX). Se pueden editar.
- **Ventas** desde el botón «Vender» de cada posición (se descuentan primero las compras más viejas).
- **Otros activos** (bonos, ON, fondos, efectivo) con lo que se puso y lo que valen hoy.
- **Varias carteras** en el mismo navegador, y una cartera de ejemplo para probar.

`datos/catalogo.json` guarda, por título, el **ratio** del CEDEAR o de la acción local
(`byma.ratio`: cuántos equivalen a 1 acción de Nueva York), el **sector** y el **país**. El ratio se
usa para los dividendos y el dólar implícito; la actualización avisa en el registro si un ratio
deja de coincidir con los precios (por ejemplo, después de un cambio de ratio).

## Instalar en el celular

El sitio publicado se puede agregar a la pantalla de inicio (iPhone: Compartir → «Agregar a
inicio»; Android: menú → «Instalar app»). Funciona sin conexión con los últimos datos bajados.
Los archivos son `public/manifest.webmanifest`, `public/sw.js` y los íconos.

## Estructura

```
src/seguimiento.tsx   la página (pantallas)
src/calc.ts           cálculos de la cartera: ventas, dividendos cobrados, historia (con pruebas)
src/ui.tsx, ui.css    componentes propios (tablas, gráficos, tarjetas) que reemplazan a los de Grok
scripts/              descarga de datos (actualizar.mjs), cálculos y armado (armar.mjs)
.github/workflows/    actualización y publicación automática en GitHub Pages
```

## Idiomas

La página está en español e inglés (selector en el menú; la elección se guarda en el navegador).
Los textos se escriben en español en el código y pasan por `tr("…")`; la traducción está en
`src/lang/en.json`. Para sumar un idioma: copiá ese archivo (por ejemplo `pt.json`), traducí los
valores y agregalo en `src/i18n.ts` (`LANGS`, `DICT` y `MONTHS`). `npm run probar` avisa si falta
algún texto.

## Calculadora de plazo fijo

Sección propia en el menú («Plazo fijo y CD»): monto, tasa y plazo. Plazo fijo con TNA e interés simple (con renovaciones
opcionales) o certificado de depósito con APY e interés compuesto (`depositResult` en `src/calc.ts`).
Debajo compara el resultado contra la inflación, el dólar MEP, otros bancos y un bono del Tesoro. La
inflación mensual (INDEC) y las tasas de plazo fijo por banco (BCRA) salen de ArgentinaDatos y se
bajan en la corrida completa (`macro` en `datos/mercado.json`).

## Modo claro y oscuro

El botón del menú cambia entre los dos y la elección se guarda (`src/tema.ts`). Los colores de cada
modo son variables CSS al principio de `src/ui.css` (`:root` y `:root[data-theme="light"]`).

## Calendario y QR

- **Dividendos al calendario:** en «Dividendos», el botón «Agregar dividendos al calendario (.ics)» baja
  las fechas ex y de pago ya anunciadas de tu lista (`src/ics.ts`).
- **QR cifrado:** en «Importar y respaldo», «Pasar con un QR cifrado» muestra un QR con la cartera
  comprimida y cifrada (AES-GCM; la clave sale de un código de 8 caracteres con PBKDF2) y el código
  para escribir en el otro dispositivo (`src/sync.ts`). Es una copia de una sola vez, no una
  sincronización continua: no hay servidor.

## Licencia

Código bajo licencia MIT (ver `LICENSE`). Incluye React y qrcode-generator, también MIT. Los precios,
dividendos y noticias pertenecen a sus fuentes (Yahoo Finance, DolarApi, ArgentinaDatos) y no están
cubiertos por esta licencia.

## Seguridad y privacidad

- La cartera vive solo en `localStorage` del navegador. No se usan cookies (las versiones viejas
  guardaban una copia en una cookie; la página la borra sola al abrirse).
- `vite.config.ts` agrega al compilar una política de seguridad de contenido (CSP): solo corre el
  código de la página (por su huella SHA-256) y solo se conecta a su propio sitio y al de los datos.
- Los enlaces de noticias solo se abren si son direcciones `http(s)`, y la página no manda la
  dirección de origen (`referrer`) a los sitios que enlaza.
- Dependabot (`.github/dependabot.yml`) revisa las dependencias cada lunes y propone actualizaciones;
  `.github/workflows/revisar.yml` prueba y compila cada propuesta antes de que la aceptes.
- La política para avisar de fallas está en `SECURITY.md`.

## Horarios y fuera de hora

- La variación «hoy» compara el último precio de la rueda regular con el cierre de la rueda hábil
  anterior (el lunes compara contra el viernes; los feriados se saltean).
- Fuera del horario de Nueva York la página muestra aparte el movimiento del pre-mercado o del
  after-market (`ext` en cada título), contra el último cierre. El valor de la cartera y los demás
  números siguen usando el precio de la rueda regular.
- Actualizaciones (hora de Buenos Aires, de lunes a viernes): cada 30 minutos de 10:30 a 18:00,
  dos antes de la apertura (08:00 y 09:30), la completa a las 18:30 y una después del cierre (19:30).
- Las dispara `.github/workflows/reloj.yml`, no el programador de GitHub (que saltea la mayoría de
  las corridas pedidas cada media hora). Si alguna vez la página queda sin actualizarse en horario
  de mercado: pestaña Actions → «Reloj de actualizaciones» → «Run workflow».
