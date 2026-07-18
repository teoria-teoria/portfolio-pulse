// worth a look. scans the general market news feed against a few interest tags,
// then reads the language of each match to color it bullish, neutral, or bearish.
// all client-side keyword matching, not a finnhub field, so it is informational
// surfacing only, never a buy or sell call.

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

function classify(text) {
  const bull = COMPILED_SENTIMENT.bullish.reduce((c, re) => c + (re.test(text) ? 1 : 0), 0);
  const bear = COMPILED_SENTIMENT.bearish.reduce((c, re) => c + (re.test(text) ? 1 : 0), 0);
  if (bull > bear) return "bullish";
  if (bear > bull) return "bearish";
  return "neutral";
}

const SENTIMENT_LABEL = { bullish: "bullish", neutral: "neutral", bearish: "bearish" };

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
      const summary = m.summary ? `<p class="wal-summary-text">${escapeHtml(m.summary)}</p>` : "";
      return `
      <div class="wal-card s-${s}" data-i="${i}">
        <button type="button" class="wal-row" aria-expanded="false">
          <span class="wal-dot s-${s}" title="${SENTIMENT_LABEL[s]}"></span>
          <span class="wal-headline">${escapeHtml(m.headline)}</span>
          <span class="wal-tag">${escapeHtml(m.tag)}</span>
        </button>
        <div class="wal-detail" hidden>
          ${summary}
          <div class="wal-meta">
            <span class="wal-class s-${s}">${escapeHtml(SENTIMENT_LABEL[s])}</span>
            ${m.source ? `<span class="src">${escapeHtml(m.source)}</span>` : ""}
            <a href="${m.url}" target="_blank" rel="noopener">read</a>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

// expand or collapse a card on click. event delegation on the container so it
// survives re-renders.
document.getElementById("worth-a-look").addEventListener("click", (e) => {
  const row = e.target.closest(".wal-row");
  if (!row) return;
  const card = row.closest(".wal-card");
  const detail = card.querySelector(".wal-detail");
  const open = detail.hidden;
  detail.hidden = !open;
  row.setAttribute("aria-expanded", String(open));
  card.classList.toggle("is-open", open);
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
