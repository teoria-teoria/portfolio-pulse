# portfolio pulse

a personal stock dashboard for holdings i track by hand. live prices, news context on the days something moves, and a performance graph that carries the recent trend forward. final project for oim 3690 with zhi li at babson, summer 2026.

live: https://teoria-teoria.github.io/portfolio-pulse/

## screenshot

_screenshot placeholder. drop `screenshot.png` in the repo root, then uncomment the line below._

<!-- ![portfolio pulse dashboard](screenshot.png) -->

## what it does

- add a holding by ticker, shares, and cost basis. it saves to localStorage, so it survives a reload. edit or delete anytime.
- pulls a live quote per holding and shows gain or loss for each one plus a total. the total value is the big figure at the top. the daily move gets a green or red chip that deepens with the size of the move, so a small move reads as a pale tint and a big one as a saturated fill. outside market hours it labels prices "as of last close" instead of posing as live.
- a performance graph. one line of total value, ending at now on the right edge. day, week, month, 3mo, or max sets the window. max always runs from june 24, the start date, however far back that gets. the x axis is real dates (jun 24, jul 8) with reference marks at the quarter, half, and three quarter points so you can read a spot on the line against a day. a window of one day reads in hours instead. nothing is projected forward.
- when a holding moves 2 percent or more in a day, it pulls recent headlines for that ticker so a big move comes with context. with an OpenAI key set it also adds a one-line plain-english read on why it likely moved. those headlines cache per day so a refresh does not burn extra calls.
- a "worth a look" section scans the general market news feed against three interest tags. qsr, tech and ai, and edge computing. click a headline to expand a card color-coded by the language in it. green for bullish, red for bearish, blue for neutral. it is informational surfacing only, not advice.
- notes per holding. open a holding and you get a ledger of short timestamped entries about that one stock. "why i bought" as one entry, "sell trigger" as another, written months apart, each stamped with the date. entries save as you type, no save button, with a brief "saved" line so you know it landed. a ticker that has notes carries a small brass mark on its card in the grid.

## how notes are stored

one localStorage document per ticker.

```js
// key: "pp:notes:AAPL"
{
  v: 1,                      // schema version
  ticker: "AAPL",
  entries: [                 // chronological, oldest first
    {
      id: "uuid",
      label: "why i bought",
      body: "free text, newlines kept",
      created: 1753142400000, // epoch ms, the entry's stamp
      updated: 1753142400000  // equals created until you edit it
    }
  ]
}

// key: "pp:notes-draft:AAPL"
{ label: "", body: "" }      // the uncommitted composer, cleared once added
```

keyed by ticker, not by holding id. a thesis belongs to the company, not to one lot of it.

**deleting a holding does not delete its notes.** they stay in storage under the ticker. selling is when the record matters most, and delete is a routine action here, so losing a written thesis to a fix on a share count would be a bad surprise. re-add the ticker and the notes come back. the tradeoff is orphaned keys for stocks you no longer hold, which is cheap and easy to sweep later.

## which api

Finnhub (https://finnhub.io). free tier. three endpoints.

- `/quote` for live prices.
- `/company-news` for headlines on a mover.
- `/news?category=general` for the worth-a-look scan.

the free tier does not include historical candles. `/stock/candle` returns a 403, so the performance graph does not plot a real daily series. the endpoints are real, cost basis at the start and live value now. the shape between them is modeled, not history.

the mover blurb and the ask box use OpenAI (gpt-5-nano). optional. without a key the app just shows the raw headlines.

the ask box answers from the model's own knowledge by default and only flags stale data when the question actually needs something live. when you ask about a ticker the app has already pulled headlines for, those real headlines go into the prompt as context and the answer says it was grounded in them.

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
