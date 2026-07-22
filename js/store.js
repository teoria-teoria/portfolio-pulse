// localStorage wrapper. holdings live here, plus a per-day news cache so a page
// refresh does not burn extra finnhub calls, plus the per-ticker notes ledger.

const HOLDINGS_KEY = "pp:holdings";
const NEWS_PREFIX = "pp:news:";
const NOTES_PREFIX = "pp:notes:";
const NOTES_DRAFT_PREFIX = "pp:notes-draft:";
const NOTES_VERSION = 1;

function loadHoldings() {
  try {
    const raw = localStorage.getItem(HOLDINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveHoldings(holdings) {
  localStorage.setItem(HOLDINGS_KEY, JSON.stringify(holdings));
}

// news cache is keyed by ticker + date, so it is fresh each day and reused
// within the same day across refreshes.
function newsCacheKey(ticker, dateStr) {
  return NEWS_PREFIX + ticker + ":" + dateStr;
}

function getCachedNews(ticker, dateStr) {
  try {
    const raw = localStorage.getItem(newsCacheKey(ticker, dateStr));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setCachedNews(ticker, dateStr, items) {
  try {
    localStorage.setItem(newsCacheKey(ticker, dateStr), JSON.stringify(items));
  } catch (e) {
    // storage full or blocked. skip the cache, the app still works.
  }
}

// every ticker that has news cached in this browser, with the newest cache date
// held for each. lets the ask box ground an answer in headlines the app already
// pulled instead of answering blind.
function cachedNewsTickers() {
  const byTicker = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key.indexOf(NEWS_PREFIX) !== 0) continue;
      const rest = key.slice(NEWS_PREFIX.length);
      const split = rest.lastIndexOf(":");
      if (split <= 0) continue;
      const ticker = rest.slice(0, split);
      const dateStr = rest.slice(split + 1);
      if (!byTicker[ticker] || byTicker[ticker].dateStr < dateStr) {
        byTicker[ticker] = { ticker, dateStr };
      }
    }
  } catch (e) {
    return [];
  }
  return Object.keys(byTicker).map((t) => byTicker[t]);
}

// the most recent cached headlines for one ticker, or null if none were pulled.
function latestCachedNews(ticker) {
  const t = String(ticker).toUpperCase();
  const hit = cachedNewsTickers().find((c) => c.ticker === t);
  if (!hit) return null;
  const items = getCachedNews(hit.ticker, hit.dateStr);
  if (!items || !items.length) return null;
  return { ticker: hit.ticker, dateStr: hit.dateStr, items };
}

// ---- notes ----------------------------------------------------------------
//
// schema, so later features can build on it without guessing.
//
//   key    "pp:notes:<TICKER>"        one document per ticker, uppercase
//   value  {
//            v: 1,                    schema version, bump on a breaking change
//            ticker: "AAPL",          denormalized so a dumped value stands alone
//            entries: [               chronological, oldest first
//              {
//                id: "uuid",          stable, survives edits and reorders
//                label: "why i bought",
//                body: "free text, newlines preserved",
//                created: 1753142400000,   epoch ms, the entry's timestamp
//                updated: 1753142400000    epoch ms, equals created until edited
//              }
//            ]
//          }
//
//   key    "pp:notes-draft:<TICKER>"  the uncommitted composer contents
//   value  { label: "", body: "" }    cleared once the entry is added
//
// keyed by ticker rather than by holding id on purpose. a thesis belongs to the
// company, not to one lot of it, so notes survive selling and re-adding the same
// stock and are shared across duplicate positions in the same ticker. deleting a
// holding deliberately leaves its notes in place (see the README).

function notesKey(ticker) {
  return NOTES_PREFIX + String(ticker).toUpperCase();
}

function notesDraftKey(ticker) {
  return NOTES_DRAFT_PREFIX + String(ticker).toUpperCase();
}

function loadNotes(ticker) {
  try {
    const raw = localStorage.getItem(notesKey(ticker));
    if (!raw) return [];
    const doc = JSON.parse(raw);
    return Array.isArray(doc.entries) ? doc.entries : [];
  } catch (e) {
    return [];
  }
}

// returns false when the write fails so the ui can say so instead of pretending.
function saveNotes(ticker, entries) {
  const t = String(ticker).toUpperCase();
  try {
    if (!entries || entries.length === 0) {
      localStorage.removeItem(notesKey(t));
      return true;
    }
    localStorage.setItem(notesKey(t), JSON.stringify({ v: NOTES_VERSION, ticker: t, entries }));
    return true;
  } catch (e) {
    return false;
  }
}

function hasNotes(ticker) {
  return loadNotes(ticker).length > 0;
}

function loadNoteDraft(ticker) {
  try {
    const raw = localStorage.getItem(notesDraftKey(ticker));
    const d = raw ? JSON.parse(raw) : null;
    return { label: (d && d.label) || "", body: (d && d.body) || "" };
  } catch (e) {
    return { label: "", body: "" };
  }
}

function saveNoteDraft(ticker, draft) {
  try {
    if (!draft.label && !draft.body) {
      localStorage.removeItem(notesDraftKey(ticker));
      return true;
    }
    localStorage.setItem(notesDraftKey(ticker), JSON.stringify(draft));
    return true;
  } catch (e) {
    return false;
  }
}

function clearNoteDraft(ticker) {
  try {
    localStorage.removeItem(notesDraftKey(ticker));
  } catch (e) {}
}
