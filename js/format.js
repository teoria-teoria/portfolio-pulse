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
