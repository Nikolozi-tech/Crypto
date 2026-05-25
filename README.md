# Business Crypto Treasury Dashboard

A single-page, dark-mode business crypto treasury dashboard for live BTC,
ETH, and SOL prices, recurring allocation scenarios, and tactical execution
entries sized with a strict 1% capital-risk rule.

## Features

- Live CoinGecko price feed for Bitcoin, Ethereum, and Solana.
- Tailwind CSS powered dark UI with responsive dashboard cards.
- Treasury allocation model with monthly budget, coin, horizon, and assumed
  annual growth inputs.
- Execution risk register that stores entries locally in the browser and
  calculates position size from 1% treasury account risk.

## Development

This project is a Vite React app, so do not open `index.html` directly. From VS
Code, open the project folder, then run these commands in the integrated
terminal:

```bash
npm install
npm run dev
```

Open the local URL that Vite prints, usually `http://localhost:5173/`. If the
page is blank, check that you are using that localhost URL instead of a
`file://` path or the VS Code Live Server extension.

## Production build

```bash
npm run build
```
