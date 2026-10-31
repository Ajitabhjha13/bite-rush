const b = require('../config/booking');

// Build a Date from an IST wall-clock time
const ist = (s) => new Date(new Date(`${s}Z`).getTime() - 5.5 * 3600e3);

describe('booking config', () => {
  test('hold time is 2 minutes', () => {
    expect(b.HOLD_MINUTES).toBe(2);
    const now = new Date('2026-11-02T10:00:00Z');
    expect(b.holdExpiry(now) - now).toBe(2 * 60 * 1000);
  });

  test('istToday uses IST, not UTC', () => {
    // 20:00 UTC on 1 Nov = 01:30 IST on 2 Nov
    expect(b.istToday(new Date('2026-11-01T20:00:00Z'))).toBe('2026-11-02');
    expect(b.istToday(new Date('2026-11-01T10:00:00Z'))).toBe('2026-11-01');
  });

  test('cutoff: 11:57 PM tonight can still book tomorrow', () => {
    expect(b.isBookableDate('2026-11-02', ist('2026-11-01T23:57:00'))).toBe(true);
  });

  test('cutoff: right after midnight, that day is closed', () => {
    expect(b.isBookableDate('2026-11-02', ist('2026-11-02T00:00:00'))).toBe(false);
    expect(b.isBookableDate('2026-11-03', ist('2026-11-02T00:00:00'))).toBe(true);
  });

  test('today, past dates, and >7 days ahead are not bookable', () => {
    const now = ist('2026-11-01T12:00:00');
    expect(b.isBookableDate('2026-11-01', now)).toBe(false);
    expect(b.isBookableDate('2026-10-30', now)).toBe(false);
    expect(b.isBookableDate('2026-11-08', now)).toBe(true);
    expect(b.isBookableDate('2026-11-09', now)).toBe(false);
  });

  test('rejects malformed or impossible dates and unknown slots', () => {
    const now = ist('2026-11-01T12:00:00');
    expect(b.isBookableDate('2026-02-30', now)).toBe(false);
    expect(b.isBookableDate('02-11-2026', now)).toBe(false);
    expect(b.isBookableDate(null, now)).toBe(false);
    expect(b.isValidSlot('19:00')).toBe(true);
    expect(b.isValidSlot('18:00')).toBe(false);
  });
});
