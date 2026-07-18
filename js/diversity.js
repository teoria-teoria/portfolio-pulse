// diversity donut. allocation by current market value, shares times current
// price, drawn on a canvas with no chart library. reads the same priced state
// the summary and table use. a legend carries the ticker and percent labels.

const divCanvas = document.getElementById("diversity-chart");
const divLegend = document.getElementById("diversity-legend");
const divEmpty = document.getElementById("diversity-empty");

// a muted green ramp anchored on the accent. deep forest down to pale sage. not
// a rainbow. cycles if there are more holdings than colors.
const DONUT_COLORS = ["#0d5a37", "#16794c", "#3d9169", "#6aac8b", "#97c7b0", "#c3e0d3"];

function divCssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// market value for one holding, or null when its price is not in yet.
function divMarketValue(h) {
  const q = state.quotes[h.ticker];
  if (!q || typeof q.c !== "number" || q.c <= 0) return null;
  return h.shares * q.c;
}

function drawDiversity() {
  // aggregate by ticker so a repeated ticker is one slice.
  const byTicker = {};
  for (const h of state.holdings) {
    const mv = divMarketValue(h);
    if (mv === null) continue;
    byTicker[h.ticker] = (byTicker[h.ticker] || 0) + mv;
  }
  const entries = Object.entries(byTicker).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  // empty state: nothing priced yet.
  if (entries.length === 0 || total <= 0) {
    divCanvas.style.display = "none";
    divLegend.innerHTML = "";
    divEmpty.hidden = false;
    return;
  }
  divCanvas.style.display = "";
  divEmpty.hidden = true;

  // ---- draw the donut ----
  const cssSize = divCanvas.clientWidth || 200;
  const dpr = window.devicePixelRatio || 1;
  divCanvas.width = Math.round(cssSize * dpr);
  divCanvas.height = Math.round(cssSize * dpr);
  const ctx = divCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssSize, cssSize);

  const cx = cssSize / 2;
  const cy = cssSize / 2;
  const R = cssSize / 2 - 2;
  const cardColor = divCssVar("--card", "#ffffff");

  let angle = -Math.PI / 2; // start at top
  const single = entries.length === 1;
  entries.forEach(([, value], i) => {
    const sweep = (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, angle, angle + sweep);
    ctx.closePath();
    ctx.fillStyle = DONUT_COLORS[i % DONUT_COLORS.length];
    ctx.fill();
    // thin card-colored separators between slices. skip for a single 100% slice.
    if (!single) {
      ctx.strokeStyle = cardColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    angle += sweep;
  });

  // punch the hole to make it a donut.
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = cardColor;
  ctx.fill();

  // center count label.
  const inkColor = divCssVar("--ink", "#14171a");
  const mutedColor = divCssVar("--muted", "#6b7280");
  ctx.textAlign = "center";
  ctx.fillStyle = inkColor;
  ctx.font = "700 " + Math.round(cssSize * 0.16) + "px " + divCssVar("--sans", "sans-serif");
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(entries.length), cx, cy + 2);
  ctx.fillStyle = mutedColor;
  ctx.font = "500 " + Math.round(cssSize * 0.055) + "px " + divCssVar("--sans", "sans-serif");
  ctx.fillText(entries.length === 1 ? "holding" : "holdings", cx, cy + Math.round(cssSize * 0.13));

  // ---- legend: ticker + percent ----
  divLegend.innerHTML = entries
    .map(([ticker, value], i) => {
      const pct = (value / total) * 100;
      const color = DONUT_COLORS[i % DONUT_COLORS.length];
      return `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${color}"></span>
        <span class="legend-ticker">${ticker}</span>
        <span class="legend-pct">${pct.toFixed(1)}%</span>
      </div>`;
    })
    .join("");
}

// redraw on resize so the donut tracks its container.
window.addEventListener("resize", () => {
  if (divCanvas.style.display !== "none") drawDiversity();
});
