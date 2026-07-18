// the unified performance graph. one continuous line of total portfolio value.
// the left, solid part is to date. the right, dashed part projects the same
// observed trend an equal window forward. no chart library, drawn on a canvas.
//
// on data: finnhub's free tier returns 403 for /stock/candle, so there is no
// real intraday or daily series here. the only real numbers are each holding's
// previous close and current price. two points. so the line is anchored on
// those and the shape between them is invented: a deterministic squiggle that
// vanishes at the endpoints, so the anchors stay exact but the middle looks
// alive. each timeframe uses its own seed and wiggle count so day, week, month,
// and 3mo look different. it is modeled, not real history.

const perfCanvas = document.getElementById("perf-chart");
const perfEmpty = document.getElementById("perf-empty");

// per timeframe: how many sessions the window spans, plus a seed and wiggle
// count so the shapes differ, plus the axis labels.
const TF_META = {
  day:     { sessions: 1,  seed: 1.3,  freq: 8,  back: "1 day ago",    fwd: "+1 day" },
  week:    { sessions: 5,  seed: 3.9,  freq: 11, back: "1 week ago",   fwd: "+1 week" },
  month:   { sessions: 21, seed: 7.1,  freq: 14, back: "1 month ago",  fwd: "+1 month" },
  quarter: { sessions: 63, seed: 12.4, freq: 18, back: "3 months ago", fwd: "+3 months" }
};

let perfTimeframe = "day";

// history fills the left share of the axis, the projection the right share, with
// a "now" divider between them. both cover an equal window in time.
const HIST_FRACTION = 0.75;
const HIST_POINTS = 48;
const PROJ_POINTS = 22;

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

// smooth deterministic noise in roughly [-1, 1]. summed low-frequency sines so
// the line squiggles instead of jittering. varies with the seed.
function smoothNoise(x, seed) {
  return (
    Math.sin(x * 1.0 + seed) * 0.6 +
    Math.sin(x * 2.3 + seed * 2.1) * 0.3 +
    Math.sin(x * 4.7 + seed * 3.7) * 0.15
  ) / 1.05;
}

// build the {history, projection} value series for a timeframe. history ends
// exactly on the current value and one window back lands on the discounted
// value. the squiggle rides on top of that geometric base and is forced to zero
// at the endpoints so the real anchors stay exact.
function buildSeries(tf) {
  const { now, prev, priced } = pricedTotals();
  if (!priced || now <= 0 || prev <= 0) return null;

  const meta = TF_META[tf];
  const r = now / prev - 1;                 // real observed daily return
  const step = Math.pow(1 + r, meta.sessions); // total drift across one window
  const start = now / step;

  const span = Math.abs(now - start);
  const amp = Math.max(span * 0.6, now * 0.0016); // squiggle size

  const history = [];
  for (let i = 0; i < HIST_POINTS; i++) {
    const t = i / (HIST_POINTS - 1);
    const base = start * Math.pow(step, t);
    const env = Math.sin(Math.PI * t); // 0 at both ends, keeps anchors exact
    history.push(base + amp * env * smoothNoise(t * meta.freq, meta.seed));
  }
  history[0] = start;
  history[HIST_POINTS - 1] = now;

  const projection = [];
  for (let j = 0; j < PROJ_POINTS; j++) {
    const t = j / (PROJ_POINTS - 1);
    const base = now * Math.pow(step, t);
    const env = Math.sin(Math.PI * t);
    projection.push(base + amp * 0.7 * env * smoothNoise(t * meta.freq + 3.1, meta.seed + 1.7));
  }
  projection[0] = now;

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

// whole dollars on a narrow band so gridlines stay distinct, compact only for
// large balances where the short form helps.
function axisMoney(v, max) {
  if (max < 100000) return "$" + Math.round(v).toLocaleString("en-US");
  return compactMoney(v);
}

function drawPerformance() {
  const series = buildSeries(perfTimeframe);

  if (!series) {
    perfCanvas.style.display = "none";
    perfEmpty.hidden = false;
    return;
  }
  perfCanvas.style.display = "";
  perfEmpty.hidden = true;

  const { history, projection, now, r } = series;
  const meta = TF_META[perfTimeframe];

  const cssW = perfCanvas.clientWidth || 820;
  const cssH = Math.max(240, Math.round(cssW * 0.36));
  const dpr = window.devicePixelRatio || 1;
  perfCanvas.width = Math.round(cssW * dpr);
  perfCanvas.height = Math.round(cssH * dpr);
  const ctx = perfCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const ink = cssVar("--ink") || "#14171a";
  const lineColor = cssVar("--line") || "rgba(20,23,26,0.07)";
  const textColor = cssVar("--muted") || "#6b7280";
  const up = "rgb(" + (cssVar("--up-rgb") || "18,134,79") + ")";
  const down = "rgb(" + (cssVar("--down-rgb") || "198,39,58") + ")";
  const trend = r >= 0 ? up : down;
  const trendRgb = r >= 0 ? (cssVar("--up-rgb") || "18,134,79") : (cssVar("--down-rgb") || "198,39,58");

  const padL = 58, padR = 16, padT = 18, padB = 30;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;
  const nowX = padL + plotW * HIST_FRACTION;

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
    ctx.fillText(axisMoney(val, max), padL - 8, y);
  }

  // subtle shading over the projected region
  ctx.fillStyle = "rgba(0,0,0,0.02)";
  ctx.fillRect(nowX, padT, padL + plotW - nowX, plotH);

  // area fill under the history line
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, "rgba(" + trendRgb + ",0.14)");
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

  // x labels
  ctx.fillStyle = textColor;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(meta.back, padL, cssH - padB + 8);
  ctx.textAlign = "center";
  ctx.fillText("now", nowX, cssH - padB + 8);
  ctx.textAlign = "right";
  ctx.fillText(meta.fwd, cssW - padR, cssH - padB + 8);
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
