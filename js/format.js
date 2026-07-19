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

// glaze for a holding preview card. a whisper of moss (up) or brick (down) from
// the top, deeper with the size of the move, over the card color. restrained on
// purpose. the day % itself is colored in the card. neutral with no quote.
function cardGlazeStyle(dp) {
  if (dp === null || dp === undefined || Number.isNaN(dp)) {
    return "background: var(--card);";
  }
  const intensity = Math.min(Math.abs(dp) / MOVE_FULL_AT, 1); // 0..1
  const rgb = dp >= 0 ? "var(--up-rgb)" : "var(--down-rgb)";
  const a = (0.03 + intensity * 0.11).toFixed(3);
  return `background: linear-gradient(180deg, rgba(${rgb}, ${a}), rgba(${rgb}, 0) 62%), var(--card);`;
}

// the signature: a coral -> pink -> periwinkle -> slate color ramp seen through
// vertical reeded glass. the fine vertical highlight/shadow ribs are the
// refraction. deterministic per ticker (a slight hue rotation and flute pitch),
// so each stock reads a little different with no fixed shape. no backdrop blur.
function tickerGradient(ticker) {
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) hash = (hash * 31 + ticker.charCodeAt(i)) >>> 0;
  const rand = (n) => {
    const x = Math.sin(hash * 0.0001 + n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  const off = Math.round(rand(3) * 54) - 27; // rotate the whole ramp -27..27
  const h1 = (14 + off + 360) % 360;  // coral
  const h2 = (332 + off + 360) % 360; // pink
  const h3 = (266 + off + 360) % 360; // periwinkle
  const h4 = (212 + off + 360) % 360; // slate
  const angle = 108 + Math.round(rand(7) * 12);
  const color =
    `linear-gradient(${angle}deg, ` +
    `hsl(${h1} 80% 66%), hsl(${h2} 72% 71%), hsl(${h3} 52% 67%), hsl(${h4} 30% 52%))`;

  const pitch = 10 + Math.round(rand(5) * 5); // flute width 10..15px
  const flute =
    `repeating-linear-gradient(90deg, ` +
    `rgba(255,255,255,0.22) 0, rgba(255,255,255,0) ${(pitch * 0.16).toFixed(1)}px, ` +
    `rgba(0,0,0,0.11) ${(pitch * 0.5).toFixed(1)}px, rgba(255,255,255,0) ${(pitch * 0.84).toFixed(1)}px, ` +
    `rgba(255,255,255,0.22) ${pitch}px)`;

  return `${flute}, ${color}`;
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
