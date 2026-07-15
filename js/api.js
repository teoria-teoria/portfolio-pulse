// finnhub api wrapper. every network call goes through finnhubGet so error
// handling and the rate-limit case live in one place.

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const KEY_STORAGE = "pp:finnhub-key";

// the key comes from config.js when running locally. config.js is gitignored,
// so on the deployed site it is absent. there we fall back to a key the user
// pastes in, held in localStorage on their browser only. never committed.
function getApiKey() {
  if (typeof FINNHUB_API_KEY !== "undefined" && FINNHUB_API_KEY && FINNHUB_API_KEY.indexOf("PASTE") !== 0) {
    return FINNHUB_API_KEY;
  }
  return localStorage.getItem(KEY_STORAGE) || null;
}

function hasApiKey() {
  return !!getApiKey();
}

async function finnhubGet(path) {
  const key = getApiKey();
  if (!key) {
    throw new Error("no finnhub key set.");
  }
  const sep = path.indexOf("?") === -1 ? "?" : "&";
  const url = FINNHUB_BASE + path + sep + "token=" + key;

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error("network error reaching finnhub.");
  }

  if (res.status === 429) {
    throw new Error("rate limited by finnhub. wait a minute, then refresh.");
  }
  if (!res.ok) {
    throw new Error("finnhub error: http " + res.status);
  }
  return res.json();
}

function fetchQuote(ticker) {
  return finnhubGet("/quote?symbol=" + encodeURIComponent(ticker));
}

function fetchCompanyNews(ticker, fromDate, toDate) {
  return finnhubGet(
    "/company-news?symbol=" + encodeURIComponent(ticker) + "&from=" + fromDate + "&to=" + toDate
  );
}

function fetchGeneralNews() {
  return finnhubGet("/news?category=general");
}
