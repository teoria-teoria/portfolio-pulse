// dashboard logic. holds the portfolio state, renders the table and summary,
// and wires up add / edit / delete. live prices and news get layered on top of
// this render in the price and news steps.

const state = {
  holdings: loadHoldings(), // [{ id, ticker, shares, cost }]
  quotes: {},               // ticker -> finnhub quote object
  editingId: null,
  editMode: false           // portfolio-level edit mode toggled from the top
};

// elements
const form = document.getElementById("holding-form");
const tickerInput = document.getElementById("ticker");
const sharesInput = document.getElementById("shares");
const costInput = document.getElementById("cost");
const submitBtn = document.getElementById("form-submit");
const cancelBtn = document.getElementById("form-cancel");
const body = document.getElementById("holdings-body");
const emptyMsg = document.getElementById("holdings-empty");
const statusLine = document.getElementById("status-line");
const editToggle = document.getElementById("edit-toggle");

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

// ---- rendering ------------------------------------------------------------

function renderRow(h) {
  const q = state.quotes[h.ticker];
  const mv = marketValue(h);
  const g = gain(h);
  const hasQuote = q && typeof q.c === "number";

  const editing = state.editMode;

  const priceCell = hasQuote ? fmtMoney(q.c) : '<span class="price-loading">--</span>';
  const dayCell = hasQuote
    ? `<span class="move-chip" style="${moveTintStyle(q.dp)}">${fmtPct(q.dp)}</span>`
    : '<span class="price-loading">--</span>';
  const valueCell = mv === null ? '<span class="price-loading">--</span>' : fmtMoney(mv);
  const gainCell = g === null
    ? '<span class="price-loading">--</span>'
    : `<span class="${moveClass(g)}">${fmtSignedMoney(g)}</span>`;

  // in edit mode the shares and cost cells become inputs and a delete shows up.
  // the ticker stays fixed since it is the key for the quote.
  const sharesCell = editing
    ? `<input class="row-input" type="number" step="any" min="0" data-id="${h.id}" data-field="shares" value="${h.shares}">`
    : `${h.shares}`;
  const costCell = editing
    ? `<input class="row-input" type="number" step="any" min="0" data-id="${h.id}" data-field="cost" value="${h.cost}">`
    : `${fmtMoney(h.cost)}`;
  const actionsCell = editing
    ? `<div class="row-actions"><button class="icon-btn danger" data-action="delete" data-id="${h.id}">delete</button></div>`
    : "";

  return `
    <tr data-id="${h.id}"${editing ? ' class="is-editing"' : ""}>
      <td class="col-ticker">${h.ticker}</td>
      <td class="num">${sharesCell}</td>
      <td class="num">${costCell}</td>
      <td class="num">${priceCell}</td>
      <td class="num">${dayCell}</td>
      <td class="num">${valueCell}</td>
      <td class="num">${gainCell}</td>
      <td class="col-actions">${actionsCell}</td>
    </tr>
  `;
}

function renderTable() {
  if (state.holdings.length === 0) {
    body.innerHTML = "";
    emptyMsg.hidden = false;
    document.getElementById("holdings-table").style.display = "none";
    // no rows to edit. drop out of edit mode and hide the toggle.
    state.editMode = false;
    editToggle.hidden = true;
    editToggle.textContent = "edit";
    return;
  }
  emptyMsg.hidden = true;
  editToggle.hidden = false;
  document.getElementById("holdings-table").style.display = "";
  body.innerHTML = state.holdings.map(renderRow).join("");
  // news for movers gets injected here in the news step.
  if (typeof renderMoverNews === "function") renderMoverNews();
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
      // day change in dollars: shares * (current - previous close)
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
  renderTable();
  renderSummary();
  // the performance graph and the donut track the same priced state as the summary.
  if (typeof drawPerformance === "function") drawPerformance();
  if (typeof drawDiversity === "function") drawDiversity();
}

// ---- form: add / edit / delete -------------------------------------------

function resetForm() {
  state.editingId = null;
  form.reset();
  submitBtn.textContent = "add";
  cancelBtn.hidden = true;
  tickerInput.disabled = false;
}

function deleteHolding(id) {
  state.holdings = state.holdings.filter((h) => h.id !== id);
  saveHoldings(state.holdings);
  if (state.editingId === id) resetForm();
  render();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const ticker = tickerInput.value.trim().toUpperCase();
  const shares = parseFloat(sharesInput.value);
  const cost = parseFloat(costInput.value);

  if (!ticker || !(shares > 0) || !(cost >= 0)) {
    setStatus("check the inputs. ticker, a positive share count, and a cost basis are all required.", true);
    return;
  }

  if (state.editingId) {
    const h = state.holdings.find((x) => x.id === state.editingId);
    if (h) { h.shares = shares; h.cost = cost; }
  } else {
    const newHolding = { id: cryptoId(), ticker, shares, cost };
    state.holdings.push(newHolding);
  }

  saveHoldings(state.holdings);
  const editedTicker = ticker;
  resetForm();
  render();
  setStatus("");

  // pull a fresh quote for the added / edited ticker if the price layer is loaded.
  if (typeof refreshTicker === "function") refreshTicker(editedTicker);
});

cancelBtn.addEventListener("click", resetForm);

body.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === "delete") deleteHolding(id);
});

// ---- portfolio-level edit mode -------------------------------------------

// read every row input and write the values back to the holdings. shares must
// be positive and cost non-negative, otherwise that field keeps its old value.
function commitEdits() {
  const inputs = body.querySelectorAll(".row-input");
  const byId = {};
  inputs.forEach((inp) => {
    (byId[inp.dataset.id] = byId[inp.dataset.id] || {})[inp.dataset.field] = inp.value;
  });
  for (const h of state.holdings) {
    const v = byId[h.id];
    if (!v) continue;
    const shares = parseFloat(v.shares);
    const cost = parseFloat(v.cost);
    if (shares > 0) h.shares = shares;
    if (cost >= 0) h.cost = cost;
  }
  saveHoldings(state.holdings);
}

editToggle.addEventListener("click", () => {
  if (state.editMode) {
    commitEdits();
    state.editMode = false;
    editToggle.textContent = "edit";
    setStatus("");
  } else {
    state.editMode = true;
    editToggle.textContent = "done";
    setStatus("editing. change shares or cost, then click done to save.");
  }
  render();
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

  // layer mover news on top once prices are in.
  if (typeof loadMoverNews === "function") loadMoverNews();
}

// used after adding or editing a single holding, so we do not refetch the whole
// portfolio for one new ticker.
async function refreshTicker(ticker) {
  try {
    const q = await fetchQuote(ticker);
    if (q && typeof q.c === "number" && q.c > 0) {
      state.quotes[ticker] = q;
      render();
      setStatus(stalenessLabel() + ". updated " + new Date().toLocaleTimeString("en-US"));
      if (typeof loadMoverNews === "function") loadMoverNews();
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

// ---- boot -----------------------------------------------------------------

// wait for load so the news and projection layers are defined before we call
// into them from the price load.
window.addEventListener("load", () => {
  if (refreshKeyBar()) {
    loadLiveData();
  } else {
    render(); // draw the shell and any saved holdings even without a key
  }
});
