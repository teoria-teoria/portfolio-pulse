// small formatting and date helpers shared across the app.

function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "--";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// money with a leading + or - so gains and losses read at a glance.
function fmtSignedMoney(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "--";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return sign + fmtMoney(Math.abs(n));
}

function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "--";
  const sign = n > 0 ? "+" : "";
  return sign + n.toFixed(2) + "%";
}

// css class for a value: green up, red down, neutral otherwise.
function moveClass(n) {
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "";
}

// magnitude-scaled tint for a daily percent move. the background alpha grows
// with the size of the move off the real finnhub dp. a +0.3% move is a pale
// tint, a +6% move is fully saturated. same on the downside in red. returns an
// inline style string for a .move-chip. this replaces the old flat badge.
const MOVE_FULL_AT = 6; // percent that reads as fully saturated

function moveTintStyle(dp) {
  if (dp === null || dp === undefined || Number.isNaN(dp)) return "";
  if (dp === 0) return "color: var(--muted);";
  const intensity = Math.min(Math.abs(dp) / MOVE_FULL_AT, 1); // 0..1
  const rgb = dp > 0 ? "var(--up-rgb)" : "var(--down-rgb)";
  // a real 135deg gradient. the light stop stays soft, the deep stop darkens
  // with the size of the move. so a 0.1% move is a barely-there tint and a 6%+
  // move is a saturated fill, interpolated the whole way, not three fixed steps.
  const light = (0.12 + intensity * 0.12).toFixed(3);
  const deep = (0.22 + intensity * 0.73).toFixed(3);
  // once the fill is saturated enough, flip the text to white so it stays legible.
  const fg = intensity > 0.5 ? "#ffffff" : (dp > 0 ? "var(--up-deep)" : "var(--down-deep)");
  return `background: linear-gradient(135deg, rgba(${rgb}, ${light}), rgba(${rgb}, ${deep})); color: ${fg};`;
}

// glaze for a holding preview card. a wash of pine (up) or oxblood (down) that
// deepens with the size of the move, over the card color, so you can read how a
// holding is doing by its color and depth at a glance. neutral with no quote.
function cardGlazeStyle(dp) {
  if (dp === null || dp === undefined || Number.isNaN(dp)) {
    return "background: var(--card);";
  }
  const intensity = Math.min(Math.abs(dp) / MOVE_FULL_AT, 1); // 0..1
  const rgb = dp >= 0 ? "var(--up-rgb)" : "var(--down-rgb)";
  const top = (0.16 + intensity * 0.42).toFixed(3); // clear floor, scales with the move
  const bot = (0.06 + intensity * 0.18).toFixed(3);
  return `background: linear-gradient(165deg, rgba(${rgb}, ${top}), rgba(${rgb}, ${bot})), var(--card);`;
}

// each stock's detail banner: a gradient in the coral -> pink -> periwinkle ->
// slate family, but every ticker gets a different treatment so no two look the
// same. half are pixelated (a blocky mosaic sampled from the ramp), half are a
// soft gradient with grain (looking through distorted glass). deterministic per
// ticker. returns { style, cls } for the banner element.
function tickerBanner(ticker) {
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) hash = (hash * 31 + ticker.charCodeAt(i)) >>> 0;
  let seed = hash;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const off = Math.round(rand() * 54) - 27; // rotate the whole ramp -27..27
  const stops = [
    [(14 + off + 360) % 360, 80, 66],   // coral
    [(332 + off + 360) % 360, 72, 71],  // pink
    [(266 + off + 360) % 360, 52, 67],  // periwinkle
    [(212 + off + 360) % 360, 30, 52]   // slate
  ];
  const angle = 108 + Math.round(rand() * 22);

  if (hash % 2 === 0) {
    return { style: pixelBannerStyle(stops, rand), cls: "banner-pixel" };
  }
  const grad = "linear-gradient(" + angle + "deg, " +
    stops.map((s) => "hsl(" + s[0] + " " + s[1] + "% " + s[2] + "%)").join(", ") + ")";
  const sheen = "linear-gradient(102deg, rgba(255,255,255,0.12), rgba(255,255,255,0) 32%, " +
    "rgba(255,255,255,0.07) 60%, rgba(255,255,255,0) 100%)";
  return { style: "background:" + sheen + "," + grad + ";", cls: "banner-soft" };
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// a blocky mosaic sampled across the ramp, with per-cell brightness jitter, as a
// canvas data-uri. near banner size so the squares stay crisp.
function pixelBannerStyle(stops, rand) {
  const cols = 16, rows = 5, cell = 28;
  const cv = document.createElement("canvas");
  cv.width = cols * cell;
  cv.height = rows * cell;
  const ctx = cv.getContext("2d");
  const rgb = stops.map((s) => hslToRgb(s[0], s[1], s[2]));
  for (let x = 0; x < cols; x++) {
    const seg = Math.min((x / (cols - 1)) * 3, 2.999);
    const i = Math.floor(seg), f = seg - i;
    const base = [0, 1, 2].map((c) => rgb[i][c] + (rgb[i + 1][c] - rgb[i][c]) * f);
    for (let y = 0; y < rows; y++) {
      const j = 0.82 + rand() * 0.36;
      const px = base.map((v) => Math.max(0, Math.min(255, Math.round(v * j))));
      ctx.fillStyle = "rgb(" + px[0] + "," + px[1] + "," + px[2] + ")";
      ctx.fillRect(x * cell, y * cell, cell + 1, cell + 1);
    }
  }
  return "background-image:url(" + cv.toDataURL("image/png") + ");background-size:cover;background-position:center;";
}

// yyyy-mm-dd for a date in america/new_york. en-CA gives the iso-ish order.
function isoDateET(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function todayET() {
  return isoDateET(new Date());
}

function daysAgoET(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDateET(d);
}

// is the us market in regular hours right now. weekend and after-hours read as
// closed. does not account for holidays, so a holiday still shows "last close"
// via the closed path only if it falls on a weekday it would read live, but the
// staleness label below is the honest fallback either way.
function isMarketLive() {
  const etString = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etString);
  const day = et.getDay(); // 0 sun ... 6 sat
  const minutes = et.getHours() * 60 + et.getMinutes();
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  const weekday = day >= 1 && day <= 5;
  return weekday && minutes >= open && minutes < close;
}
