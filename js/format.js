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

// glaze for a holding preview card. green when the day is up, red when down,
// deeper with the size of the move. kept soft so the dark ticker text on top
// stays readable. neutral when there is no quote yet.
function cardGlazeStyle(dp) {
  if (dp === null || dp === undefined || Number.isNaN(dp)) {
    return "background: linear-gradient(135deg, #ffffff, #f2f2f1);";
  }
  const intensity = Math.min(Math.abs(dp) / MOVE_FULL_AT, 1); // 0..1, same scale as the chip
  const rgb = dp >= 0 ? "var(--up-rgb)" : "var(--down-rgb)";
  const light = (0.06 + intensity * 0.14).toFixed(3);
  const deep = (0.16 + intensity * 0.45).toFixed(3);
  return `background: linear-gradient(135deg, rgba(${rgb}, ${light}), rgba(${rgb}, ${deep}));`;
}

// each stock gets its own signature gradient for the detail modal. deterministic
// off the ticker so it is stable, decorative only, it means nothing.
function tickerGradient(ticker) {
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) {
    hash = (hash * 31 + ticker.charCodeAt(i)) % 360;
  }
  const h1 = hash;
  const h2 = (hash + 38) % 360;
  return `linear-gradient(135deg, hsl(${h1} 58% 44%), hsl(${h2} 62% 28%))`;
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
