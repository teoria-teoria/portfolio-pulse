// the ai bits. two uses. a per-stock "recent news" read inside the holding
// modal, and the ask box under worth a look for quick questions.
//
// key handling mirrors the finnhub side and oim3690's ai-chat. the key can come
// from a gitignored config.js (OPENAI_API_KEY) when running locally, or from a
// runtime field held in localStorage on the deployed site. never committed.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-5-nano";
const OPENAI_KEY_STORAGE = "pp:openai-key";

function getOpenAIKey() {
  if (typeof OPENAI_API_KEY !== "undefined" && OPENAI_API_KEY && OPENAI_API_KEY.indexOf("PASTE") !== 0) {
    return OPENAI_API_KEY;
  }
  return localStorage.getItem(OPENAI_KEY_STORAGE) || null;
}

function hasOpenAIKey() {
  return !!getOpenAIKey();
}

// one concise completion. throws on any failure so callers can fall back.
async function openaiConcise(system, user) {
  const key = getOpenAIKey();
  if (!key) throw new Error("no openai key set.");

  let res;
  try {
    res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });
  } catch (e) {
    throw new Error("network error reaching openai.");
  }

  if (!res.ok) {
    let msg = "openai http " + res.status;
    try {
      const j = await res.json();
      if (j && j.error && j.error.message) msg = j.error.message;
    } catch (e) { /* no json body */ }
    throw new Error(msg);
  }

  const data = await res.json();
  const text =
    data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text || !text.trim()) throw new Error("empty response from openai.");
  return text.trim();
}

// ---- per-stock recent news (holding modal) --------------------------------

async function askStockNews(ticker, container) {
  if (!container) return;
  container.innerHTML = '<p class="hm-news-loading">pulling recent news...</p>';

  let items = [];
  try {
    items = await getTickerNews(ticker);
  } catch (e) {
    container.innerHTML = `<p class="hm-news-empty">could not load news. ${escapeHtml(e.message)}</p>`;
    return;
  }

  if (!items.length) {
    container.innerHTML = '<p class="hm-news-empty">no recent headlines for ' + escapeHtml(ticker) + ".</p>";
    return;
  }

  const headlinesHtml = items
    .map((n) =>
      `<li><a href="${n.url}" target="_blank" rel="noopener">${escapeHtml(n.headline)}</a>` +
      (n.source ? ` <span class="src">${escapeHtml(n.source)}</span>` : "") + "</li>")
    .join("");

  // no key: just the raw headlines, and offer the key field.
  if (!hasOpenAIKey()) {
    revealAiKeyBar();
    container.innerHTML = `<ul class="hm-news-list">${headlinesHtml}</ul>`;
    return;
  }

  container.innerHTML = `<p class="hm-news-loading">reading the headlines...</p><ul class="hm-news-list">${headlinesHtml}</ul>`;
  try {
    const sentence = await openaiConcise(
      "you summarize what is going on with a stock in one or two plain sentences, based only on the headlines given. no advice, no buy or sell language.",
      "what is happening with " + ticker + " based on these headlines:\n" +
        items.map((n) => "- " + n.headline).join("\n")
    );
    container.innerHTML =
      `<div class="hm-ai"><span class="blurb-label">the read</span><span class="blurb-text">${escapeHtml(sentence)}</span></div>` +
      `<ul class="hm-news-list">${headlinesHtml}</ul>`;
  } catch (e) {
    // keep the raw headlines, they are the fallback.
    container.innerHTML = `<ul class="hm-news-list">${headlinesHtml}</ul>`;
  }
}

// ---- ask box (concise q&a) ------------------------------------------------

// the model knows a great deal about public companies already. the old prompt
// let it hide behind "i have no live data" for questions like "how was meta's
// last earnings", which it can answer perfectly well. this one makes answering
// the default and the caveat the exception, and tells it to lean on the real
// headlines when the app has any for the ticker being asked about.
const ASK_SYSTEM = [
  "you answer investing and finance questions for someone looking at their own portfolio dashboard.",
  "",
  "every message includes their current portfolio, live from the dashboard: every holding, share count, cost basis, price, dollar value, weight as a percent, today's move, and total gain or loss. treat it as fact and use it. never ask what they hold, never ask for tickers or weights, never say you cannot see their portfolio. it is right there in the message.",
  "",
  "when they ask you to judge the portfolio, judge it. name the actual tickers and weights. you know what these companies do, so group them into sectors yourself and say where they are concentrated, what overlaps, and what is missing. be concrete: \"NVDA and AAPL are 88% of you and both ride the same ai and consumer hardware cycle\" beats a list of sectors a portfolio could theoretically hold. do not hedge a real observation into uselessness.",
  "",
  "the message may also include real headlines the app pulled, for specific tickers and for the market. ground your answer in them and say what they show. if a holding moved and the headlines explain it, connect the two and name the headline.",
  "",
  "answer from your own knowledge for everything else. you know a great deal about public companies, their businesses, their financials, and how their past earnings went. be specific. do not open with a refusal, and do not use \"i have no live data\" to dodge a question you can actually answer.",
  "",
  "only caveat when the question truly needs something you cannot know: a price move the headlines do not cover, or anything after your training cutoff. even then answer first, then note in a few words that the figure may be stale.",
  "",
  "keep it tight, two to five plain sentences. lowercase is fine. this is general information, not personalized financial advice, but say that only when they are actually asking what to buy or sell."
].join("\n");

// ---- what the model gets to see -------------------------------------------

// the live portfolio, as the dashboard has it right now. this rides along with
// every question. the model was asking "what do you hold?" while the page was
// rendering the answer three inches above the input box.
function portfolioSnapshot() {
  if (!state.holdings.length) return "my portfolio: empty, nothing added yet.";

  let totalValue = 0, pricedCost = 0, totalCost = 0, dayChange = 0;
  for (const h of state.holdings) {
    totalCost += costTotal(h);
    const mv = marketValue(h);
    if (mv === null) continue;
    totalValue += mv;
    pricedCost += costTotal(h);
    const q = state.quotes[h.ticker];
    if (typeof q.pc === "number") dayChange += h.shares * (q.c - q.pc);
  }

  const lines = state.holdings.map((h) => {
    const q = state.quotes[h.ticker];
    const mv = marketValue(h);
    if (mv === null) {
      return "- " + h.ticker + ": " + h.shares + " sh at " + fmtMoney(h.cost) +
        " cost basis. no live price in yet.";
    }
    const weight = totalValue > 0 ? (mv / totalValue) * 100 : 0;
    const g = gain(h);
    const gp = gainPctVal(h);
    return "- " + h.ticker + ": " + h.shares + " sh, cost basis " + fmtMoney(h.cost) +
      "/sh, price " + fmtMoney(q.c) +
      ", value " + fmtMoney(mv) +
      ", " + weight.toFixed(1) + "% of the portfolio" +
      ", today " + fmtPct(q.dp) +
      ", total " + fmtSignedMoney(g) + (gp !== null ? " (" + fmtPct(gp) + ")" : "");
  });

  const totalGain = totalValue - pricedCost;
  const totalGainPct = pricedCost > 0 ? (totalGain / pricedCost) * 100 : 0;

  return "my portfolio right now, live from the dashboard:\n" +
    "total value " + fmtMoney(totalValue) +
    ", cost basis " + fmtMoney(totalCost) +
    ", total gain/loss " + fmtSignedMoney(totalGain) + " (" + fmtPct(totalGainPct) + ")" +
    ", today " + fmtSignedMoney(dayChange) + "\n" +
    lines.join("\n");
}

// the market headlines the worth-a-look panel is showing.
function marketHeadlines() {
  if (!worthALookItems || !worthALookItems.length) return null;
  return "market headlines the app pulled today:\n" +
    worthALookItems.slice(0, 10)
      .map((m) => "- " + m.headline + (m.source ? " (" + m.source + ")" : ""))
      .join("\n");
}

// headlines for one ticker, from the day's cache or freshly pulled. shared with
// the holding modal so both paths hit the same cache and never double-fetch.
async function getTickerNews(ticker) {
  const today = todayET();
  const cached = getCachedNews(ticker, today);
  if (cached) return cached;
  const raw = await fetchCompanyNews(ticker, daysAgoET(5), today);
  const items = (raw || [])
    .filter((n) => n && n.headline && n.url)
    .slice(0, 4)
    .map((n) => ({ headline: n.headline, url: n.url, source: n.source || "" }));
  setCachedNews(ticker, today, items);
  return items;
}

// tickers the question names. limited to ones this app actually knows about,
// the holdings plus anything already cached, so a stray word like "it" or "on"
// is never mistaken for a symbol.
function tickersInQuestion(question) {
  const known = new Set(state.holdings.map((h) => h.ticker.toUpperCase()));
  cachedNewsTickers().forEach((c) => known.add(c.ticker));
  return [...known].filter((t) =>
    new RegExp("\\b" + escapeRegex(t) + "\\b", "i").test(question));
}

// ask about a holding and the app goes and gets that ticker's headlines if it
// does not already have today's. one finnhub call, cached for the rest of the
// day, so "why is nvda down" can actually be answered from real news.
async function tickerNewsBlocks(question) {
  const blocks = [];
  for (const ticker of tickersInQuestion(question)) {
    let items = null;
    try {
      items = await getTickerNews(ticker);
    } catch (e) {
      items = null; // finnhub down or rate limited. carry on without it.
    }
    if (!items || !items.length) continue;
    blocks.push({
      ticker,
      text: "recent headlines for " + ticker + ":\n" +
        items.map((n) => "- " + n.headline + (n.source ? " (" + n.source + ")" : "")).join("\n")
    });
  }
  return blocks;
}

// the question with everything the app knows bolted underneath it.
async function buildAskContent(question) {
  const parts = [question, portfolioSnapshot()];
  const used = ["your portfolio"];

  const tickerBlocks = await tickerNewsBlocks(question);
  tickerBlocks.forEach((b) => {
    parts.push(b.text);
    used.push(b.ticker + " headlines");
  });

  const market = marketHeadlines();
  if (market) {
    parts.push(market);
    used.push("market headlines");
  }

  return { content: parts.join("\n\n"), used };
}

const askForm = document.getElementById("ask-form");
const askInput = document.getElementById("ask-input");
const askLog = document.getElementById("ask-log");

function appendAsk(q, a, isNote) {
  const el = document.createElement("div");
  el.className = "ask-item";
  el.innerHTML =
    `<div class="ask-q">${escapeHtml(q)}</div>` +
    `<div class="ask-a${isNote ? " note" : ""}">${escapeHtml(a)}</div>`;
  askLog.prepend(el);
  return el;
}

askForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = askInput.value.trim();
  if (!q) return;

  if (!hasOpenAIKey()) {
    revealAiKeyBar();
    appendAsk(q, "add an openai key up top to use the ask box. it stays in your browser.", true);
    return;
  }

  askInput.value = "";
  const row = appendAsk(q, "thinking...", false);
  try {
    const { content, used } = await buildAskContent(q);
    const a = await openaiConcise(ASK_SYSTEM, content);
    row.querySelector(".ask-a").textContent = a;
    // say what the answer was built on, so it is clear which parts lean on your
    // real data and which are the model's general knowledge.
    const note = document.createElement("div");
    note.className = "ask-src";
    note.textContent = "read " + used.join(", ");
    row.appendChild(note);
  } catch (err) {
    row.querySelector(".ask-a").textContent = "could not get an answer. " + err.message;
  }
});

// ---- openai key bar -------------------------------------------------------

const aiKeyBar = document.getElementById("ai-key-bar");
const aiKeyInput = document.getElementById("ai-key-input");
const aiKeySave = document.getElementById("ai-key-save");

function revealAiKeyBar() {
  if (aiKeyBar) aiKeyBar.hidden = false;
}

aiKeySave.addEventListener("click", () => {
  const val = aiKeyInput.value.trim();
  if (!val) return;
  localStorage.setItem(OPENAI_KEY_STORAGE, val);
  aiKeyInput.value = "";
  aiKeyBar.hidden = true;
});
