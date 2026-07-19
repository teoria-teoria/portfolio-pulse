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

// worth a look sits under a fog: a fixed grid of headline cards, blurred and
// dimmed until your cursor passes over. the cursor carries a soft feathered
// light that clears the fog locally and reveals whatever is under it. click a
// card to open it (summary + read more), click out to close and let it fog over.
function renderWorthALook(matched) {
  const container = document.getElementById("worth-a-look");

  if (matched.length === 0) {
    container.innerHTML = '<p class="empty">nothing in today\'s feed matched the interest tags.</p>';
    return;
  }

  // loudest / freshest first, then a stable grid.
  matched.sort((a, b) => b.prominence - a.prominence);

  const tiles = matched
    .map((m, i) => {
      const cls = SENT_CLASS[m.sentiment] || "";
      const sum = m.summary ? `<p>${escapeHtml(m.summary)}</p>` : "";
      return `
      <button type="button" class="wal-tile ${cls}" data-i="${i}">
        <span class="wal-tile-head">${escapeHtml(m.headline)}</span>
        <div class="wal-tile-detail">
          ${sum}
          <div class="wal-tile-meta">
            ${m.source ? `<span class="src">${escapeHtml(m.source)}</span>` : ""}
            <a href="${m.url}" target="_blank" rel="noopener">read more</a>
          </div>
        </div>
      </button>`;
    })
    .join("");

  container.innerHTML =
    `<div class="wal-stage" id="wal-stage">
       <div class="wal-grid">${tiles}</div>
       <div class="wal-fog"></div>
     </div>
     <p class="wal-hint">move across to clear the fog. click a headline to open it.</p>`;

  wireWorthALook();
}

function wireWorthALook() {
  const stage = document.getElementById("wal-stage");
  if (!stage) return;

  stage.addEventListener("mousemove", (e) => {
    const r = stage.getBoundingClientRect();
    stage.style.setProperty("--mx", e.clientX - r.left + "px");
    stage.style.setProperty("--my", e.clientY - r.top + "px");
  });
  stage.addEventListener("mouseleave", () => {
    stage.style.setProperty("--mx", "-999px");
    stage.style.setProperty("--my", "-999px");
  });
  stage.addEventListener("click", (e) => {
    if (e.target.closest("a")) return; // let read-more navigate
    const tile = e.target.closest(".wal-tile");
    stage.querySelectorAll(".wal-tile.is-open").forEach((t) => {
      if (t !== tile) t.classList.remove("is-open");
    });
    if (tile) tile.classList.toggle("is-open");
  });
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
