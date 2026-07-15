// localStorage wrapper. holdings live here, plus a per-day news cache so a page
// refresh does not burn extra finnhub calls.

const HOLDINGS_KEY = "pp:holdings";
const NEWS_PREFIX = "pp:news:";

function loadHoldings() {
  try {
    const raw = localStorage.getItem(HOLDINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveHoldings(holdings) {
  localStorage.setItem(HOLDINGS_KEY, JSON.stringify(holdings));
}

// news cache is keyed by ticker + date, so it is fresh each day and reused
// within the same day across refreshes.
function newsCacheKey(ticker, dateStr) {
  return NEWS_PREFIX + ticker + ":" + dateStr;
}

function getCachedNews(ticker, dateStr) {
  try {
    const raw = localStorage.getItem(newsCacheKey(ticker, dateStr));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setCachedNews(ticker, dateStr, items) {
  try {
    localStorage.setItem(newsCacheKey(ticker, dateStr), JSON.stringify(items));
  } catch (e) {
    // storage full or blocked. skip the cache, the app still works.
  }
}
