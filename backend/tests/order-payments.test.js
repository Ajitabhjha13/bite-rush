const crypto = require('crypto');
const request = require('supertest');
const app = require('../app');
const db = require('./helpers');
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const WebhookEvent = require('../models/WebhookEvent');
const pay = require('../services/paymentService');
const ops = require('../services/orderPaymentService');
const rules = require('../config/orderPayment');

const KEY_SECRET = 'test_key_secret';
const WH_SECRET = 'test_webhook_secret';
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

const delivery = {
  name: 'Riya Sharma', phone: '9876543210', address_line: 'B-12, Shanti Apartments, Alkapuri Road',
  area: 'Alkapuri', landmark: '', pincode: '390007'
};

let fake;
function makeFake() {
  let n = 0;
  return {
    orders: { create: jest.fn(async (o) => ({ id: `order_${++n}`, amount: o.amount, currency: o.currency })) },
    payments: { refund: jest.fn(async (id, o) => ({ id: `rfnd_${id}`, amount: o.amount })) }
  };
}

beforeAll(async () => { await db.connect(); await Order.init(); await WebhookEvent.init(); });
beforeEach(() => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_abc';
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WH_SECRET;
  fake = makeFake();
  pay.setClient(fake);
});
afterEach(db.clearDb);
afterAll(async () => {
  delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET; delete process.env.RAZORPAY_WEBHOOK_SECRET;
  await db.disconnect();
});

async function makeItem(price = 200) {
  const cat = (await Category.findOne({ name: 'Mains' })) || (await Category.create({ name: 'Mains' }));
  return MenuItem.create({ name: 'Paneer', price, category: cat._id });
}
async function placeOnline(token, price = 200, qty = 1, extra = {}) {
  const item = await makeItem(price);
  return request(app).post('/api/orders').set(bearer(token))
    .send({ delivery, payment_method: 'online', cart_items: [{ type: 'item', item_id: item._id, quantity: qty }], ...extra });
}
const sig = (rzOrder, payId) => hmac(KEY_SECRET, `${rzOrder}|${payId}`);
function confirm(token, id, rzOrder, payId, signature = sig(rzOrder, payId)) {
  return request(app).post(`/api/orders/${id}/confirm-payment`).set(bearer(token))
    .send({ razorpay_payment_id: payId, razorpay_signature: signature });
}
function webhook(payload, { secret = WH_SECRET, eventId = `evt_${Math.random()}` } = {}) {
  const raw = JSON.stringify(payload);
  return request(app).post('/api/payments/webhook').set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', hmac(secret, raw)).set('X-Razorpay-Event-Id', eventId).send(raw);
}
const captured = (orderId, paymentId, amount) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, status: 'captured' } } }
});
// a paid order, ready for cancel tests
async function paidOrder(token, { price = 200, ago = 0 } = {}) {
  const res = await placeOnline(token, price);
  const rz = res.body.payment.order_id;
  await confirm(token, res.body.order_id, rz, 'pay_1');
  if (ago) await Order.updateOne({ _id: res.body.order_id }, { $set: { paid_at: new Date(Date.now() - ago * 1000) } });
  return { id: res.body.order_id, rz };
}

describe('starting an online payment', () => {
  test('creates a pending order and a Razorpay order for the server-computed amount', async () => {
    const { token } = await db.createUser();
    const res = await placeOnline(token, 260, 2, {});
    expect(res.status).toBe(201);
    expect(res.body.payment_status).toBe('pending');
    expect(res.body.payment.amount).toBe(52000); // 2 x 260 rupees, in paise
    expect(res.body.payment.key_id).toBe('rzp_test_abc');
    expect(fake.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 52000, currency: 'INR' }));
    const saved = await Order.findById(res.body.order_id);
    expect(saved.payment_status).toBe('pending');
    expect(saved.razorpay_order_id).toBe(res.body.payment.order_id);
  });

  test('cash on delivery is unchanged and needs no payment', async () => {
    const { token } = await db.createUser();
    const item = await makeItem(150);
    const res = await request(app).post('/api/orders').set(bearer(token))
      .send({ delivery, cart_items: [{ type: 'item', item_id: item._id, quantity: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.payment).toBeUndefined();
    expect((await Order.findById(res.body.order_id)).payment_status).toBe('none');
    expect(fake.orders.create).not.toHaveBeenCalled();
  });

  test('an unknown payment method is rejected', async () => {
    const { token } = await db.createUser();
    const res = await placeOnline(token, 100, 1, { payment_method: 'bitcoin' });
    expect(res.status).toBe(400);
  });

  test('without Razorpay keys the customer is told to use cash on delivery, and nothing is left behind', async () => {
    delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET;
    const { token } = await db.createUser();
    const res = await placeOnline(token);
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/cash on delivery/i);
    expect(await Order.countDocuments()).toBe(0);
    expect(await OrderItem.countDocuments()).toBe(0);
  });

  test('if Razorpay fails, the half-made order is removed', async () => {
    fake.orders.create.mockRejectedValueOnce(new Error('down'));
    const { token } = await db.createUser();
    const res = await placeOnline(token);
    expect(res.status).toBe(502);
    expect(await Order.countDocuments()).toBe(0);
    expect(await OrderItem.countDocuments()).toBe(0);
  });
});

describe('an unpaid order is not a real order', () => {
  test('hidden from the customer history and from the admin list until paid', async () => {
    const { token } = await db.createUser();
    const admin = await db.createUser({ role: 'admin' });
    const res = await placeOnline(token);
    const mine = await request(app).get('/api/orders/my').set(bearer(token));
    const all = await request(app).get('/api/orders/admin/all').set(bearer(admin.token));
    expect(mine.body.total).toBe(0);
    expect(all.body.total).toBe(0);

    await confirm(token, res.body.order_id, res.body.payment.order_id, 'pay_1');
    expect((await request(app).get('/api/orders/my').set(bearer(token))).body.total).toBe(1);
    expect((await request(app).get('/api/orders/admin/all').set(bearer(admin.token))).body.total).toBe(1);
  });

  test('the admin cannot change the status of an unpaid order', async () => {
    const { token } = await db.createUser();
    const admin = await db.createUser({ role: 'admin' });
    const res = await placeOnline(token);
    const r = await request(app).put(`/api/orders/admin/${res.body.order_id}/status`).set(bearer(admin.token)).send({ status: 'Preparing' });
    expect(r.status).toBe(404);
  });

  test('the customer cannot "cancel" an unpaid order to dodge anything (it is not visible)', async () => {
    const { token } = await db.createUser();
    const res = await placeOnline(token);
    const r = await request(app).put(`/api/orders/${res.body.order_id}/cancel`).set(bearer(token));
    expect(r.status).toBe(404);
  });

  test('an order whose payment never came is expired and a late payment is refunded in full', async () => {
    const { token } = await db.createUser();
    const res = await placeOnline(token, 200);
    await Order.updateOne({ _id: res.body.order_id }, { $set: { pay_by: new Date(Date.now() - 1000) } });
    await ops.expireStale();
    expect((await Order.findById(res.body.order_id)).payment_status).toBe('expired');

    const late = await webhook(captured(res.body.payment.order_id, 'pay_late', 20000));
    expect(late.status).toBe(200);
    expect(fake.payments.refund).toHaveBeenCalledWith('pay_late', expect.objectContaining({ amount: 20000 }));
    const after = await Order.findById(res.body.order_id);
    expect(after.payment_status).toBe('expired'); // the refund is recorded, the order stays hidden
    expect(after.refund_status).toBe('done');
    expect(after.refund_amount).toBe(20000);
    // and it still never shows up as a real order
    expect((await request(app).get('/api/orders/my').set(bearer(token))).body.total).toBe(0);
  });

  test('expiring never touches a paid order or cash on delivery', async () => {
    const { token } = await db.createUser();
    const paid = await paidOrder(token);
    await Order.updateOne({ _id: paid.id }, { $set: { pay_by: new Date(Date.now() - 1000) } }); // even with a stale pay_by
    await ops.expireStale();
    expect((await Order.findById(paid.id)).payment_status).toBe('paid');
  });
});

describe('confirming a payment', () => {
  test('a valid signature marks the order paid and starts the full-refund countdown', async () => {
    const { token } = await db.createUser();
    const res = await placeOnline(token, 200);
    const out = await confirm(token, res.body.order_id, res.body.payment.order_id, 'pay_1');
    expect(out.status).toBe(200);
    expect(out.body.order.payment_status).toBe('paid');
    expect(out.body.order.status).toBe('Received');
    expect(out.body.full_refund_seconds_left).toBeGreaterThan(25);
    expect(out.body.full_refund_seconds_left).toBeLessThanOrEqual(rules.FULL_REFUND_SECONDS);
  });

  test('a wrong signature is rejected and the order stays unpaid', async () => {
    const { token } = await db.createUser();
    const res = await placeOnline(token);
    const out = await confirm(token, res.body.order_id, res.body.payment.order_id, 'pay_1', 'f'.repeat(64));
    expect(out.status).toBe(400);
    expect((await Order.findById(res.body.order_id)).payment_status).toBe('pending');
  });

  test("someone else cannot confirm (or use) another customer's order", async () => {
    const owner = await db.createUser();
    const other = await db.createUser();
    const res = await placeOnline(owner.token);
    const out = await confirm(other.token, res.body.order_id, res.body.payment.order_id, 'pay_1');
    expect(out.status).toBe(403);
  });

  test('confirming twice is harmless', async () => {
    const { token } = await db.createUser();
    const res = await placeOnline(token);
    const rz = res.body.payment.order_id;
    expect((await confirm(token, res.body.order_id, rz, 'pay_1')).status).toBe(200);
    expect((await confirm(token, res.body.order_id, rz, 'pay_1')).status).toBe(200);
    expect(fake.payments.refund).not.toHaveBeenCalled();
  });

  test('a second, different payment on a paid order is refunded', async () => {
    const { token } = await db.createUser();
    const res = await placeOnline(token, 200);
    const rz = res.body.payment.order_id;
    await confirm(token, res.body.order_id, rz, 'pay_1');
    await webhook(captured(rz, 'pay_2', 20000));
    expect(fake.payments.refund).toHaveBeenCalledWith('pay_2', expect.objectContaining({ amount: 20000 }));
    expect((await Order.findById(res.body.order_id)).razorpay_payment_id).toBe('pay_1');
  });
});

describe('the webhook for food orders', () => {
  test('payment.captured marks the order paid even if the browser never reports back', async () => {
    const { token } = await db.createUser();
    const res = await placeOnline(token, 200);
    const w = await webhook(captured(res.body.payment.order_id, 'pay_1', 20000));
    expect(w.status).toBe(200);
    const o = await Order.findById(res.body.order_id);
    expect(o.payment_status).toBe('paid');
    expect(o.razorpay_payment_id).toBe('pay_1');
    expect(o.paid_at).toBeTruthy();
  });

  test('browser and webhook together end with exactly one payment and no refund', async () => {
    const { token } = await db.createUser();
    const res = await placeOnline(token, 200);
    const rz = res.body.payment.order_id;
    await Promise.all([confirm(token, res.body.order_id, rz, 'pay_1'), webhook(captured(rz, 'pay_1', 20000))]);
    expect((await Order.findById(res.body.order_id)).payment_status).toBe('paid');
    expect(fake.payments.refund).not.toHaveBeenCalled();
  });

  test('a wrong amount is refunded in full instead of accepted', async () => {
    const { token } = await db.createUser();
    const res = await placeOnline(token, 200);
    await webhook(captured(res.body.payment.order_id, 'pay_1', 100));
    expect(fake.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 100 })); // exactly what was paid
    expect((await Order.findById(res.body.order_id)).payment_status).toBe('expired');
    const admin = await db.createUser({ role: 'admin' });
    expect((await request(app).get('/api/orders/admin/all').set(bearer(admin.token))).body.total).toBe(0); // never reaches the kitchen
  });

  test('a table deposit event still reaches the booking code, not the food orders', async () => {
    const w = await webhook(captured('order_for_a_booking_that_does_not_exist', 'pay_x', 10000));
    expect(w.status).toBe(200);
    expect(fake.payments.refund).not.toHaveBeenCalled();
  });
});

describe('cancelling a paid order: 100% in the first 30 seconds, 25% after', () => {
  test('inside the window the customer gets everything back', async () => {
    const { token } = await db.createUser();
    const o = await paidOrder(token, { price: 200, ago: 10 });
    const res = await request(app).put(`/api/orders/${o.id}/cancel`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('Cancelled');
    expect(res.body.refund).toMatchObject({ percent: 100, amount: 20000, amount_rupees: 200, status: 'processed' });
    expect(fake.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 20000 }));
    const saved = await Order.findById(o.id);
    expect(saved.payment_status).toBe('refunded');
    expect(saved.refund_status).toBe('done');
  });

  test('right at the end of the window (with the small grace) is still a full refund', async () => {
    const { token } = await db.createUser();
    const o = await paidOrder(token, { ago: rules.FULL_REFUND_SECONDS + 2 });
    const res = await request(app).put(`/api/orders/${o.id}/cancel`).set(bearer(token));
    expect(res.body.refund.percent).toBe(100);
  });

  test('after the window only 25% comes back', async () => {
    const { token } = await db.createUser();
    const o = await paidOrder(token, { price: 200, ago: 60 });
    const res = await request(app).put(`/api/orders/${o.id}/cancel`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.refund).toMatchObject({ percent: 25, amount: 5000, amount_rupees: 50, status: 'processed' });
    expect(fake.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 5000 }));
    expect((await Order.findById(o.id)).payment_status).toBe('partially_refunded');
  });

  test('once the kitchen has started, the customer cannot cancel and nothing is refunded', async () => {
    const { token } = await db.createUser();
    const admin = await db.createUser({ role: 'admin' });
    const o = await paidOrder(token);
    await request(app).put(`/api/orders/admin/${o.id}/status`).set(bearer(admin.token)).send({ status: 'Preparing' });
    const res = await request(app).put(`/api/orders/${o.id}/cancel`).set(bearer(token));
    expect(res.status).toBe(400);
    expect(fake.payments.refund).not.toHaveBeenCalled();
  });

  test('cancelling twice refunds once', async () => {
    const { token } = await db.createUser();
    const o = await paidOrder(token, { ago: 5 });
    await Promise.all([
      request(app).put(`/api/orders/${o.id}/cancel`).set(bearer(token)),
      request(app).put(`/api/orders/${o.id}/cancel`).set(bearer(token))
    ]);
    expect(fake.payments.refund).toHaveBeenCalledTimes(1);
  });

  test('my orders tells the screen what a cancel would give back, and the seconds left', async () => {
    const { token } = await db.createUser();
    await paidOrder(token, { ago: 10 });
    const fresh = (await request(app).get('/api/orders/my').set(bearer(token))).body.items[0];
    expect(fresh.refund_percent_if_cancelled).toBe(100);
    expect(fresh.full_refund_seconds_left).toBeGreaterThan(0);
    await Order.updateMany({}, { $set: { paid_at: new Date(Date.now() - 120 * 1000) } });
    const old = (await request(app).get('/api/orders/my').set(bearer(token))).body.items[0];
    expect(old.refund_percent_if_cancelled).toBe(25);
    expect(old.full_refund_seconds_left).toBe(0);
  });

  test('cash on delivery orders cancel exactly as before, with no refund call', async () => {
    const { token } = await db.createUser();
    const item = await makeItem(150);
    const placed = await request(app).post('/api/orders').set(bearer(token))
      .send({ delivery, cart_items: [{ type: 'item', item_id: item._id, quantity: 1 }] });
    const res = await request(app).put(`/api/orders/${placed.body.order_id}/cancel`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.refund.status).toBe('none');
    expect(fake.payments.refund).not.toHaveBeenCalled();
  });
});

describe('restaurant side', () => {
  test('the restaurant cancelling a paid order refunds 100%, however late', async () => {
    const { token } = await db.createUser();
    const admin = await db.createUser({ role: 'admin' });
    const o = await paidOrder(token, { price: 200, ago: 600 });
    const res = await request(app).put(`/api/orders/admin/${o.id}/status`).set(bearer(admin.token)).send({ status: 'Cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.refund).toMatchObject({ percent: 100, amount: 20000 });
    expect((await Order.findById(o.id)).payment_status).toBe('refunded');
  });

  test('a cancelled order cannot be brought back (so a refunded order is never delivered)', async () => {
    const { token } = await db.createUser();
    const admin = await db.createUser({ role: 'admin' });
    const o = await paidOrder(token, { ago: 5 });
    await request(app).put(`/api/orders/${o.id}/cancel`).set(bearer(token));
    const res = await request(app).put(`/api/orders/admin/${o.id}/status`).set(bearer(admin.token)).send({ status: 'Delivered' });
    expect(res.status).toBe(400);
  });

  test('a failed refund is kept, the order is still cancelled, and the admin can retry it with the same percent', async () => {
    const { token } = await db.createUser();
    const admin = await db.createUser({ role: 'admin' });
    const o = await paidOrder(token, { price: 200, ago: 90 });
    fake.payments.refund.mockRejectedValueOnce(new Error('razorpay down'));
    const res = await request(app).put(`/api/orders/${o.id}/cancel`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('Cancelled');
    expect(res.body.refund.status).toBe('pending');
    expect((await Order.findById(o.id)).refund_status).toBe('failed');

    const retry = await request(app).put(`/api/orders/admin/${o.id}/retry-refund`).set(bearer(admin.token));
    expect(retry.status).toBe(200);
    expect(fake.payments.refund).toHaveBeenLastCalledWith('pay_1', expect.objectContaining({ amount: 5000 })); // still 25%
    const saved = await Order.findById(o.id);
    expect(saved.refund_status).toBe('done');
    expect(saved.payment_status).toBe('partially_refunded');

    const again = await request(app).put(`/api/orders/admin/${o.id}/retry-refund`).set(bearer(admin.token));
    expect(again.status).toBe(400); // nothing left to retry, no second refund
  });

  test('retry-refund is admin only', async () => {
    const { token } = await db.createUser();
    const o = await paidOrder(token);
    const res = await request(app).put(`/api/orders/admin/${o.id}/retry-refund`).set(bearer(token));
    expect(res.status).toBe(403);
  });
});

describe('refund rules (pure functions)', () => {
  const at = (secondsAgo) => ({ paid_at: new Date(Date.now() - secondsAgo * 1000) });
  test('percent', () => {
    expect(ops.refundPercentFor(at(1))).toBe(100);
    expect(ops.refundPercentFor(at(30))).toBe(100);
    expect(ops.refundPercentFor(at(34))).toBe(100);   // inside the grace
    expect(ops.refundPercentFor(at(36))).toBe(25);
    expect(ops.refundPercentFor(at(3600))).toBe(25);
    expect(ops.refundPercentFor(at(3600), { byRestaurant: true })).toBe(100);
  });
  test('seconds left never goes below 0 and never above the window', () => {
    expect(ops.fullRefundSecondsLeft(at(0))).toBe(30);
    expect(ops.fullRefundSecondsLeft(at(12))).toBe(18);
    expect(ops.fullRefundSecondsLeft(at(500))).toBe(0);
    expect(ops.fullRefundSecondsLeft({})).toBe(0);
  });
});
