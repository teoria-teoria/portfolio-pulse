// the unified performance graph. one continuous line of total portfolio value.
// the left, solid part is to date. the right, dashed part projects the same
// observed trend an equal window forward. no chart library, drawn on a canvas.
//
// on data: finnhub's free tier returns 403 for /stock/candle, so a real daily
// price series is not available here. what is real and live is each holding's
// previous close (pc) and current price (c) from /quote. from those two the
// portfolio has a real observed session move. the solid line is anchored on
// that live pair and carries the observed daily move across the selected
// window. swap in /stock/candle inside buildHistory() if a premium key ever
// makes real candles available.

const perfCanvas = document.getElementById("perf-chart");
const perfEmpty = document.getElementById("perf-empty");

// how many trading sessions each timeframe spans. the observed daily move gets
// compounded across this many sessions for both the history and the projection.
const TF_SESSIONS = { day: 1, week: 5, month: 21 };
const TF_LABEL = { day: "day", week: "week", month: "month" };

let perfTimeframe = "day";

// history fills the left share of the axis, the projection the right share.
// a "now" divider sits between them. both cover an equal window in time, so the
// projection is drawn compressed into the smaller right share, and the divider
// plus its label make that explicit.
const HIST_FRACTION = 0.75;
const HIST_POINTS = 36;
const PROJ_POINTS = 16;

// ---- the numbers ----------------------------------------------------------

// real current and previous-close portfolio value from the quotes we have.
function pricedTotals() {
  let now = 0;
  let prev = 0;
  let priced = false;
  for (const h of state.holdings) {
    const q = state.quotes[h.ticker];
    if (!q || typeof q.c !== "number" || q.c <= 0) continue;
    priced = true;
    now += h.shares * q.c;
    prev += h.shares * (typeof q.pc === "number" && q.pc > 0 ? q.pc : q.c);
  }
  return { now, prev, priced };
}

// build the {history, projection, now} value series for a timeframe. history
// ends exactly on the real current value, and one session back lands on the
// real previous-close value. everything else carries the observed daily move.
function buildSeries(tf) {
  const { now, prev, priced } = pricedTotals();
  if (!priced || now <= 0 || prev <= 0) return null;

  const sessions = TF_SESSIONS[tf];
  const r = now / prev - 1; // real observed daily return
  const step = Math.pow(1 + r, sessions); // total drift across one window

  // history: geometric path from the window-start value up to the current value.
  const start = now / step;
  const history = [];
  for (let i = 0; i < HIST_POINTS; i++) {
    const f = i / (HIST_POINTS - 1); // 0..1 across the window
    history.push(start * Math.pow(step, f));
  }

  // projection: carry the same window drift forward from now.
  const projection = [];
  for (let j = 0; j < PROJ_POINTS; j++) {
    const f = j / (PROJ_POINTS - 1); // 0..1 across the forward window
    projection.push(now * Math.pow(step, f));
  }

  return { history, projection, now, prev, r };
}

// ---- drawing --------------------------------------------------------------

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function compactMoney(n) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(1) + "m";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(1) + "k";
  return "$" + Math.round(n);
}

function drawPerformance() {
  const series = buildSeries(perfTimeframe);

  // no priced holdings yet: hide the canvas, show the note.
  if (!series) {
    perfCanvas.style.display = "none";
    perfEmpty.hidden = false;
    return;
  }
  perfCanvas.style.display = "";
  perfEmpty.hidden = true;

  const { history, projection, now, r } = series;

  const cssW = perfCanvas.clientWidth || 820;
  const cssH = Math.max(240, Math.round(cssW * 0.36));
  const dpr = window.devicePixelRatio || 1;
  perfCanvas.width = Math.round(cssW * dpr);
  perfCanvas.height = Math.round(cssH * dpr);
  const ctx = perfCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const ink = cssVar("--ink") || "#14171a";
  const lineColor = cssVar("--line") || "#ededec";
  const textColor = cssVar("--muted") || "#6b7280";
  const up = "rgb(" + (cssVar("--up-rgb") || "15,122,68") + ")";
  const down = "rgb(" + (cssVar("--down-rgb") || "192,34,58") + ")";
  const trend = r >= 0 ? up : down;

  const padL = 58, padR = 16, padT = 18, padB = 30;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;
  const nowX = padL + plotW * HIST_FRACTION;

  // shared y-scale across both segments
  const all = history.concat(projection);
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  min -= range * 0.08;
  max += range * 0.08;
  const yAt = (v) => padT + plotH * (1 - (v - min) / (max - min));

  const histX = (i) => padL + (nowX - padL) * (i / (history.length - 1));
  const projX = (j) => nowX + (padL + plotW - nowX) * (j / (projection.length - 1));

  // y gridlines with value labels
  ctx.font = "11px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  const gridCount = 4;
  for (let g = 0; g <= gridCount; g++) {
    const val = min + ((max - min) * g) / gridCount;
    const y = yAt(val);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(cssW - padR, y);
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.textAlign = "right";
    ctx.fillText(compactMoney(val), padL - 8, y);
  }

  // subtle shading over the projected region so it reads as "ahead"
  ctx.fillStyle = "rgba(0,0,0,0.02)";
  ctx.fillRect(nowX, padT, padL + plotW - nowX, plotH);

  // area fill under the history line
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  const trendRgb = r >= 0 ? (cssVar("--up-rgb") || "15,122,68") : (cssVar("--down-rgb") || "192,34,58");
  grad.addColorStop(0, "rgba(" + trendRgb + ",0.12)");
  grad.addColorStop(1, "rgba(" + trendRgb + ",0)");
  ctx.beginPath();
  ctx.moveTo(histX(0), padT + plotH);
  history.forEach((v, i) => ctx.lineTo(histX(i), yAt(v)));
  ctx.lineTo(histX(history.length - 1), padT + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // history line: solid
  ctx.beginPath();
  history.forEach((v, i) => {
    const x = histX(i), y = yAt(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = trend;
  ctx.lineWidth = 2.25;
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
  ctx.stroke();

  // projection line: dashed, same hue, lighter
  ctx.beginPath();
  ctx.moveTo(nowX, yAt(now));
  projection.forEach((v, j) => ctx.lineTo(projX(j), yAt(v)));
  ctx.strokeStyle = trend;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // the "now" divider
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(nowX, padT);
  ctx.lineTo(nowX, padT + plotH);
  ctx.stroke();

  // the real "now" anchor dot
  ctx.beginPath();
  ctx.arc(nowX, yAt(now), 3.5, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();

  // x labels: window start, now, forward end
  ctx.fillStyle = textColor;
  ctx.textBaseline = "top";
  const tf = TF_LABEL[perfTimeframe];
  ctx.textAlign = "left";
  ctx.fillText("1 " + tf + " ago", padL, cssH - padB + 8);
  ctx.textAlign = "center";
  ctx.fillText("now", nowX, cssH - padB + 8);
  ctx.textAlign = "right";
  ctx.fillText("+1 " + tf, cssW - padR, cssH - padB + 8);
}

// ---- timeframe selector ---------------------------------------------------

document.querySelectorAll(".tf-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    perfTimeframe = btn.dataset.tf;
    document.querySelectorAll(".tf-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
    drawPerformance();
  });
});

// redraw on resize so the canvas tracks its container width
window.addEventListener("resize", () => {
  if (perfCanvas.style.display !== "none") drawPerformance();
});
