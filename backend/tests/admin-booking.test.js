const request = require('supertest');
const app = require('../app');
const db = require('./helpers');
const Table = require('../models/Table');
const Reservation = require('../models/Reservation');
const { seed } = require('../seedTables');
const pay = require('../services/paymentService');
const { istToday, addDays } = require('../config/booking');

let fake;
beforeAll(async () => { await db.connect(); await Table.init(); await Reservation.init(); });
beforeEach(async () => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_abc';
  process.env.RAZORPAY_KEY_SECRET = 'secret';
  fake = {
    orders: { create: jest.fn(async (o) => ({ id: 'order_x', amount: o.amount })) },
    payments: { refund: jest.fn(async (id, o) => ({ id: `rfnd_${id}`, amount: o.amount })) }
  };
  pay.setClient(fake);
  await seed(false);
});
afterEach(db.clearDb);
afterAll(async () => {
  delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET;
  await db.disconnect();
});

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const admin = () => db.createUser({ role: 'admin', name: 'Boss' });

async function makeBooking({ user, date, slot = '19:00', status = 'confirmed', tableNumber = 3, guests = 3, paid = true }) {
  const table = await Table.findOne({ number: tableNumber });
  return Reservation.create({
    user: user._id, table: table._id, date, slot, guests, status,
    amount: 10000,
    hold_expires_at: status === 'held' ? new Date(Date.now() + 60000) : null,
    payment_status: paid && status === 'confirmed' ? 'paid' : 'pending',
    razorpay_payment_id: paid && status === 'confirmed' ? 'pay_1' : undefined
  });
}

describe('access control', () => {
  test('no token -> 401, customer -> 403 on every admin route', async () => {
    const { token } = await db.createUser();
    const id = '64b000000000000000000001';
    const calls = [
      (r) => r.get(`/api/bookings/admin/grid?date=${istToday()}`),
      (r) => r.put(`/api/bookings/admin/${id}/attendance`).send({ attendance: 'seated' }),
      (r) => r.put(`/api/bookings/admin/${id}/cancel`).send({}),
      (r) => r.put(`/api/tables/${id}`).send({ bookable_online: false })
    ];
    for (const c of calls) {
      expect((await c(request(app))).status).toBe(401);
      expect((await c(request(app)).set(bearer(token))).status).toBe(403);
    }
  });
});

describe('grid', () => {
  test('shape, summary, customer details; works for today and past dates', async () => {
    const { token } = await admin();
    const { user } = await db.createUser({ name: 'Riya' });
    const d = addDays(istToday(), 2);
    await makeBooking({ user, date: d, slot: '19:00', tableNumber: 3, guests: 3 });
    await makeBooking({ user, date: d, slot: '12:00', tableNumber: 1, guests: 2, status: 'held' });

    const res = await request(app).get(`/api/bookings/admin/grid?date=${d}`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.tables).toHaveLength(10);
    expect(res.body.slots).toHaveLength(5);
    expect(res.body.summary).toMatchObject({ confirmed: 1, held: 1, expected_guests: 3 });
    // 6 online tables x 5 slots = 30, minus the 2 used online cells
    expect(res.body.summary.free_online_slots).toBe(28);
    const t3 = res.body.tables.find((t) => t.number === 3);
    expect(t3.cells['19:00']).toMatchObject({ status: 'confirmed', guests: 3, customer: { name: 'Riya' } });
    expect(t3.cells['12:00']).toBeNull();

    expect((await request(app).get(`/api/bookings/admin/grid?date=${istToday()}`).set(bearer(token))).status).toBe(200);
    expect((await request(app).get(`/api/bookings/admin/grid?date=${addDays(istToday(), -10)}`).set(bearer(token))).status).toBe(200);
  });

  test('bad date -> 400', async () => {
    const { token } = await admin();
    expect((await request(app).get('/api/bookings/admin/grid?date=nope').set(bearer(token))).status).toBe(400);
    expect((await request(app).get('/api/bookings/admin/grid?date=2026-13-45').set(bearer(token))).status).toBe(400);
  });

  test('expired holds are not shown', async () => {
    const { token } = await admin();
    const { user } = await db.createUser();
    const d = addDays(istToday(), 2);
    const r = await makeBooking({ user, date: d, status: 'held' });
    await Reservation.updateOne({ _id: r._id }, { $set: { hold_expires_at: new Date(Date.now() - 1000) } });
    const res = await request(app).get(`/api/bookings/admin/grid?date=${d}`).set(bearer(token));
    expect(res.body.summary.held).toBe(0);
  });
});

describe('attendance', () => {
  test('can mark seated / no_show on the booking day, and revert to pending', async () => {
    const { token } = await admin();
    const { user } = await db.createUser();
    const r = await makeBooking({ user, date: istToday() });
    const put = (a) => request(app).put(`/api/bookings/admin/${r._id}/attendance`).set(bearer(token)).send({ attendance: a });
    expect((await put('seated')).body.reservation.attendance).toBe('seated');
    expect((await put('no_show')).body.reservation.attendance).toBe('no_show');
    expect((await put('pending')).body.reservation.attendance).toBe('pending');
  });

  test('rejects future bookings, held bookings, bad values and unknown ids', async () => {
    const { token } = await admin();
    const { user } = await db.createUser();
    const future = await makeBooking({ user, date: addDays(istToday(), 3) });
    const held = await makeBooking({ user, date: istToday(), status: 'held', tableNumber: 4 });
    const put = (id, a) => request(app).put(`/api/bookings/admin/${id}/attendance`).set(bearer(token)).send({ attendance: a });
    expect((await put(future._id, 'seated')).status).toBe(409);
    expect((await put(held._id, 'seated')).status).toBe(409);
    expect((await put(future._id, 'late')).status).toBe(400);
    expect((await put('64b000000000000000000001', 'seated')).status).toBe(404);
  });
});

describe('restaurant cancel', () => {
  test('confirmed booking is refunded 100% even minutes before the slot', async () => {
    const { token } = await admin();
    const { user } = await db.createUser();
    const r = await makeBooking({ user, date: istToday(), slot: '12:00' });
    const res = await request(app).put(`/api/bookings/admin/${r._id}/cancel`).set(bearer(token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.refund).toMatchObject({ percent: 100, amount: 10000, status: 'processed' });
    expect(fake.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 10000 }));
    const after = await Reservation.findById(r._id);
    expect(after).toMatchObject({ status: 'cancelled', is_active: false, payment_status: 'refunded' });
  });

  test('cancelling twice never refunds twice', async () => {
    const { token } = await admin();
    const { user } = await db.createUser();
    const r = await makeBooking({ user, date: addDays(istToday(), 2) });
    const url = `/api/bookings/admin/${r._id}/cancel`;
    expect((await request(app).put(url).set(bearer(token)).send({})).status).toBe(200);
    expect((await request(app).put(url).set(bearer(token)).send({})).status).toBe(409);
    expect(fake.payments.refund).toHaveBeenCalledTimes(1);
  });

  test('held booking is released without any refund call', async () => {
    const { token } = await admin();
    const { user } = await db.createUser();
    const r = await makeBooking({ user, date: addDays(istToday(), 2), status: 'held' });
    const res = await request(app).put(`/api/bookings/admin/${r._id}/cancel`).set(bearer(token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.refund.status).toBe('none');
    expect(fake.payments.refund).not.toHaveBeenCalled();
    expect((await Reservation.findById(r._id)).is_active).toBe(false);
  });

  test('seated party cannot be cancelled', async () => {
    const { token } = await admin();
    const { user } = await db.createUser();
    const r = await makeBooking({ user, date: istToday() });
    await Reservation.updateOne({ _id: r._id }, { $set: { attendance: 'seated' } });
    const res = await request(app).put(`/api/bookings/admin/${r._id}/cancel`).set(bearer(token)).send({});
    expect(res.status).toBe(409);
    expect((await Reservation.findById(r._id)).status).toBe('confirmed');
  });

  test('if Razorpay fails, booking is still cancelled and refund is flagged for retry', async () => {
    const { token } = await admin();
    const { user } = await db.createUser();
    const r = await makeBooking({ user, date: addDays(istToday(), 2) });
    fake.payments.refund.mockRejectedValueOnce(new Error('down'));
    const res = await request(app).put(`/api/bookings/admin/${r._id}/cancel`).set(bearer(token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.refund.status).toBe('pending');
    expect(await Reservation.findById(r._id)).toMatchObject({ status: 'cancelled', refund_status: 'failed' });
  });

  test('the freed table can be booked again', async () => {
    const { token } = await admin();
    const { user } = await db.createUser();
    const d = addDays(istToday(), 2);
    const r = await makeBooking({ user, date: d, tableNumber: 1, guests: 2 });
    await request(app).put(`/api/bookings/admin/${r._id}/cancel`).set(bearer(token)).send({});
    await expect(makeBooking({ user, date: d, tableNumber: 1, guests: 2, paid: false })).resolves.toBeTruthy();
  });
});

describe('table toggles', () => {
  test('moving a table out of the online pool shrinks public availability', async () => {
    const { token } = await admin();
    const d = addDays(istToday(), 2);
    const before = await request(app).get(`/api/bookings/availability?date=${d}`);
    const t6 = await Table.findOne({ number: 6 }); // the only 6-seater online
    const res = await request(app).put(`/api/tables/${t6._id}`).set(bearer(token)).send({ bookable_online: false });
    expect(res.status).toBe(200);
    expect(res.body.table.bookable_online).toBe(false);
    const after = await request(app).get(`/api/bookings/availability?date=${d}`);
    expect(JSON.stringify(after.body)).not.toEqual(JSON.stringify(before.body));
  });

  test('reports upcoming bookings on that table', async () => {
    const { token } = await admin();
    const { user } = await db.createUser();
    await makeBooking({ user, date: addDays(istToday(), 2), tableNumber: 3 });
    const t3 = await Table.findOne({ number: 3 });
    const res = await request(app).put(`/api/tables/${t3._id}`).set(bearer(token)).send({ bookable_online: false });
    expect(res.body.upcoming_bookings).toBe(1);
  });

  test('validation: non-boolean, empty body, bad id, unknown id', async () => {
    const { token } = await admin();
    const t = await Table.findOne({ number: 1 });
    const put = (id, body) => request(app).put(`/api/tables/${id}`).set(bearer(token)).send(body);
    expect((await put(t._id, { bookable_online: 'yes' })).status).toBe(400);
    expect((await put(t._id, {})).status).toBe(400);
    expect((await put('bad', { is_active: false })).status).toBe(400);
    expect((await put('64b000000000000000000001', { is_active: false })).status).toBe(404);
  });
});
