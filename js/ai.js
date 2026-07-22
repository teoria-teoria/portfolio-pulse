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
    const today = todayET();
    const cached = getCachedNews(ticker, today);
    if (cached) {
      items = cached;
    } else {
      const raw = await fetchCompanyNews(ticker, daysAgoET(5), today);
      items = (raw || [])
        .filter((n) => n && n.headline && n.url)
        .slice(0, 4)
        .map((n) => ({ headline: n.headline, url: n.url, source: n.source || "" }));
      setCachedNews(ticker, today, items);
    }
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
  "answer from your own knowledge by default. you know a great deal about public companies, their businesses, their financials, their history, and how their past earnings went. use it and be specific. do not open with a refusal, and do not say you lack live data as a way of avoiding a question you can actually answer.",
  "",
  "only add a caveat when the question truly depends on something you cannot know: today's price, today's move, this week's news, or anything after your training cutoff. even then, give your best answer first, then note in a few words that you do not have live data and the figure may be stale.",
  "",
  "if the message includes recent headlines, they are real and were pulled by this app. ground your answer in them and say what they show.",
  "",
  "one to three plain sentences. lowercase is fine. this is general information, not personalized financial advice. do not restate that disclaimer unless the question is actually asking what to buy or sell."
].join("\n");

// tickers named in the question that this app has already pulled news for.
// word boundary and case-insensitive, so "how is nvda doing" matches NVDA.
function newsContextFor(question) {
  const found = [];
  for (const c of cachedNewsTickers()) {
    if (!new RegExp("\\b" + escapeRegex(c.ticker) + "\\b", "i").test(question)) continue;
    const hit = latestCachedNews(c.ticker);
    if (hit) found.push(hit);
  }
  return found;
}

// the question, plus any real headlines the app is already holding for the
// tickers it mentions. no headlines means the question goes through untouched
// and the model answers from general knowledge.
function buildAskContent(question, hits) {
  if (!hits.length) return question;
  const blocks = hits.map((h) =>
    "recent headlines for " + h.ticker + ", pulled by this app on " + h.dateStr + ":\n" +
    h.items.map((n) => "- " + n.headline + (n.source ? " (" + n.source + ")" : "")).join("\n")
  );
  return question + "\n\n" + blocks.join("\n\n");
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
  const hits = newsContextFor(q);
  try {
    const a = await openaiConcise(ASK_SYSTEM, buildAskContent(q, hits));
    row.querySelector(".ask-a").textContent = a;
    // say when the answer was grounded in headlines this app pulled, so it is
    // clear which answers lean on real data and which are general knowledge.
    if (hits.length) {
      const note = document.createElement("div");
      note.className = "ask-src";
      note.textContent = "grounded in headlines pulled for " + hits.map((h) => h.ticker).join(", ");
      row.appendChild(note);
    }
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
