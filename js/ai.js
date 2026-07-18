// the ai blurb. for a holding that already cleared the 2% mover threshold and
// already had its headlines pulled, ask openai for one plain sentence on why it
// likely moved. no extra unrelated api calls, it only runs on tickers the news
// step already fetched.
//
// key handling mirrors the finnhub side and oim3690's ai-chat. the key can come
// from a gitignored config.js (OPENAI_API_KEY) when running locally, or from a
// runtime field held in localStorage on the deployed site. never committed.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-5-nano";
const OPENAI_KEY_STORAGE = "pp:openai-key";

state.moverBlurbs = {}; // ticker -> generated sentence, cached per session
const blurbInFlight = new Set();

function getOpenAIKey() {
  if (typeof OPENAI_API_KEY !== "undefined" && OPENAI_API_KEY && OPENAI_API_KEY.indexOf("PASTE") !== 0) {
    return OPENAI_API_KEY;
  }
  return localStorage.getItem(OPENAI_KEY_STORAGE) || null;
}

function hasOpenAIKey() {
  return !!getOpenAIKey();
}

// one sentence from the headlines. throws on any failure so the caller can fall
// back to the raw headlines, which are already on screen.
async function generateMoverBlurb(ticker, items) {
  const key = getOpenAIKey();
  if (!key) throw new Error("no openai key set.");

  const heads = items.slice(0, 3).map((n) => "- " + n.headline).join("\n");
  const messages = [
    {
      role: "system",
      content:
        "you explain a stock's move in one short plain-english sentence, based only on the headlines given. " +
        "no advice, no buy or sell language, no price targets. keep it factual and lowercase."
    },
    {
      role: "user",
      content:
        "the ticker " + ticker + " moved at least 2 percent today. in one sentence, say the likely reason " +
        "based only on these headlines:\n" + heads
    }
  ];

  let res;
  try {
    res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model: OPENAI_MODEL, messages: messages })
    });
  } catch (e) {
    throw new Error("network error reaching openai.");
  }

  if (!res.ok) {
    // surface openai's own message when it sends one, the way ai-chat does.
    let msg = "openai http " + res.status;
    try {
      const j = await res.json();
      if (j && j.error && j.error.message) msg = j.error.message;
    } catch (e) { /* no json body, keep the status */ }
    throw new Error(msg);
  }

  const data = await res.json();
  const text =
    data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text || !text.trim()) throw new Error("empty response from openai.");
  return text.trim();
}

function blurbHtml(sentence) {
  return `<span class="blurb-label">why it moved</span><span class="blurb-text">${escapeHtml(sentence)}</span>`;
}

// fill in the blurb slots the news step left under each mover. cache-first, one
// call per mover, graceful fallback if a call fails or no key is set.
function renderMoverBlurbs() {
  const slots = document.querySelectorAll(".mover-blurb");
  const keyed = hasOpenAIKey();

  // offer the key field only when there is somewhere to use it.
  updateAiKeyBar(slots.length > 0 && !keyed);

  if (!keyed) {
    // no key: stay quiet, the raw headlines below are the fallback.
    slots.forEach((el) => { el.hidden = true; });
    return;
  }

  slots.forEach(async (el) => {
    const ticker = el.dataset.ticker;
    const items = (state.moverNews && state.moverNews[ticker]) || [];
    if (!items.length) { el.hidden = true; return; }

    el.hidden = false;

    if (state.moverBlurbs[ticker]) {
      el.innerHTML = blurbHtml(state.moverBlurbs[ticker]);
      return;
    }
    if (blurbInFlight.has(ticker)) return;

    blurbInFlight.add(ticker);
    el.innerHTML = '<span class="blurb-loading">reading the headlines...</span>';
    try {
      const sentence = await generateMoverBlurb(ticker, items);
      state.moverBlurbs[ticker] = sentence;
      el.innerHTML = blurbHtml(sentence);
    } catch (e) {
      // fall back to the raw headlines that are already shown. keep the slot empty.
      el.hidden = true;
    } finally {
      blurbInFlight.delete(ticker);
    }
  });
}

// ---- openai key bar -------------------------------------------------------

const aiKeyBar = document.getElementById("ai-key-bar");
const aiKeyInput = document.getElementById("ai-key-input");
const aiKeySave = document.getElementById("ai-key-save");

function updateAiKeyBar(show) {
  aiKeyBar.hidden = !show;
}

aiKeySave.addEventListener("click", () => {
  const val = aiKeyInput.value.trim();
  if (!val) return;
  localStorage.setItem(OPENAI_KEY_STORAGE, val);
  aiKeyInput.value = "";
  aiKeyBar.hidden = true;
  state.moverBlurbs = {}; // regenerate now that a key is in
  renderMoverBlurbs();
});
