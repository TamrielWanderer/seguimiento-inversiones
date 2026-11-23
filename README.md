# Seguimiento de inversiones

A free investment tracker for people who invest from Argentina: US stocks, CEDEARs, local shares
and Australian stocks, valued in dollars and pesos with the MEP dollar rate.

**Open the app:** https://tamrielwanderer.github.io/seguimiento-inversiones/

It runs in the browser, needs no account, works in Spanish and English, and has a dark and a
light mode.

## What it does

- **Portfolio.** Record each purchase with its date and it shows cost, current value and result in
  dollars and in pesos, using the MEP rate of the purchase date. Supports sales (oldest purchases
  sold first), fees, several portfolios, and other assets such as bonds, funds or cash.
- **Performance chart.** Your portfolio over time, compared with putting the same money on the same
  dates into the S&P 500.
- **Allocation.** How the portfolio is split by holding, sector and country, with a warning when it
  is concentrated.
- **Watchlist.** A heat map and price table for the tickers you follow, with today's change and
  the change over 3 months, 1 year and 5 years.
- **Dividends.** Estimated dividends collected so far, expected income for the next year, yield on
  cost, and upcoming ex-dates and payment dates, which can be exported to a calendar (`.ics`).
- **Market and dollar.** MEP, CCL, official and blue dollar rates, main indices, and a CEDEAR table
  with ratios and the implied dollar rate of each one.
- **Deposit calculator.** Fixed-term deposits (plazo fijo, with optional renewals) and certificates
  of deposit: amount, rate and term in, interest and effective rates out.
- **News.** Recent headlines for the companies on your list.
- **Import and backup.** Import purchases from Excel or CSV, download a backup file, or move the
  portfolio to another device with an encrypted QR code.
- **On your phone.** Can be added to the home screen and opens offline with the last prices it
  downloaded.

## Data and privacy

- Prices update about every 30 minutes while markets are open, with a delay of roughly 15 minutes.
  Sources: Yahoo Finance, DolarApi and ArgentinaDatos.
- Your portfolio is stored only in your browser. There are no accounts, no server and no cookies.
- Nothing here is investment advice.

## For developers

Built with React, TypeScript and Vite; published with GitHub Pages and updated by GitHub Actions.
Setup, data pipeline and how to add tickers or languages are in [`LEEME.md`](LEEME.md) (Spanish).
To report a security problem, see [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE). Market data and news belong to their sources.
