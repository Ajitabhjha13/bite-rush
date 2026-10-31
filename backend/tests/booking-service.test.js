const db = require('./helpers');
const Table = require('../models/Table');
const Reservation = require('../models/Reservation');
const { seed } = require('../seedTables');
const svc = require('../services/bookingService');

// A Date for an IST wall-clock time
const ist = (s) => new Date(new Date(`${s}Z`).getTime() - 5.5 * 3600e3);

const NOW = ist('2026-11-05T10:00:00');
const DATE = '2026-11-07';

beforeAll(async () => {
  await db.connect();
  await Table.init();
  await Reservation.init();
});
beforeEach(async () => { await seed(false); });
afterEach(db.clearDb);
afterAll(db.disconnect);

const newUser = async () => (await db.createUser()).user;
const hold = (userId, o = {}) => svc.holdSeat({ userId, date: DATE, slot: '19:00', guests: 2, now: NOW, ...o });

describe('availability', () => {
  test('counts only the online pool, by seat size', async () => {
    const a = await svc.getAvailability(DATE, NOW);
    expect(a.slots).toHaveLength(5);
    expect(a.slots[0].free).toEqual({ 2: 2, 4: 3, 6: 1 });
    expect(a.slots[0].total_free).toBe(6);
  });

  test('a held table disappears from that slot only', async () => {
    await hold((await newUser())._id);
    const a = await svc.getAvailability(DATE, NOW);
    const s1900 = a.slots.find((s) => s.slot === '19:00');
    const s2030 = a.slots.find((s) => s.slot === '20:30');
    expect(s1900.free[2]).toBe(1);
    expect(s2030.free[2]).toBe(2);
  });
});

describe('best-fit holding', () => {
  test('picks the smallest table that fits', async () => {
    const mk = async (guests) => {
      const { reservation } = await hold((await newUser())._id, { guests });
      return (await Table.findById(reservation.table)).seats;
    };
    expect(await mk(2)).toBe(2);
    expect(await mk(3)).toBe(4);
    expect(await mk(5)).toBe(6);
  });

  test('walk-in tables are never given online', async () => {
    const seats = [];
    for (let i = 0; i < 6; i++) {
      const { reservation } = await hold((await newUser())._id);
      const t = await Table.findById(reservation.table);
      expect(t.bookable_online).toBe(true);
      seats.push(t.number);
    }
    expect(new Set(seats).size).toBe(6);
    await expect(hold((await newUser())._id)).rejects.toMatchObject({ status: 409 });
  });

  test('8 people race for 6 tables: exactly 6 win on 6 different tables', async () => {
    const users = [];
    for (let i = 0; i < 8; i++) users.push(await newUser());
    const results = await Promise.allSettled(users.map((u) => hold(u._id)));
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    expect(won).toHaveLength(6);
    expect(lost).toHaveLength(2);
    expect(lost.every((r) => r.reason.status === 409)).toBe(true);
    expect(new Set(won.map((r) => String(r.value.reservation.table))).size).toBe(6);
  });

  test('guests out of range are rejected', async () => {
    const u = await newUser();
    await expect(hold(u._id, { guests: 7 })).rejects.toMatchObject({ status: 400 });
    await expect(hold(u._id, { guests: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(hold(u._id, { slot: '18:00' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('idempotency and one-hold-per-user', () => {
  test('same key twice -> one booking, second call is a replay', async () => {
    const u = await newUser();
    const a = await hold(u._id, { idempotencyKey: 'k1' });
    const b = await hold(u._id, { idempotencyKey: 'k1' });
    expect(b.replayed).toBe(true);
    expect(String(b.reservation._id)).toBe(String(a.reservation._id));
    expect(await Reservation.countDocuments()).toBe(1);
  });

  test('5 parallel double-clicks with one key -> still one booking', async () => {
    const u = await newUser();
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => hold(u._id, { idempotencyKey: 'dbl' })));
    expect(new Set(rs.map((r) => String(r.reservation._id))).size).toBe(1);
    expect(await Reservation.countDocuments()).toBe(1);
  });

  test('a second hold while one is pending is refused; after confirming, another slot is fine', async () => {
    const u = await newUser();
    const first = await hold(u._id);
    await expect(hold(u._id, { slot: '20:30' })).rejects.toMatchObject({ status: 409 });
    await svc.confirmHold({ reservationId: first.reservation._id, userId: u._id, now: NOW });
    const second = await hold(u._id, { slot: '20:30' });
    expect(second.reservation.status).toBe('held');
    await svc.confirmHold({ reservationId: second.reservation._id, userId: u._id, now: NOW });
    await expect(hold(u._id, { slot: '20:30' })).rejects.toMatchObject({ status: 409 }); // same slot again
  });
});

describe('11:59 PM cutoff', () => {
  test('11:57 PM tonight: tomorrow is still bookable', async () => {
    const u = await newUser();
    const r = await svc.holdSeat({ userId: u._id, date: '2026-11-06', slot: '19:00', guests: 2, now: ist('2026-11-05T23:57:00') });
    expect(r.reservation.status).toBe('held');
  });

  test('12:00 AM: that day is closed for new holds', async () => {
    const u = await newUser();
    await expect(svc.holdSeat({ userId: u._id, date: '2026-11-06', slot: '19:00', guests: 2, now: ist('2026-11-06T00:00:00') }))
      .rejects.toMatchObject({ status: 400 });
    await expect(svc.getAvailability('2026-11-06', ist('2026-11-06T00:00:00'))).rejects.toMatchObject({ status: 400 });
  });

  test('hold at 11:59 PM, pay at 12:00:30 AM -> confirmed (hold still valid)', async () => {
    const u = await newUser();
    const { reservation } = await svc.holdSeat({ userId: u._id, date: '2026-11-06', slot: '19:00', guests: 2, now: ist('2026-11-05T23:59:00') });
    const c = await svc.confirmHold({ reservationId: reservation._id, userId: u._id, now: ist('2026-11-06T00:00:30') });
    expect(c.status).toBe('confirmed');
  });

  test('hold at 11:57 PM, pay at 12:03 AM -> expired, seat released', async () => {
    const u = await newUser();
    const { reservation } = await svc.holdSeat({ userId: u._id, date: '2026-11-06', slot: '19:00', guests: 2, now: ist('2026-11-05T23:57:00') });
    await expect(svc.confirmHold({ reservationId: reservation._id, userId: u._id, now: ist('2026-11-06T00:03:00') }))
      .rejects.toMatchObject({ status: 409 });
    expect((await Reservation.findById(reservation._id)).status).toBe('expired');
  });
});

describe('2-minute hold expiry', () => {
  test('late payment is refused and the seat goes to the next person', async () => {
    const a = await newUser();
    const b = await newUser();
    for (let i = 0; i < 5; i++) {                                                // fill 5 of 6 tables, paid
      const o = await newUser();
      const h = await hold(o._id, { guests: 2 });
      await svc.confirmHold({ reservationId: h.reservation._id, userId: o._id, now: NOW });
    }
    const { reservation } = await hold(a._id);                                  // last table
    await expect(hold(b._id)).rejects.toMatchObject({ status: 409 });            // full now

    const later = new Date(NOW.getTime() + 3 * 60 * 1000);
    await expect(svc.confirmHold({ reservationId: reservation._id, userId: a._id, now: later }))
      .rejects.toMatchObject({ status: 409 });
    const mine = await hold(b._id, { now: later });                              // b gets it
    expect(String(mine.reservation.table)).toBe(String(reservation.table));
  });

  test('payment inside the 2 minutes works', async () => {
    const u = await newUser();
    const { reservation } = await hold(u._id);
    const c = await svc.confirmHold({ reservationId: reservation._id, userId: u._id, now: new Date(NOW.getTime() + 90 * 1000) });
    expect(c.status).toBe('confirmed');
    expect(c.hold_expires_at).toBeNull();
  });

  test('sweeper expires stale holds and confirmed bookings are never touched', async () => {
    const [u1, u2] = [await newUser(), await newUser()];
    const h = await hold(u1._id);
    const c = await hold(u2._id);
    await svc.confirmHold({ reservationId: c.reservation._id, userId: u2._id, now: NOW });
    const n = await svc.expireStaleHolds(new Date(NOW.getTime() + 10 * 60 * 1000));
    expect(n).toBe(1);
    expect((await Reservation.findById(h.reservation._id)).status).toBe('expired');
    expect((await Reservation.findById(c.reservation._id)).status).toBe('confirmed');
  });

  test("nobody can confirm someone else's hold", async () => {
    const [u1, u2] = [await newUser(), await newUser()];
    const { reservation } = await hold(u1._id);
    await expect(svc.confirmHold({ reservationId: reservation._id, userId: u2._id, now: NOW }))
      .rejects.toMatchObject({ status: 403 });
  });
});

describe('cancel', () => {
  test('owner cancels and the seat is freed; others cannot', async () => {
    const [u1, u2] = [await newUser(), await newUser()];
    const { reservation } = await hold(u1._id);
    await expect(svc.cancelBooking({ reservationId: reservation._id, userId: u2._id, now: NOW }))
      .rejects.toMatchObject({ status: 403 });
    const c = await svc.cancelBooking({ reservationId: reservation._id, userId: u1._id, now: NOW });
    expect(c.status).toBe('cancelled');
    const a = await svc.getAvailability(DATE, NOW);
    expect(a.slots.find((s) => s.slot === '19:00').total_free).toBe(6);
  });

  test('confirmed booking can be cancelled before the day, not on the day', async () => {
    const u = await newUser();
    const { reservation } = await hold(u._id);
    await svc.confirmHold({ reservationId: reservation._id, userId: u._id, now: NOW });
    await expect(svc.cancelBooking({ reservationId: reservation._id, userId: u._id, now: ist('2026-11-07T09:00:00') }))
      .rejects.toMatchObject({ status: 409 });
    const c = await svc.cancelBooking({ reservationId: reservation._id, userId: u._id, now: ist('2026-11-06T22:00:00') });
    expect(c.status).toBe('cancelled');
  });
});
