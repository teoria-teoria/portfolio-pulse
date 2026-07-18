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
  const alpha = (0.08 + intensity * 0.84).toFixed(3); // barely-there .08 up to .92
  // once the fill is saturated enough, flip the text to white so it stays legible.
  const fg = intensity > 0.5 ? "#ffffff" : (dp > 0 ? "var(--up)" : "var(--down)");
  return `background: rgba(${rgb}, ${alpha}); color: ${fg};`;
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
