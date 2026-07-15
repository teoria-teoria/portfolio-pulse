// dashboard logic. holds the portfolio state, renders the table and summary,
// and wires up add / edit / delete. live prices and news get layered on top of
// this render in the price and news steps.

const state = {
  holdings: loadHoldings(), // [{ id, ticker, shares, cost }]
  quotes: {},               // ticker -> finnhub quote object
  editingId: null
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

  const priceCell = hasQuote ? fmtMoney(q.c) : '<span class="price-loading">--</span>';
  const dayCell = hasQuote
    ? `<span class="${moveClass(q.dp)}">${fmtPct(q.dp)}</span>`
    : '<span class="price-loading">--</span>';
  const valueCell = mv === null ? '<span class="price-loading">--</span>' : fmtMoney(mv);
  const gainCell = g === null
    ? '<span class="price-loading">--</span>'
    : `<span class="${moveClass(g)}">${fmtSignedMoney(g)}</span>`;

  return `
    <tr data-id="${h.id}">
      <td class="col-ticker">${h.ticker}</td>
      <td class="num">${h.shares}</td>
      <td class="num">${fmtMoney(h.cost)}</td>
      <td class="num">${priceCell}</td>
      <td class="num">${dayCell}</td>
      <td class="num">${valueCell}</td>
      <td class="num">${gainCell}</td>
      <td class="col-actions">
        <div class="row-actions">
          <button class="icon-btn" data-action="edit" data-id="${h.id}">edit</button>
          <button class="icon-btn danger" data-action="delete" data-id="${h.id}">delete</button>
        </div>
      </td>
    </tr>
  `;
}

function renderTable() {
  if (state.holdings.length === 0) {
    body.innerHTML = "";
    emptyMsg.hidden = false;
    document.getElementById("holdings-table").style.display = "none";
    return;
  }
  emptyMsg.hidden = true;
  document.getElementById("holdings-table").style.display = "";
  body.innerHTML = state.holdings.map(renderRow).join("");
  // news for movers gets injected here in the news step.
  if (typeof renderMoverNews === "function") renderMoverNews();
}

function renderSummary() {
  const totalCost = state.holdings.reduce((sum, h) => sum + costTotal(h), 0);

  // only count value/gain for holdings that have a quote in yet.
  let totalValue = 0;
  let priced = false;
  let dayChange = 0;
  for (const h of state.holdings) {
    const mv = marketValue(h);
    if (mv !== null) {
      priced = true;
      totalValue += mv;
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

  const totalGain = totalValue - totalCost;
  const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  valueEl.textContent = fmtMoney(totalValue);
  changeEl.innerHTML = `<span class="${moveClass(totalGain)}">${fmtSignedMoney(totalGain)} (${fmtPct(gainPct)})</span> all time`;
  gainEl.innerHTML = `<span class="${moveClass(totalGain)}">${fmtSignedMoney(totalGain)}</span>`;
  dayEl.innerHTML = `<span class="${moveClass(dayChange)}">${fmtSignedMoney(dayChange)}</span>`;
}

function render() {
  renderTable();
  renderSummary();
}

// ---- form: add / edit / delete -------------------------------------------

function resetForm() {
  state.editingId = null;
  form.reset();
  submitBtn.textContent = "add";
  cancelBtn.hidden = true;
  tickerInput.disabled = false;
}

function startEdit(id) {
  const h = state.holdings.find((x) => x.id === id);
  if (!h) return;
  state.editingId = id;
  tickerInput.value = h.ticker;
  sharesInput.value = h.shares;
  costInput.value = h.cost;
  submitBtn.textContent = "update";
  cancelBtn.hidden = false;
  tickerInput.disabled = true; // ticker is the key for the quote, keep it fixed on edit
  sharesInput.focus();
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
  if (btn.dataset.action === "edit") startEdit(id);
  if (btn.dataset.action === "delete") deleteHolding(id);
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

// ---- tabs -----------------------------------------------------------------

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.classList.toggle("is-active", p.id === target);
    });
    if (target === "projection" && typeof drawProjection === "function") drawProjection();
  });
});

// ---- boot -----------------------------------------------------------------

render();
// price and news loading is kicked off by the price layer once it is loaded.
if (typeof loadPrices === "function") loadPrices();
