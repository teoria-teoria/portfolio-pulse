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
    const a = await openaiConcise(
      "you answer short investing and finance questions in one or two plain sentences. concise and factual, lowercase is fine. this is general information, not personalized financial advice. keep any disclaimer to a few words.",
      q
    );
    row.querySelector(".ask-a").textContent = a;
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
