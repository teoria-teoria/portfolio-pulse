// the performance graph. one line of total portfolio value over time.
//
// honest model: the only real numbers are total cost basis (what you put in),
// current market value (from live quotes), and your start date. so the line
// runs from cost basis at inception to current value now. those endpoints are
// real. the shape between them is a deterministic squiggle, invented, forced to
// zero at the ends so the anchors stay exact. every timeframe caps at inception,
// so a 3 month view when you have only been invested a few weeks just shows
// inception to now instead of inventing a start value. day uses the real
// previous close as its left anchor. still modeled between the ends, not real
// history (finnhub's free tier has no candles).

const perfCanvas = document.getElementById("perf-chart");
const perfEmpty = document.getElementById("perf-empty");
const inceptionInput = document.getElementById("inception-date");

const INCEPTION_KEY = "pp:inception";
const DEFAULT_INCEPTION = "2026-06-24";

const TF_META = {
  day:     { days: 1,  seed: 1.3,  freq: 8,  back: "1 day ago",    fwd: "+1 day" },
  week:    { days: 7,  seed: 3.9,  freq: 11, back: "1 week ago",   fwd: "+1 week" },
  month:   { days: 30, seed: 7.1,  freq: 14, back: "1 month ago",  fwd: "+1 month" },
  quarter: { days: 90, seed: 12.4, freq: 18, back: "3 months ago", fwd: "+3 months" }
};

let perfTimeframe = "day";

const HIST_FRACTION = 0.75;
const HIST_POINTS = 48;
const PROJ_POINTS = 22;

// ---- inception ------------------------------------------------------------

function getInceptionStr() {
  return localStorage.getItem(INCEPTION_KEY) || DEFAULT_INCEPTION;
}
function getInceptionDate() {
  const d = new Date(getInceptionStr() + "T00:00:00");
  return isNaN(d.getTime()) ? new Date(DEFAULT_INCEPTION + "T00:00:00") : d;
}
function fmtShortDate(d) {
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
  const MS = 86400000;
  let daysSince = (new Date() - inception) / MS;
  if (!(daysSince > 0)) daysSince = 0.5; // inception today or in the future

  // value on the cost-basis -> current-value line, `daysAgo` before now.
  const lineValue = (daysAgo) => {
    const frac = Math.min(Math.max((daysSince - daysAgo) / daysSince, 0), 1);
    return basis + (now - basis) * frac;
  };

  const effDays = Math.min(meta.days, daysSince);
  const cappedAtInception = meta.days >= daysSince;

  // left anchor. day uses the real previous close, longer windows use the line.
  let leftValue;
  if (tf === "day") leftValue = prev > 0 ? prev : lineValue(effDays);
  else leftValue = lineValue(effDays);

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

  // projection: carry the recent daily trend a short window forward.
  const dailyR = prev > 0 ? now / prev - 1 : 0;
  const projStep = Math.pow(1 + dailyR, Math.max(effDays, 1));
  const projection = [];
  for (let j = 0; j < PROJ_POINTS; j++) {
    const t = j / (PROJ_POINTS - 1);
    const base = now * Math.pow(projStep, t);
    const env = Math.sin(Math.PI * t);
    projection.push(base + amp * 0.6 * env * smoothNoise(t * meta.freq + 3.1, meta.seed + 1.7));
  }
  projection[0] = now;

  return {
    history,
    projection,
    now,
    up: now >= leftValue,
    backLabel: cappedAtInception ? fmtShortDate(inception) : meta.back,
    fwdLabel: meta.fwd
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

  const { history, projection, now, up } = series;

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
  const upC = "rgb(" + (cssVar("--up-rgb") || "18,134,79") + ")";
  const downC = "rgb(" + (cssVar("--down-rgb") || "198,39,58") + ")";
  const trend = up ? upC : downC;
  const trendRgb = up ? (cssVar("--up-rgb") || "18,134,79") : (cssVar("--down-rgb") || "198,39,58");

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

  ctx.fillStyle = "rgba(0,0,0,0.02)";
  ctx.fillRect(nowX, padT, padL + plotW - nowX, plotH);

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
  ctx.setLineDash([]);
  ctx.stroke();

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

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(nowX, padT);
  ctx.lineTo(nowX, padT + plotH);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(nowX, yAt(now), 3.5, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(series.backLabel, padL, cssH - padB + 8);
  ctx.textAlign = "center";
  ctx.fillText("now", nowX, cssH - padB + 8);
  ctx.textAlign = "right";
  ctx.fillText(series.fwdLabel, cssW - padR, cssH - padB + 8);
}

// ---- controls -------------------------------------------------------------

document.querySelectorAll(".tf-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    perfTimeframe = btn.dataset.tf;
    document.querySelectorAll(".tf-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
    drawPerformance();
  });
});

if (inceptionInput) {
  inceptionInput.value = getInceptionStr();
  inceptionInput.addEventListener("change", () => {
    if (inceptionInput.value) {
      localStorage.setItem(INCEPTION_KEY, inceptionInput.value);
      drawPerformance();
    }
  });
}

window.addEventListener("resize", () => {
  if (perfCanvas.style.display !== "none") drawPerformance();
});
