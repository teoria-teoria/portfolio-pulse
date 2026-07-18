// news layer. two jobs: headlines for holdings that made a big move today, and
// the "worth a look" scan of general market news against a few interest tags.

const MOVER_THRESHOLD = 2; // percent, absolute
const MOVER_NEWS_DAYS = 4; // how far back to pull company news

state.moverNews = {};       // ticker -> [ {headline, url, source} ]
const newsInFlight = new Set();

// ---- news on big movers ---------------------------------------------------

function moverTickers() {
  return uniqueTickers().filter((t) => {
    const q = state.quotes[t];
    return q && typeof q.dp === "number" && Math.abs(q.dp) >= MOVER_THRESHOLD;
  });
}

async function loadMoverNews() {
  const movers = moverTickers();
  const today = todayET();

  for (const ticker of movers) {
    if (state.moverNews[ticker]) continue; // already have it this session
    if (newsInFlight.has(ticker)) continue;

    // cache-first so a refresh within the same day does not refetch.
    const cached = getCachedNews(ticker, today);
    if (cached) {
      state.moverNews[ticker] = cached;
      continue;
    }

    newsInFlight.add(ticker);
    try {
      const items = await fetchCompanyNews(ticker, daysAgoET(MOVER_NEWS_DAYS), today);
      const trimmed = (items || [])
        .filter((n) => n && n.headline && n.url)
        .slice(0, 3)
        .map((n) => ({ headline: n.headline, url: n.url, source: n.source || "" }));
      state.moverNews[ticker] = trimmed;
      setCachedNews(ticker, today, trimmed);
    } catch (e) {
      // a news failure should not break the price view. leave it out.
      state.moverNews[ticker] = [];
    } finally {
      newsInFlight.delete(ticker);
    }
  }

  renderMoverNews();
}

// inject a news panel under each mover row. called after the table renders.
function renderMoverNews() {
  if (!state.moverNews) return;
  // drop any stale news rows first so re-renders do not stack.
  document.querySelectorAll("#holdings-body .news-row").forEach((r) => r.remove());

  for (const h of state.holdings) {
    const q = state.quotes[h.ticker];
    if (!q || typeof q.dp !== "number" || Math.abs(q.dp) < MOVER_THRESHOLD) continue;
    const items = state.moverNews[h.ticker];
    if (!items || items.length === 0) continue;

    const row = document.querySelector(`#holdings-body tr[data-id="${h.id}"]`);
    if (!row) continue;

    const dir = q.dp >= 0 ? "up" : "down";
    const list = items
      .map(
        (n) =>
          `<li><a href="${n.url}" target="_blank" rel="noopener">${escapeHtml(n.headline)}</a>` +
          (n.source ? ` <span class="src">${escapeHtml(n.source)}</span>` : "") +
          `</li>`
      )
      .join("");

    const newsRow = document.createElement("tr");
    newsRow.className = "news-row";
    newsRow.innerHTML = `
      <td colspan="8">
        <div class="mover-news">
          <div class="mover-tag">${h.ticker} moved <span class="${dir}">${fmtPct(q.dp)}</span> today. recent headlines:</div>
          <div class="mover-blurb" data-ticker="${h.ticker}" hidden></div>
          <ul>${list}</ul>
        </div>
      </td>`;
    row.insertAdjacentElement("afterend", newsRow);
  }

  // layer the ai one-liner on top of the headlines where a key is set.
  if (typeof renderMoverBlurbs === "function") renderMoverBlurbs();
}

// ---- worth a look ---------------------------------------------------------

// three fixed interest tags. finnhub cannot filter by a custom theme, so the
// matching happens here in js against the headline and summary text.
const INTEREST_TAGS = [
  {
    label: "qsr",
    keywords: ["qsr", "quick service", "fast food", "restaurant", "restaurants",
      "drive-thru", "drive thru", "chipotle", "mcdonald", "starbucks", "yum brands",
      "restaurant brands", "wingstop", "shake shack"]
  },
  {
    label: "tech / ai",
    keywords: ["ai", "artificial intelligence", "machine learning", "generative ai",
      "semiconductor", "semiconductors", "chip", "chips", "gpu", "gpus", "nvidia",
      "openai", "llm", "data center", "data centers"]
  },
  {
    label: "edge computing",
    keywords: ["edge computing", "edge ai", "edge network", "iot", "internet of things",
      "5g", "cdn", "content delivery", "cloudflare", "fastly", "low latency"]
  }
];

// precompile a word-boundary regex per keyword so "ai" matches the standalone
// word and not "email" or "chair".
const COMPILED_TAGS = INTEREST_TAGS.map((tag) => ({
  label: tag.label,
  patterns: tag.keywords.map((kw) => new RegExp("\\b" + escapeRegex(kw) + "\\b", "i"))
}));

function matchTag(text) {
  for (const tag of COMPILED_TAGS) {
    if (tag.patterns.some((re) => re.test(text))) return tag.label;
  }
  return null;
}

// ---- directional classification -------------------------------------------

// same idea as the interest tags: keyword matching in js against the headline
// and summary text. not a finnhub field. it reads the language, not the price,
// so it is informational surfacing only, never a buy or sell call.
const SENTIMENT_WORDS = {
  bullish: ["surge", "surges", "soar", "soars", "rally", "rallies", "jump", "jumps",
    "gain", "gains", "beat", "beats", "upgrade", "upgraded", "record", "growth",
    "profit", "profits", "outperform", "bullish", "boost", "boosts", "win", "wins",
    "strong", "rise", "rises", "rose", "climb", "climbs", "tops", "rebound",
    "raises", "raised", "high", "higher", "optimistic", "upbeat"],
  bearish: ["plunge", "plunges", "plummet", "plummets", "fall", "falls", "fell",
    "drop", "drops", "sink", "sinks", "tumble", "tumbles", "slump", "slumps",
    "miss", "misses", "downgrade", "downgraded", "cut", "cuts", "loss", "losses",
    "weak", "warn", "warns", "warning", "lawsuit", "probe", "investigation",
    "recall", "layoff", "layoffs", "bearish", "decline", "declines", "slash",
    "fears", "crash", "selloff", "sell-off", "bankruptcy", "default", "lower", "sue"]
};

const COMPILED_SENTIMENT = {
  bullish: SENTIMENT_WORDS.bullish.map((w) => new RegExp("\\b" + escapeRegex(w) + "\\b", "i")),
  bearish: SENTIMENT_WORDS.bearish.map((w) => new RegExp("\\b" + escapeRegex(w) + "\\b", "i"))
};

// green for bullish language, red for bearish, blue for neutral. the side with
// more keyword hits wins. a tie or nothing matched reads neutral.
function classify(text) {
  const bull = COMPILED_SENTIMENT.bullish.reduce((c, re) => c + (re.test(text) ? 1 : 0), 0);
  const bear = COMPILED_SENTIMENT.bearish.reduce((c, re) => c + (re.test(text) ? 1 : 0), 0);
  if (bull > bear) return "bullish";
  if (bear > bull) return "bearish";
  return "neutral";
}

const SENTIMENT_LABEL = {
  bullish: "bullish language",
  neutral: "neutral / informational",
  bearish: "bearish language"
};

const WAL_MAX = 8;

async function loadWorthALook() {
  const container = document.getElementById("worth-a-look");
  container.innerHTML = '<p class="empty">scanning market news...</p>';

  let items;
  try {
    items = await fetchGeneralNews();
  } catch (e) {
    container.innerHTML = `<p class="empty">could not load market news. ${escapeHtml(e.message)}</p>`;
    return;
  }

  const matched = [];
  for (const n of items || []) {
    if (!n || !n.headline || !n.url) continue;
    const text = n.headline + " " + (n.summary || "");
    const tag = matchTag(text);
    if (!tag) continue;
    matched.push({
      tag,
      headline: n.headline,
      url: n.url,
      source: n.source || "",
      summary: n.summary || "",
      sentiment: classify(text)
    });
    if (matched.length >= WAL_MAX) break;
  }

  renderWorthALook(matched);
}

function renderWorthALook(matched) {
  const container = document.getElementById("worth-a-look");
  if (matched.length === 0) {
    container.innerHTML = '<p class="empty">nothing in today\'s feed matched the interest tags.</p>';
    return;
  }
  container.innerHTML = matched
    .map((m, i) => {
      const s = m.sentiment;
      const summary = m.summary
        ? `<p class="wal-full-summary">${escapeHtml(m.summary)}</p>`
        : "";
      return `
      <div class="wal-card s-${s}" data-i="${i}">
        <button type="button" class="wal-summary" aria-expanded="false" data-i="${i}">
          <span class="wal-tag">${escapeHtml(m.tag)}</span>
          <span class="wal-headline">${escapeHtml(m.headline)}</span>
          <span class="wal-caret" aria-hidden="true">+</span>
        </button>
        <div class="wal-detail" id="wal-detail-${i}" hidden>
          <span class="wal-class s-${s}">${escapeHtml(SENTIMENT_LABEL[s])}</span>
          <p class="wal-full">${escapeHtml(m.headline)}</p>
          ${summary}
          <div class="wal-meta">
            ${m.source ? `<span class="src">${escapeHtml(m.source)}</span>` : ""}
            <a href="${m.url}" target="_blank" rel="noopener">read the story</a>
          </div>
          <p class="wal-disclaimer">classified by the language in the headline. informational surfacing only, not a buy or sell call.</p>
        </div>
      </div>`;
    })
    .join("");
}

// expand or collapse a card on click. event delegation on the container so it
// survives re-renders.
document.getElementById("worth-a-look").addEventListener("click", (e) => {
  const btn = e.target.closest(".wal-summary");
  if (!btn) return;
  const card = btn.closest(".wal-card");
  const detail = card.querySelector(".wal-detail");
  const open = detail.hidden;
  detail.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
  card.classList.toggle("is-open", open);
  const caret = btn.querySelector(".wal-caret");
  if (caret) caret.textContent = open ? "−" : "+"; // minus / plus
});

// ---- helpers --------------------------------------------------------------

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
