// the performance graph. one line of total portfolio value over time.
//
// honest model: the only real numbers are total cost basis (what you put in),
// current market value (from live quotes), and the start date. so the line runs
// from cost basis at inception to current value now. those endpoints are real.
// the shape between them is a deterministic squiggle, invented, forced to zero
// at the ends so the anchors stay exact. the fixed windows cap at inception, so
// a 3 month view on a 4 week old portfolio shows 4 weeks instead of inventing a
// start value. day uses the real previous close as its left anchor. still
// modeled between the ends, not real history (finnhub's free tier has no
// candles).
//
// nothing is projected forward. now sits at the right edge, always.

const perfCanvas = document.getElementById("perf-chart");
const perfEmpty = document.getElementById("perf-empty");

// fixed. max always runs from here, however long ago that becomes.
const INCEPTION = "2026-06-24";

// days: null means "all the way back to inception", however far that is.
const TF_META = {
  day:     { days: 1,    seed: 1.3,  freq: 8  },
  week:    { days: 7,    seed: 3.9,  freq: 11 },
  month:   { days: 30,   seed: 7.1,  freq: 14 },
  quarter: { days: 90,   seed: 12.4, freq: 18 },
  max:     { days: null, seed: 5.6,  freq: 16 }
};

let perfTimeframe = "day";

const HIST_POINTS = 48;
const MS_DAY = 86400000;

// where the reference marks sit across the window. symmetric around the middle.
const MARK_FRACTIONS = [0.25, 0.5, 0.75];

// ---- dates ----------------------------------------------------------------

function getInceptionDate() {
  return new Date(INCEPTION + "T00:00:00");
}

// a window of a day or less reads in hours, anything longer reads in dates.
function fmtAxisLabel(d, useTime) {
  if (useTime) {
    return d.toLocaleTimeString("en-US", { hour: "numeric" }).toLowerCase().replace(/\s+/g, "");
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
}

// ---- the numbers ----------------------------------------------------------

function pricedTotals() {
  let now = 0, prev = 0, basis = 0, priced = false;
  for (const h of state.holdings) {
    const q = state.quotes[h.ticker];
    if (!q || typeof q.c !== "number" || q.c <= 0) continue;
    priced = true;
    now += h.shares * q.c;
    prev += h.shares * (typeof q.pc === "number" && q.pc > 0 ? q.pc : q.c);
    basis += h.shares * h.cost;
  }
  return { now, prev, basis, priced };
}

function smoothNoise(x, seed) {
  return (
    Math.sin(x * 1.0 + seed) * 0.6 +
    Math.sin(x * 2.3 + seed * 2.1) * 0.3 +
    Math.sin(x * 4.7 + seed * 3.7) * 0.15
  ) / 1.05;
}

function buildSeries(tf) {
  const { now, prev, basis, priced } = pricedTotals();
  if (!priced || now <= 0) return null;

  const meta = TF_META[tf];
  const inception = getInceptionDate();
  const nowDate = new Date();
  let daysSince = (nowDate - inception) / MS_DAY;
  if (!(daysSince > 0)) daysSince = 0.5; // inception today or in the future

  // value on the cost-basis -> current-value line, `daysAgo` before now.
  const lineValue = (daysAgo) => {
    const frac = Math.min(Math.max((daysSince - daysAgo) / daysSince, 0), 1);
    return basis + (now - basis) * frac;
  };

  // max ignores the cap and runs the whole way back. the fixed windows stop at
  // inception so they never show a stretch you were not invested for.
  const effDays = meta.days === null ? daysSince : Math.min(meta.days, daysSince);

  // left anchor. day uses the real previous close, longer windows use the line.
  const leftValue = (tf === "day" && prev > 0) ? prev : lineValue(effDays);

  const span = Math.abs(now - leftValue);
  const amp = Math.max(span * 0.3, now * 0.0016); // gentle, neutral squiggle

  const history = [];
  for (let i = 0; i < HIST_POINTS; i++) {
    const t = i / (HIST_POINTS - 1);
    const base = leftValue + (now - leftValue) * t;
    const env = Math.sin(Math.PI * t);
    history.push(base + amp * env * smoothNoise(t * meta.freq, meta.seed));
  }
  history[0] = leftValue;
  history[HIST_POINTS - 1] = now;

  // real calendar dates across the window, so the axis says jun 24 rather than
  // "3 months ago". an intraday window reads in hours instead.
  const startMs = nowDate.getTime() - effDays * MS_DAY;
  const useTime = effDays <= 1.5;
  const tickAt = (t) => ({
    t,
    label: fmtAxisLabel(new Date(startMs + effDays * MS_DAY * t), useTime)
  });

  return {
    history,
    now,
    up: now >= leftValue,
    ticks: [0, 0.25, 0.5, 0.75, 1].map(tickAt)
  };
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

  const { history, now, up, ticks } = series;

  const cssW = perfCanvas.clientWidth || 820;
  const cssH = Math.max(240, Math.round(cssW * 0.36));
  const dpr = window.devicePixelRatio || 1;
  perfCanvas.width = Math.round(cssW * dpr);
  perfCanvas.height = Math.round(cssH * dpr);
  const ctx = perfCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const ink = cssVar("--ink") || "#14171a";
  const card = cssVar("--card") || "#f2f2ef";
  const lineColor = cssVar("--line") || "rgba(20,23,26,0.07)";
  const textColor = cssVar("--muted") || "#6b7280";
  const faintColor = cssVar("--faint") || "#99a0a6";
  const upC = "rgb(" + (cssVar("--up-rgb") || "18,134,79") + ")";
  const downC = "rgb(" + (cssVar("--down-rgb") || "198,39,58") + ")";
  const trend = up ? upC : downC;
  const trendRgb = up ? (cssVar("--up-rgb") || "18,134,79") : (cssVar("--down-rgb") || "198,39,58");

  const padL = 58, padR = 16, padT = 18, padB = 30;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;

  // the line now fills the plot. no reserved strip on the right.
  let min = Math.min(...history);
  let max = Math.max(...history);
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  min -= range * 0.08;
  max += range * 0.08;
  const yAt = (v) => padT + plotH * (1 - (v - min) / (max - min));
  const xAt = (t) => padL + plotW * t;
  const histX = (i) => xAt(i / (history.length - 1));
  const valueAt = (t) => history[Math.round(t * (history.length - 1))];

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

  // reference marks. a hairline down the plot at each, so you can read a point
  // on the line against a real date. thinned out when there is no room.
  const roomy = plotW >= 400;
  const marks = roomy ? MARK_FRACTIONS : [0.5];
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  marks.forEach((t) => {
    const x = xAt(t);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
  });

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

  ctx.beginPath();
  history.forEach((v, i) => {
    const x = histX(i), y = yAt(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = trend;
  ctx.lineWidth = 2.25;
  ctx.lineJoin = "round";
  ctx.stroke();

  // a dot where the line crosses each reference mark, ringed in the card color
  // so it stays legible sitting on the line.
  marks.forEach((t) => {
    const x = xAt(t), y = yAt(valueAt(t));
    ctx.beginPath();
    ctx.arc(x, y, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = card;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = trend;
    ctx.fill();
  });

  // now. the right edge, always.
  ctx.beginPath();
  ctx.arc(xAt(1), yAt(now), 3.5, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();

  // dates under the axis. ends align inward so nothing runs off the canvas.
  ctx.textBaseline = "top";
  const labelY = cssH - padB + 8;
  ticks.forEach((tick) => {
    if (!roomy && tick.t !== 0 && tick.t !== 0.5 && tick.t !== 1) return;
    const x = xAt(tick.t);
    const isEnd = tick.t === 0 || tick.t === 1;
    ctx.fillStyle = isEnd ? textColor : faintColor;
    ctx.textAlign = tick.t === 0 ? "left" : tick.t === 1 ? "right" : "center";
    ctx.fillText(tick.label, x, labelY);
  });
}

// ---- controls -------------------------------------------------------------

document.querySelectorAll(".tf-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    perfTimeframe = btn.dataset.tf;
    document.querySelectorAll(".tf-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
    drawPerformance();
  });
});

window.addEventListener("resize", () => {
  if (perfCanvas.style.display !== "none") drawPerformance();
});
