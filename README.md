# Crypto Investment Dashboard

A single-page, dark-mode personal crypto dashboard for live BTC, ETH, and SOL
prices, long-term DCA projections, and short-term trading diary entries sized
with a strict 1% risk rule.

## Features

- Live CoinGecko price feed for Bitcoin, Ethereum, and Solana.
- Tailwind CSS powered dark UI with responsive dashboard cards.
- DCA calculator with monthly contribution, coin, horizon, and mock annual
  growth assumptions.
- Trading diary that stores entries locally in the browser and calculates
  position size from 1% account risk.

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
