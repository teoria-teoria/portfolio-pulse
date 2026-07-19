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

function sentimentCounts(text) {
  const bull = COMPILED_SENTIMENT.bullish.reduce((c, re) => c + (re.test(text) ? 1 : 0), 0);
  const bear = COMPILED_SENTIMENT.bearish.reduce((c, re) => c + (re.test(text) ? 1 : 0), 0);
  return { bull, bear };
}

function classify(text) {
  const { bull, bear } = sentimentCounts(text);
  if (bull > bear) return "bullish";
  if (bear > bull) return "bearish";
  return "neutral";
}

// bullish reads moss (up), bearish reads brick (down), neutral stays plain ink.
const SENT_CLASS = { bullish: "up", bearish: "down", neutral: "" };

const WAL_MAX = 10;

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

  const raw = items || [];
  const matched = [];
  for (let i = 0; i < raw.length; i++) {
    const n = raw[i];
    if (!n || !n.headline || !n.url) continue;
    const text = n.headline + " " + (n.summary || "");
    const tag = matchTag(text);
    if (!tag) continue;
    const { bull, bear } = sentimentCounts(text);
    const sentiment = bull > bear ? "bullish" : bear > bull ? "bearish" : "neutral";
    // prominence: how loud the language is, plus how fresh (earlier in the feed).
    const recency = Math.max(0, (raw.length - i) / raw.length);
    const prominence = (bull + bear) * 1.5 + recency * 1.1 + 0.4;
    matched.push({
      headline: n.headline,
      url: n.url,
      source: n.source || "",
      summary: n.summary || "",
      sentiment,
      prominence
    });
    if (matched.length >= WAL_MAX) break;
  }

  renderWorthALook(matched);
}

// a floating map of headlines. size scales with prominence, sentiment shows as
// text color, a slight per-item vertical offset breaks the grid. hovering a
// headline expands a detail card and dims the rest. no pills, no dots, no click
// to expand. too few headlines to read as a map falls back to a plain list.
function renderWorthALook(matched) {
  const container = document.getElementById("worth-a-look");

  if (matched.length === 0) {
    container.innerHTML = '<p class="empty">nothing in today\'s feed matched the interest tags.</p>';
    return;
  }

  if (matched.length < 3) {
    container.innerHTML =
      '<ul class="wal-list">' +
      matched
        .map((m) =>
          `<li><a href="${m.url}" target="_blank" rel="noopener">${escapeHtml(m.headline)}</a>` +
          (m.source ? ` <span class="src">${escapeHtml(m.source)}</span>` : "") + "</li>")
        .join("") +
      "</ul>";
    return;
  }

  const maxProm = matched.reduce((mx, x) => Math.max(mx, x.prominence), 0.0001);

  const nodes = matched
    .map((m, i) => {
      const size = (0.95 + (m.prominence / maxProm) * 0.95).toFixed(2); // 0.95..1.9rem
      const jitter = Math.round(Math.sin(i * 1.7) * 7); // -7..7px, deterministic
      const cls = SENT_CLASS[m.sentiment] || "";
      const sum = m.summary ? `<p class="wal-pop-sum">${escapeHtml(m.summary)}</p>` : "";
      return `
      <div class="wal-node" style="transform: translateY(${jitter}px);">
        <a class="wal-node-head ${cls}" href="${m.url}" target="_blank" rel="noopener" style="font-size:${size}rem;">${escapeHtml(m.headline)}</a>
        <div class="wal-pop">
          ${sum}
          <div class="wal-pop-meta">
            ${m.source ? `<span class="src">${escapeHtml(m.source)}</span>` : ""}
            <a href="${m.url}" target="_blank" rel="noopener">read</a>
          </div>
        </div>
      </div>`;
    })
    .join("");

  container.innerHTML = `<div class="wal-map">${nodes}</div>`;
}

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
