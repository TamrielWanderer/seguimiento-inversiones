# Tu Cartera Lite

**Español** · [English](README.en.md)

Una aplicación gratuita para seguir tus inversiones desde Argentina: acciones de Estados Unidos,
CEDEARs, acciones locales y acciones australianas, valuadas en dólares y en pesos con el dólar MEP.

**Abrir la aplicación:** https://tamrielwanderer.github.io/seguimiento-inversiones/

Funciona en el navegador, no pide cuenta, está en español y en inglés, y tiene modo oscuro y
modo claro.

## Qué hace

- **Cartera.** Cargás cada compra con su fecha y te muestra el costo, el valor de hoy y el
  resultado en dólares y en pesos, con el MEP del día de la compra. Admite ventas (se descuentan
  primero las compras más viejas), comisiones, varias carteras y otros activos, como bonos, fondos
  o efectivo.
- **Gráfico de rendimiento.** Tu cartera a lo largo del tiempo, comparada con haber puesto la misma
  plata, en las mismas fechas, en el S&P 500.
- **Cómo está repartida.** La cartera por título, sector y país, con un aviso cuando está
  concentrada.
- **Seguimiento.** Mapa de calor y tabla de precios de los títulos que seguís, con la variación de
  hoy y la de 3 meses, 1 año y 5 años.
- **Dividendos.** Lo que ya cobraste (estimado), lo que cobrarías en un año, el rendimiento sobre tu
  costo y las próximas fechas ex y de pago, que se pueden pasar a un calendario (`.ics`).
- **Mercado y dólar.** Dólar MEP, CCL, oficial y blue, los índices principales y una tabla de
  CEDEARs con el ratio y el dólar implícito de cada uno.
- **Plazo fijo y CD.** Plazo fijo (con renovaciones opcionales) y certificado de depósito: ponés
  monto, tasa y plazo, y te da los intereses y las tasas efectivas. Después muestra cuánto rinde de
  verdad contra la inflación, el dólar, las tasas de otros bancos y los bonos del Tesoro de EE.UU.
- **Noticias.** Titulares recientes de las empresas de tu lista.
- **Importar y respaldo.** Importá compras desde Excel o CSV, descargá un respaldo o pasá la
  cartera a otro dispositivo con un código QR cifrado.
- **En el celular.** Se puede agregar a la pantalla de inicio y abre sin conexión con los últimos
  precios que haya bajado.

## Datos y privacidad

- Los precios se actualizan cada 30 minutos mientras los mercados están abiertos, con unos
  15 minutos de demora. Fuentes: Yahoo Finance, DolarApi y ArgentinaDatos (que republica datos del
  INDEC y del BCRA).
- Tu cartera se guarda solo en tu navegador. No hay cuentas, ni servidor, ni cookies.
- Nada de esto es una recomendación de inversión.

## Para desarrolladores

Hecha con React, TypeScript y Vite; se publica con GitHub Pages y se actualiza con GitHub Actions.
La instalación, el circuito de datos y cómo sumar títulos o idiomas están en [`LEEME.md`](LEEME.md).
Para avisar de un problema de seguridad, mirá [`SECURITY.md`](SECURITY.md).

## Licencia

[MIT](LICENSE). Los datos de mercado y las noticias pertenecen a sus fuentes.
