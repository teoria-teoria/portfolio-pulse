// projection tab. a compounding growth estimate drawn on a canvas, no chart
// library. a single line does not need one. recalculates live as the inputs
// change.

const projStart = document.getElementById("proj-start");
const projMonths = document.getElementById("proj-months");
const projMonthsLabel = document.getElementById("proj-months-label");
const projRate = document.getElementById("proj-rate");
const projFinal = document.getElementById("proj-final");
const projDelta = document.getElementById("proj-delta");
const projCanvas = document.getElementById("proj-chart");

// balance after each month: start * (1 + rate)^m for m in 0..months.
function projectionSeries(start, months, ratePct) {
  const r = ratePct / 100;
  const series = [];
  for (let m = 0; m <= months; m++) {
    series.push(start * Math.pow(1 + r, m));
  }
  return series;
}

// compact money for axis labels: $12.3k, $1.2m.
function compactMoney(n) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(1) + "m";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(1) + "k";
  return "$" + Math.round(n);
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawProjection() {
  const start = parseFloat(projStart.value);
  const months = parseInt(projMonths.value, 10);
  const rate = parseFloat(projRate.value);

  projMonthsLabel.textContent = months;

  if (!(start >= 0) || !(months >= 1) || Number.isNaN(rate)) {
    projFinal.textContent = "--";
    projDelta.textContent = "--";
    return;
  }

  const series = projectionSeries(start, months, rate);
  const finalVal = series[series.length - 1];
  const delta = finalVal - start;

  projFinal.textContent = fmtMoney(finalVal);
  projDelta.innerHTML = `<span class="${moveClass(delta)}">${fmtSignedMoney(delta)}</span>`;

  drawChart(series);
}

function drawChart(values) {
  const cssW = projCanvas.clientWidth || 800;
  const cssH = Math.round(cssW * 0.4);
  const dpr = window.devicePixelRatio || 1;

  projCanvas.width = Math.round(cssW * dpr);
  projCanvas.height = Math.round(cssH * dpr);
  const ctx = projCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const accent = cssVar("--accent") || "#1b5299";
  const lineColor = cssVar("--line") || "#e5e8ec";
  const textColor = cssVar("--muted") || "#5c6470";

  const padL = 60, padR = 16, padT = 16, padB = 28;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min = min - 1; max = max + 1; } // flat line, give it room
  const range = max - min;
  min -= range * 0.05;
  max += range * 0.05;

  const n = values.length - 1;
  const xAt = (i) => padL + plotW * (i / n);
  const yAt = (v) => padT + plotH * (1 - (v - min) / (max - min));

  // horizontal gridlines with value labels
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

  // x axis labels: first and last month, plus midpoint
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const xTicks = n <= 1 ? [0, n] : [0, Math.round(n / 2), n];
  for (const i of xTicks) {
    ctx.fillText("mo " + i, xAt(i), cssH - padB + 8);
  }

  // area fill under the line
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, "rgba(27,82,153,0.12)");
  grad.addColorStop(1, "rgba(27,82,153,0)");
  ctx.beginPath();
  ctx.moveTo(xAt(0), yAt(values[0]));
  values.forEach((v, i) => ctx.lineTo(xAt(i), yAt(v)));
  ctx.lineTo(xAt(n), padT + plotH);
  ctx.lineTo(xAt(0), padT + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // the line itself
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = xAt(i), y = yAt(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  // end marker
  const lastX = xAt(n), lastY = yAt(values[n]);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
}

// live recalc on any input change
[projStart, projMonths, projRate].forEach((el) => {
  el.addEventListener("input", drawProjection);
});

// redraw on resize while the projection tab is visible
window.addEventListener("resize", () => {
  const panel = document.getElementById("projection");
  if (panel && panel.classList.contains("is-active")) drawProjection();
});
