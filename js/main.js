// dashboard logic. holds the portfolio state, renders the summary and the
// holding cards, and drives the add popup and the per-holding detail modal.
// live prices and the graph/donut layer on top of this render.

const state = {
  holdings: loadHoldings(), // [{ id, ticker, shares, cost }]
  quotes: {},               // ticker -> finnhub quote object
  modalId: null             // id of the holding open in the detail modal
};

// elements
const statusLine = document.getElementById("status-line");
const holdingsCards = document.getElementById("holdings-cards");
const holdingsEmpty = document.getElementById("holdings-empty");

const openAddBtn = document.getElementById("open-add");
const addModal = document.getElementById("add-modal");
const addClose = document.getElementById("add-close");
const addForm = document.getElementById("add-form");
const addTicker = document.getElementById("add-ticker");
const addShares = document.getElementById("add-shares");
const addCost = document.getElementById("add-cost");
const addStatus = document.getElementById("add-status");
const addRecent = document.getElementById("add-recent");

const holdingModal = document.getElementById("holding-modal");
const holdingModalCard = document.getElementById("holding-modal-card");

// ---- portfolio math -------------------------------------------------------

function costTotal(h) {
  return h.shares * h.cost;
}

// market value needs a quote. returns null when the price is not in yet.
function marketValue(h) {
  const q = state.quotes[h.ticker];
  if (!q || typeof q.c !== "number") return null;
  return h.shares * q.c;
}

function gain(h) {
  const mv = marketValue(h);
  if (mv === null) return null;
  return mv - costTotal(h);
}

function gainPctVal(h) {
  const mv = marketValue(h);
  if (mv === null) return null;
  const c = costTotal(h);
  if (c <= 0) return null;
  return ((mv - c) / c) * 100;
}

// ---- holding cards --------------------------------------------------------

function cardHtml(h) {
  const q = state.quotes[h.ticker];
  const hasQuote = q && typeof q.c === "number";
  const dp = hasQuote ? q.dp : null;
  const dayLabel = hasQuote ? fmtPct(dp) : "--";
  return `
    <button type="button" class="hcard" data-id="${h.id}" style="${cardGlazeStyle(dp)}">
      <span class="hcard-ticker">${h.ticker}</span>
      <span class="hcard-day">${dayLabel}</span>
    </button>`;
}

function renderCards() {
  if (state.holdings.length === 0) {
    holdingsCards.innerHTML = "";
    holdingsEmpty.hidden = false;
    return;
  }
  holdingsEmpty.hidden = true;
  holdingsCards.innerHTML = state.holdings.map(cardHtml).join("");
}

function renderSummary() {
  const totalCost = state.holdings.reduce((sum, h) => sum + costTotal(h), 0);

  // only count value/gain for holdings that have a quote in yet. cost for the
  // gain figure tracks the same priced set so value, cost, and gain reconcile
  // even when one ticker has no price.
  let totalValue = 0;
  let pricedCost = 0;
  let priced = false;
  let dayChange = 0;
  for (const h of state.holdings) {
    const mv = marketValue(h);
    if (mv !== null) {
      priced = true;
      totalValue += mv;
      pricedCost += costTotal(h);
      const q = state.quotes[h.ticker];
      if (typeof q.pc === "number") dayChange += h.shares * (q.c - q.pc);
    }
  }

  document.getElementById("total-cost").textContent = fmtMoney(totalCost);

  const valueEl = document.getElementById("total-value");
  const changeEl = document.getElementById("total-change");
  const gainEl = document.getElementById("total-gain");
  const dayEl = document.getElementById("day-change");

  if (!priced) {
    valueEl.textContent = state.holdings.length ? "--" : fmtMoney(0);
    changeEl.textContent = "";
    gainEl.textContent = "--";
    dayEl.textContent = "--";
    return;
  }

  const totalGain = totalValue - pricedCost;
  const gainPct = pricedCost > 0 ? (totalGain / pricedCost) * 100 : 0;

  valueEl.textContent = fmtMoney(totalValue);
  changeEl.innerHTML = `<span class="${moveClass(totalGain)}">${fmtSignedMoney(totalGain)} (${fmtPct(gainPct)})</span> all time`;
  gainEl.innerHTML = `<span class="${moveClass(totalGain)}">${fmtSignedMoney(totalGain)}</span>`;
  dayEl.innerHTML = `<span class="${moveClass(dayChange)}">${fmtSignedMoney(dayChange)}</span>`;
}

function render() {
  renderCards();
  renderSummary();
  // the graph and the donut track the same priced state as the summary.
  if (typeof drawPerformance === "function") drawPerformance();
  if (typeof drawDiversity === "function") drawDiversity();
  // keep an open modal in sync with edits and price updates.
  if (state.modalId) renderHoldingModal(state.modalId);
}

// ---- add popup ------------------------------------------------------------

function openAddModal() {
  addForm.reset();
  addStatus.textContent = "";
  addStatus.className = "add-status";
  addRecent.innerHTML = "";
  addModal.hidden = false;
  requestAnimationFrame(() => addModal.classList.add("is-open"));
  addTicker.focus();
}

function closeAddModal() {
  addModal.classList.remove("is-open");
  addModal.hidden = true;
}

openAddBtn.addEventListener("click", openAddModal);
addClose.addEventListener("click", closeAddModal);
addModal.addEventListener("click", (e) => { if (e.target === addModal) closeAddModal(); });

addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const ticker = addTicker.value.trim().toUpperCase();
  const shares = parseFloat(addShares.value);
  const cost = parseFloat(addCost.value);

  if (!ticker || !(shares > 0) || !(cost >= 0)) {
    addStatus.textContent = "check the inputs. ticker, a positive share count, and a cost basis are all required.";
    addStatus.className = "add-status error";
    return;
  }

  const newHolding = { id: cryptoId(), ticker, shares, cost };
  state.holdings.push(newHolding);
  saveHoldings(state.holdings);
  render();

  // clear for the next one so you can add as many as you want.
  addForm.reset();
  addStatus.textContent = "";
  addStatus.className = "add-status";
  addTicker.focus();

  // note it as added, and pull a quote so it prices in. a bad ticker gets
  // flagged here once the quote comes back empty.
  const chip = document.createElement("span");
  chip.className = "recent-chip";
  chip.textContent = ticker + " · " + shares + " sh";
  addRecent.prepend(chip);
  if (typeof refreshTicker === "function") refreshTicker(ticker);
});

// ---- holding detail modal -------------------------------------------------

function openHoldingModal(id) {
  state.modalId = id;
  renderHoldingModal(id);
  holdingModal.hidden = false;
  requestAnimationFrame(() => holdingModal.classList.add("is-open"));
}

function closeHoldingModal() {
  state.modalId = null;
  holdingModal.classList.remove("is-open");
  holdingModal.hidden = true;
  holdingModalCard.innerHTML = "";
}

function renderHoldingModal(id) {
  const h = state.holdings.find((x) => x.id === id);
  if (!h) { closeHoldingModal(); return; }
  const q = state.quotes[h.ticker];
  const hasQuote = q && typeof q.c === "number";
  const mv = marketValue(h);
  const g = gain(h);
  const gp = gainPctVal(h);

  const price = hasQuote ? fmtMoney(q.c) : "--";
  const day = hasQuote ? `<span class="${moveClass(q.dp)}">${fmtPct(q.dp)}</span>` : "--";
  const gainStr = g === null
    ? "--"
    : `<span class="${moveClass(g)}">${fmtSignedMoney(g)}${gp !== null ? " (" + fmtPct(gp) + ")" : ""}</span>`;
  const valueStr = mv === null ? "--" : fmtMoney(mv);

  holdingModalCard.innerHTML = `
    <button type="button" class="modal-close" data-action="close" aria-label="close">&times;</button>
    <div class="hmodal-banner" style="background:${tickerGradient(h.ticker)}">
      <span class="hmodal-ticker">${h.ticker}</span>
    </div>
    <div class="hmodal-body">
      <div class="hmodal-edit">
        <div class="field">
          <label for="hm-shares">shares</label>
          <input type="number" id="hm-shares" step="any" min="0" value="${h.shares}">
        </div>
        <div class="field">
          <label for="hm-cost">cost / share</label>
          <input type="number" id="hm-cost" step="any" min="0" value="${h.cost}">
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-action="save">save</button>
      </div>
      <div class="hmodal-stats">
        <div><span class="stat-label">price</span><span class="hstat">${price}</span></div>
        <div><span class="stat-label">day</span><span class="hstat">${day}</span></div>
        <div><span class="stat-label">gain/loss</span><span class="hstat">${gainStr}</span></div>
        <div><span class="stat-label">value</span><span class="hstat">${valueStr}</span></div>
      </div>
      <button type="button" class="ask-news-btn" data-action="ask-news">ask ai for recent news on ${h.ticker}</button>
      <div class="hmodal-news" id="hm-news"></div>
      <button type="button" class="hmodal-delete" data-action="delete">delete holding</button>
    </div>`;
}

function saveModalEdits(id) {
  const h = state.holdings.find((x) => x.id === id);
  if (!h) return;
  const sharesEl = document.getElementById("hm-shares");
  const costEl = document.getElementById("hm-cost");
  const shares = parseFloat(sharesEl.value);
  const cost = parseFloat(costEl.value);
  if (shares > 0) h.shares = shares;
  if (cost >= 0) h.cost = cost;
  saveHoldings(state.holdings);
  render(); // re-renders the modal too via state.modalId
}

function deleteHolding(id) {
  state.holdings = state.holdings.filter((h) => h.id !== id);
  saveHoldings(state.holdings);
  render();
}

holdingsCards.addEventListener("click", (e) => {
  const card = e.target.closest(".hcard");
  if (!card) return;
  openHoldingModal(card.dataset.id);
});

holdingModal.addEventListener("click", (e) => {
  if (e.target === holdingModal) { closeHoldingModal(); return; }
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = state.modalId;
  const action = btn.dataset.action;
  if (action === "close") closeHoldingModal();
  else if (action === "save") saveModalEdits(id);
  else if (action === "delete") { deleteHolding(id); closeHoldingModal(); }
  else if (action === "ask-news") {
    const h = state.holdings.find((x) => x.id === id);
    if (h && typeof askStockNews === "function") askStockNews(h.ticker, document.getElementById("hm-news"));
  }
});

// escape closes whichever modal is open.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!holdingModal.hidden) closeHoldingModal();
  else if (!addModal.hidden) closeAddModal();
});

// ---- helpers --------------------------------------------------------------

function setStatus(msg, isError) {
  statusLine.textContent = msg;
  statusLine.classList.toggle("error", !!isError);
}

function cryptoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.floor(performance.now() * 1000).toString(36);
}

// ---- live prices ----------------------------------------------------------

const refreshBtn = document.getElementById("refresh-btn");
let loading = false;

function uniqueTickers() {
  return [...new Set(state.holdings.map((h) => h.ticker))];
}

function stalenessLabel() {
  return isMarketLive() ? "prices live" : "prices as of last close";
}

async function loadPrices() {
  const tickers = uniqueTickers();
  if (tickers.length === 0) {
    setStatus("");
    return;
  }
  if (loading) return;
  loading = true;
  refreshBtn.disabled = true;
  setStatus("loading prices...");

  const results = await Promise.allSettled(tickers.map((t) => fetchQuote(t)));
  const failed = [];
  results.forEach((r, i) => {
    const ticker = tickers[i];
    // finnhub returns c:0 for an unknown symbol. treat that as a bad ticker.
    if (r.status === "fulfilled" && r.value && typeof r.value.c === "number" && r.value.c > 0) {
      state.quotes[ticker] = r.value;
    } else {
      failed.push(ticker);
    }
  });

  loading = false;
  refreshBtn.disabled = false;
  render();

  if (failed.length === tickers.length) {
    const reason = results.find((r) => r.status === "rejected");
    setStatus(reason ? reason.reason.message : "could not load any prices. check the tickers.", true);
    return;
  }
  if (failed.length) {
    setStatus("no price for: " + failed.join(", ") + ". " + stalenessLabel() + ".", true);
  } else {
    setStatus(stalenessLabel() + ". updated " + new Date().toLocaleTimeString("en-US"));
  }
}

// used after adding a single holding, so we do not refetch the whole portfolio.
async function refreshTicker(ticker) {
  try {
    const q = await fetchQuote(ticker);
    if (q && typeof q.c === "number" && q.c > 0) {
      state.quotes[ticker] = q;
      render();
      setStatus(stalenessLabel() + ". updated " + new Date().toLocaleTimeString("en-US"));
    } else {
      setStatus("no price found for " + ticker + ". double check the ticker.", true);
    }
  } catch (e) {
    setStatus(e.message, true);
  }
}

refreshBtn.addEventListener("click", () => {
  // clear cached quotes so refresh actually refetches.
  state.quotes = {};
  render();
  loadPrices();
  if (typeof loadWorthALook === "function") loadWorthALook();
});

// ---- api key bar ----------------------------------------------------------

const keyBar = document.getElementById("key-bar");
const keyInput = document.getElementById("key-input");
const keySave = document.getElementById("key-save");

function loadLiveData() {
  render();
  loadPrices();
  if (typeof loadWorthALook === "function") loadWorthALook();
}

function refreshKeyBar() {
  const missing = !hasApiKey();
  keyBar.hidden = !missing;
  if (missing) {
    setStatus("no finnhub key set. add one below to load live prices and news.", true);
  }
  return !missing;
}

keySave.addEventListener("click", () => {
  const val = keyInput.value.trim();
  if (!val) return;
  localStorage.setItem("pp:finnhub-key", val);
  keyInput.value = "";
  keyBar.hidden = true;
  setStatus("");
  loadLiveData();
});

// ---- theme ----------------------------------------------------------------

// the head script already applied the saved or system theme before paint. here
// we just wire the toggle and keep the icon in sync. canvases are redrawn on a
// switch so they pick up the new theme colors.
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = themeToggle ? themeToggle.querySelector(".theme-icon") : null;

function currentTheme() {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr) return attr;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeIcon() {
  if (themeIcon) themeIcon.textContent = currentTheme() === "dark" ? "☀" : "☾"; // sun / moon
}

if (themeToggle) {
  applyThemeIcon();
  themeToggle.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("pp:theme", next);
    applyThemeIcon();
    if (typeof drawPerformance === "function") drawPerformance();
    if (typeof drawDiversity === "function") drawDiversity();
  });
}

// ---- boot -----------------------------------------------------------------

// wait for load so the news, graph, and donut layers are defined before we call
// into them from the price load.
window.addEventListener("load", () => {
  if (refreshKeyBar()) {
    loadLiveData();
  } else {
    render(); // draw the shell and any saved holdings even without a key
  }
});
