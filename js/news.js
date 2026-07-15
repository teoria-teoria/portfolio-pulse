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
          <ul>${list}</ul>
        </div>
      </td>`;
    row.insertAdjacentElement("afterend", newsRow);
  }
}

// ---- helpers --------------------------------------------------------------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
