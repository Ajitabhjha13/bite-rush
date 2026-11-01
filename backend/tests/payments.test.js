const crypto = require('crypto');
const request = require('supertest');
const app = require('../app');
const db = require('./helpers');
const Table = require('../models/Table');
const Reservation = require('../models/Reservation');
const WebhookEvent = require('../models/WebhookEvent');
const { seed } = require('../seedTables');
const pay = require('../services/paymentService');
const svc = require('../services/bookingService');
const { istToday, addDays } = require('../config/booking');

const KEY_SECRET = 'test_key_secret';
const WH_SECRET = 'test_webhook_secret';
const ist = (s) => new Date(new Date(`${s}Z`).getTime() - 5.5 * 3600e3);
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

let fake;
function makeFake() {
  let n = 0;
  return {
    orders: { create: jest.fn(async (o) => ({ id: `order_${++n}`, amount: o.amount, currency: o.currency })) },
    payments: { refund: jest.fn(async (id, o) => ({ id: `rfnd_${id}`, amount: o.amount })) }
  };
}

beforeAll(async () => {
  await db.connect();
  await Table.init(); await Reservation.init(); await WebhookEvent.init();
});
beforeEach(async () => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_abc';
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WH_SECRET;
  fake = makeFake();
  pay.setClient(fake);
  await seed(false);
});
afterEach(db.clearDb);
afterAll(async () => {
  delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET; delete process.env.RAZORPAY_WEBHOOK_SECRET;
  await db.disconnect();
});

const date = () => addDays(istToday(), 2);
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

async function holdVia(token, o = {}) {
  return request(app).post('/api/bookings/hold').set(bearer(token))
    .send({ date: date(), slot: '19:00', guests: 2, ...o });
}
const checkoutSig = (orderId, paymentId) => hmac(KEY_SECRET, `${orderId}|${paymentId}`);

function webhook(payload, { secret = WH_SECRET, eventId = `evt_${Math.random()}` } = {}) {
  const raw = JSON.stringify(payload);
  return request(app).post('/api/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', hmac(secret, raw))
    .set('X-Razorpay-Event-Id', eventId)
    .send(raw);
}
const captured = (orderId, paymentId, amount = 10000) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, status: 'captured' } } }
});

describe('order creation on hold', () => {
  test('hold returns a Razorpay order for the server-decided Rs 100', async () => {
    const { token } = await db.createUser();
    const res = await holdVia(token);
    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({ order_id: 'order_1', amount: 10000, currency: 'INR', key_id: 'rzp_test_abc', timeout_seconds: 120 });
    expect(fake.orders.create.mock.calls[0][0].amount).toBe(10000);
    expect((await Reservation.findById(res.body.reservation._id)).razorpay_order_id).toBe('order_1');
  });

  test('retry with same key reuses the same order (no 2nd Razorpay order)', async () => {
    const { token } = await db.createUser();
    const a = await holdVia(token, { idempotency_key: 'k' });
    const b = await holdVia(token, { idempotency_key: 'k' });
    expect(b.status).toBe(200);
    expect(b.body.payment.order_id).toBe(a.body.payment.order_id);
    expect(fake.orders.create).toHaveBeenCalledTimes(1);
  });

  test('if Razorpay is down, the seat is released immediately', async () => {
    const { token } = await db.createUser();
    fake.orders.create.mockRejectedValueOnce(new Error('gateway down'));
    const res = await holdVia(token);
    expect(res.status).toBe(502);
    expect(await Reservation.countDocuments({ is_active: true })).toBe(0);
    expect((await holdVia(token)).status).toBe(201); // user can try again at once
  });
});

describe('checkout confirmation (signature)', () => {
  test('valid signature confirms and stores the payment', async () => {
    const { token } = await db.createUser();
    const h = await holdVia(token);
    const id = h.body.reservation._id;
    const res = await request(app).post(`/api/bookings/${id}/confirm`).set(bearer(token))
      .send({ razorpay_payment_id: 'pay_1', razorpay_signature: checkoutSig('order_1', 'pay_1') });
    expect(res.status).toBe(200);
    const r = await Reservation.findById(id);
    expect(r).toMatchObject({ status: 'confirmed', payment_status: 'paid', razorpay_payment_id: 'pay_1' });
  });

  test('forged / wrong-order signatures are rejected and the booking stays held', async () => {
    const { token } = await db.createUser();
    const h = await holdVia(token);
    const id = h.body.reservation._id;
    const bad = await request(app).post(`/api/bookings/${id}/confirm`).set(bearer(token))
      .send({ razorpay_payment_id: 'pay_1', razorpay_signature: 'deadbeef' });
    expect(bad.status).toBe(400);
    const other = await request(app).post(`/api/bookings/${id}/confirm`).set(bearer(token))
      .send({ razorpay_payment_id: 'pay_1', razorpay_signature: checkoutSig('order_999', 'pay_1') });
    expect(other.status).toBe(400);
    expect((await Reservation.findById(id)).status).toBe('held');
  });

  test("nobody else can confirm my booking; mock is off while Razorpay is configured", async () => {
    const a = await db.createUser(); const b = await db.createUser();
    const id = (await holdVia(a.token)).body.reservation._id;
    const sig = checkoutSig('order_1', 'pay_1');
    const steal = await request(app).post(`/api/bookings/${id}/confirm`).set(bearer(b.token))
      .send({ razorpay_payment_id: 'pay_1', razorpay_signature: sig });
    expect(steal.status).toBe(403);
    process.env.BOOKING_MOCK_PAYMENT = 'true';
    const mock = await request(app).post(`/api/bookings/${id}/confirm`).set(bearer(a.token)).send({});
    expect(mock.status).toBe(501); // cannot bypass payment with the mock flag
    delete process.env.BOOKING_MOCK_PAYMENT;
  });
});

describe('webhook', () => {
  test('bad signature -> 400 and nothing changes', async () => {
    const { token } = await db.createUser();
    const id = (await holdVia(token)).body.reservation._id;
    const res = await webhook(captured('order_1', 'pay_1'), { secret: 'wrong' });
    expect(res.status).toBe(400);
    expect((await Reservation.findById(id)).status).toBe('held');
  });

  test('valid payment.captured confirms the booking', async () => {
    const { token } = await db.createUser();
    const id = (await holdVia(token)).body.reservation._id;
    const res = await webhook(captured('order_1', 'pay_1'));
    expect(res.status).toBe(200);
    expect(await Reservation.findById(id)).toMatchObject({ status: 'confirmed', payment_status: 'paid' });
  });

  test('same event id twice is processed once; same payment under a new event id is a no-op', async () => {
    const { token } = await db.createUser();
    await holdVia(token);
    const first = await webhook(captured('order_1', 'pay_1'), { eventId: 'evt_A' });
    const dup = await webhook(captured('order_1', 'pay_1'), { eventId: 'evt_A' });
    const again = await webhook(captured('order_1', 'pay_1'), { eventId: 'evt_B' });
    expect(first.body.status).toBe('ok');
    expect(dup.body.status).toBe('duplicate');
    expect(again.status).toBe(200);
    expect(fake.payments.refund).not.toHaveBeenCalled();
    expect(await Reservation.countDocuments({ status: 'confirmed' })).toBe(1);
  });

  test('checkout + webhook racing on the same payment confirm exactly once', async () => {
    const { token } = await db.createUser();
    const id = (await holdVia(token)).body.reservation._id;
    const [a, b] = await Promise.all([
      request(app).post(`/api/bookings/${id}/confirm`).set(bearer(token))
        .send({ razorpay_payment_id: 'pay_1', razorpay_signature: checkoutSig('order_1', 'pay_1') }),
      webhook(captured('order_1', 'pay_1'))
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(fake.payments.refund).not.toHaveBeenCalled();
    expect((await Reservation.findById(id)).status).toBe('confirmed');
  });

  test('unrelated events are acknowledged and ignored', async () => {
    const res = await webhook({ event: 'payment.failed', payload: {} });
    expect(res.status).toBe(200);
  });
});

describe('late payments (after the 2-minute hold)', () => {
  async function expiredHold(token) {
    const id = (await holdVia(token)).body.reservation._id;
    await Reservation.updateOne({ _id: id }, { $set: { hold_expires_at: new Date(Date.now() - 60000) } });
    await svc.expireStaleHolds(new Date());
    expect((await Reservation.findById(id)).status).toBe('expired');
    return id;
  }

  test('seat still free -> the booking is reclaimed and confirmed', async () => {
    const { token } = await db.createUser();
    const id = await expiredHold(token);
    const res = await webhook(captured('order_1', 'pay_1'));
    expect(res.status).toBe(200);
    expect(await Reservation.findById(id)).toMatchObject({ status: 'confirmed', payment_status: 'paid' });
    expect(fake.payments.refund).not.toHaveBeenCalled();
  });

  test('seat taken by someone else -> automatic 100% refund, booking stays expired', async () => {
    const a = await db.createUser();
    const id = await expiredHold(a.token);
    const table = (await Reservation.findById(id)).table;
    const other = await db.createUser();
    await Reservation.create({ user: other.user._id, table, date: date(), slot: '19:00', guests: 2, status: 'confirmed' });

    const res = await webhook(captured('order_1', 'pay_1'));
    expect(res.status).toBe(200);
    expect(fake.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 10000 }));
    expect(await Reservation.findById(id)).toMatchObject({ status: 'expired', payment_status: 'refunded', refund_status: 'done' });
  });

  test('refund API failing -> webhook returns 500 so Razorpay retries, and the retry succeeds', async () => {
    const a = await db.createUser();
    const id = await expiredHold(a.token);
    const table = (await Reservation.findById(id)).table;
    await Reservation.create({ user: (await db.createUser()).user._id, table, date: date(), slot: '19:00', guests: 2, status: 'confirmed' });

    fake.payments.refund.mockRejectedValueOnce(new Error('rzp down'));
    const first = await webhook(captured('order_1', 'pay_1'), { eventId: 'evt_R' });
    expect(first.status).toBe(500);
    expect((await Reservation.findById(id)).refund_status).toBe('failed');

    const retry = await webhook(captured('order_1', 'pay_1'), { eventId: 'evt_R' });
    expect(retry.status).toBe(200);
    expect((await Reservation.findById(id)).refund_status).toBe('done');
  });

  test('paid after the user cancelled the hold -> full refund', async () => {
    const { token } = await db.createUser();
    const id = (await holdVia(token)).body.reservation._id;
    await request(app).put(`/api/bookings/${id}/cancel`).set(bearer(token));
    await webhook(captured('order_1', 'pay_1'));
    expect(fake.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 10000 }));
    expect((await Reservation.findById(id)).status).toBe('cancelled');
  });

  test('amount mismatch is never confirmed -> refunded', async () => {
    const { token } = await db.createUser();
    const id = (await holdVia(token)).body.reservation._id;
    await webhook(captured('order_1', 'pay_1', 100));
    expect((await Reservation.findById(id)).status).toBe('held');
    expect(fake.payments.refund).toHaveBeenCalled();
  });

  test('a second, different payment on an already-paid booking is refunded', async () => {
    const { token } = await db.createUser();
    const id = (await holdVia(token)).body.reservation._id;
    await webhook(captured('order_1', 'pay_1'));
    await webhook(captured('order_1', 'pay_2'));
    expect(fake.payments.refund).toHaveBeenCalledWith('pay_2', expect.objectContaining({ amount: 10000 }));
    expect((await Reservation.findById(id)).razorpay_payment_id).toBe('pay_1');
  });
});

describe('cancel + tiered refund', () => {
  // confirmed booking for a fixed date, then cancel at an injected time
  async function paidBooking() {
    const u = await db.createUser();
    const r = await Reservation.create({
      user: u.user._id, table: (await Table.findOne({ number: 1 }))._id,
      date: '2026-11-07', slot: '19:00', guests: 2, status: 'confirmed',
      amount: 10000, payment_status: 'paid', razorpay_order_id: 'order_x', razorpay_payment_id: 'pay_x'
    });
    return { u, r };
  }
  const cancelAt = (r, u, t) => pay.cancelWithRefund({ reservationId: r._id, userId: u.user._id, now: ist(t) });

  test('>= 6h before: 100% refund', async () => {
    const { u, r } = await paidBooking();
    const out = await cancelAt(r, u, '2026-11-07T13:00:00');
    expect(out.refund).toMatchObject({ percent: 100, amount: 10000, status: 'processed' });
    expect(fake.payments.refund).toHaveBeenCalledWith('pay_x', expect.objectContaining({ amount: 10000 }));
    expect(out.reservation).toMatchObject({ status: 'cancelled', payment_status: 'refunded' });
  });

  test('2-6h before: 50% refund', async () => {
    const { u, r } = await paidBooking();
    const out = await cancelAt(r, u, '2026-11-07T15:00:00');
    expect(out.refund).toMatchObject({ percent: 50, amount: 5000 });
    expect(fake.payments.refund).toHaveBeenCalledWith('pay_x', expect.objectContaining({ amount: 5000 }));
    expect(out.reservation.payment_status).toBe('partially_refunded');
  });

  test('< 2h before: cancelled, no refund, seat freed', async () => {
    const { u, r } = await paidBooking();
    const out = await cancelAt(r, u, '2026-11-07T18:00:00');
    expect(out.refund).toMatchObject({ percent: 0, amount: 0, status: 'none' });
    expect(fake.payments.refund).not.toHaveBeenCalled();
    expect(out.reservation.status).toBe('cancelled');
    expect(out.reservation.is_active).toBe(false);
  });

  test('after the slot starts: cannot cancel', async () => {
    const { u, r } = await paidBooking();
    await expect(cancelAt(r, u, '2026-11-07T19:30:00')).rejects.toMatchObject({ status: 409 });
    expect((await Reservation.findById(r._id)).status).toBe('confirmed');
  });

  test('refund API failure: booking is still cancelled, refund flagged pending/failed', async () => {
    const { u, r } = await paidBooking();
    fake.payments.refund.mockRejectedValueOnce(new Error('rzp down'));
    const out = await cancelAt(r, u, '2026-11-07T10:00:00');
    expect(out.refund.status).toBe('pending');
    expect(out.reservation).toMatchObject({ status: 'cancelled', refund_status: 'failed' });
  });

  test('cancelling twice never refunds twice', async () => {
    const { u, r } = await paidBooking();
    await cancelAt(r, u, '2026-11-07T10:00:00');
    await expect(cancelAt(r, u, '2026-11-07T10:01:00')).rejects.toMatchObject({ status: 409 });
    expect(fake.payments.refund).toHaveBeenCalledTimes(1);
  });
});

describe('policy endpoint', () => {
  test('is public and describes deposit + refund tiers', async () => {
    const res = await request(app).get('/api/bookings/policy');
    expect(res.status).toBe(200);
    expect(res.body.deposit_rupees).toBe(100);
    expect(res.body.hold_minutes).toBe(2);
    expect(res.body.refund_policy.map((t) => t.refund_percent)).toEqual([100, 50, 0]);
  });
});
