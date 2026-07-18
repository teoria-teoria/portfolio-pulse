# portfolio pulse

a personal stock dashboard for holdings i track by hand. live prices, news context on the days something moves, and a performance graph that carries the recent trend forward. final project for oim 3690 with zhi li at babson, summer 2026.

live: https://teoria-teoria.github.io/portfolio-pulse/

## screenshot

_screenshot placeholder. drop `screenshot.png` in the repo root, then uncomment the line below._

<!-- ![portfolio pulse dashboard](screenshot.png) -->

## what it does

- add a holding by ticker, shares, and cost basis. it saves to localStorage, so it survives a reload. edit or delete anytime.
- pulls a live quote per holding and shows gain or loss for each one plus a total. the total value is the big figure at the top. the daily move gets a green or red chip that deepens with the size of the move, so a small move reads as a pale tint and a big one as a saturated fill. outside market hours it labels prices "as of last close" instead of posing as live.
- a performance graph. one continuous line of total value. the solid part is to date and the dashed part projects the same observed trend an equal window forward. a day, week, or month selector sets the window.
- when a holding moves 2 percent or more in a day, it pulls recent headlines for that ticker so a big move comes with context. with an OpenAI key set it also adds a one-line plain-english read on why it likely moved. those headlines cache per day so a refresh does not burn extra calls.
- a "worth a look" section scans the general market news feed against three interest tags. qsr, tech and ai, and edge computing. click a headline to expand a card color-coded by the language in it. green for bullish, red for bearish, blue for neutral. it is informational surfacing only, not advice.

## which api

Finnhub (https://finnhub.io). free tier. three endpoints.

- `/quote` for live prices.
- `/company-news` for headlines on a mover.
- `/news?category=general` for the worth-a-look scan.

the free tier does not include historical candles. `/stock/candle` returns a 403, so the performance graph does not plot a real daily series. it anchors on each holding's live previous close and current price, both real, and carries that observed move across the window. the projection is an estimate, not a forecast.

the mover blurb uses OpenAI (gpt-5-nano). it is optional. without a key the app just shows the raw headlines.

no key is in the repo. both keys live in a `config.js` that stays gitignored. to run this yourself, get a free Finnhub key at finnhub.io and add it. the OpenAI key is optional:

```js
// config.js
const FINNHUB_API_KEY = "your-finnhub-key-here";
const OPENAI_API_KEY = "your-openai-key-here"; // optional, for the mover blurb
```

on the deployed site there is no config.js, so you paste either key into the runtime field on the page instead. it stays in your browser's localStorage and is never committed. the Finnhub key goes only to Finnhub, the OpenAI key only to OpenAI.

then serve the folder over http (a plain file open will not run the fetch calls) and open index.html.

## a note on scope

this is a manual-entry tool. it is not connected to any brokerage. nothing here places trades or reads a real account. you type in what you hold and it shows prices and context around it. no buy or sell calls anywhere.

## stack

vanilla JavaScript, no framework, no build step. one canvas graph drawn by hand instead of a chart library. deployed on GitHub pages.
