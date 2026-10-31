// Table-booking rules in one place. All "dates" are IST calendar dates
// ('YYYY-MM-DD'); the server runs in UTC, so we never rely on local time.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const SLOTS = ['12:00', '13:30', '15:00', '19:00', '20:30']; // fixed 90-min slots
const SLOT_MINUTES = 90;
const HOLD_MINUTES = Number(process.env.BOOKING_HOLD_MINUTES) || 2; // seat held while paying
const MAX_ADVANCE_DAYS = 7;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Today's date in IST. `now` is injectable so tests control the clock.
function istToday(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

// Cutoff rule: bookings for day D close at 23:59:59 IST on day D-1.
// So the earliest bookable date is always "tomorrow" (IST), latest is today+7.
function isBookableDate(dateStr, now = new Date()) {
  if (!isValidDateString(dateStr)) return false;
  const today = istToday(now);
  return dateStr >= addDays(today, 1) && dateStr <= addDays(today, MAX_ADVANCE_DAYS);
}

function isValidSlot(slot) {
  return SLOTS.includes(slot);
}

function holdExpiry(now = new Date()) {
  return new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);
}

module.exports = {
  SLOTS, SLOT_MINUTES, HOLD_MINUTES, MAX_ADVANCE_DAYS,
  istToday, addDays, isValidDateString, isBookableDate, isValidSlot, holdExpiry
};
