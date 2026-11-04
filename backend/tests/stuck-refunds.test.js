const db = require('./helpers');
const Order = require('../models/Order');
const Reservation = require('../models/Reservation');
const Table = require('../models/Table');
const pay = require('../services/paymentService');
const { listStuck, fixOne } = require('../services/stuckRefunds');

beforeAll(db.connect);
afterEach(db.clearDb);
afterAll(db.disconnect);

// Fake Razorpay: remembers refunds per payment, can be told to fail.
function fakeRazorpay({ existing = {}, failRefund = false } = {}) {
  const refunds = { ...existing }; const calls = [];
  pay.setClient({
    payments: {
      fetchMultipleRefund: async (id) => ({ items: refunds[id] || [] }),
      refund: async (id, o) => {
        calls.push({ id, amount: o.amount });
        if (failRefund) throw new Error('razorpay down');
        const r = { id: `rfnd_${calls.length}`, amount: o.amount, status: 'processed' };
        refunds[id] = [...(refunds[id] || []), r];
        return r;
      }
    }
  });
  return calls;
}

async function order(extra = {}) {
  const { user } = await db.createUser();
  return Order.create({
    user: user._id, total_amount: 500, amount: 50000, status: 'Cancelled', payment_method: 'online',
    payment_status: 'paid', razorpay_payment_id: 'pay_A', razorpay_order_id: 'order_A',
    refund_status: 'failed', refund_percent: 100, ...extra
  });
}
const old = () => new Date(Date.now() - 30 * 60 * 1000);

describe('stuck refunds', () => {
  test('lists failed refunds and old processing ones, not fresh processing or finished', async () => {
    const calls = fakeRazorpay();
    const failed = await order();
    const stuck = await order({ razorpay_payment_id: 'pay_B', razorpay_order_id: 'order_B', refund_status: 'processing' });
    await Order.collection.updateOne({ _id: stuck._id }, { $set: { updatedAt: old() } });
    await order({ razorpay_payment_id: 'pay_C', razorpay_order_id: 'order_C', refund_status: 'processing' }); // fresh: still working
    await order({ razorpay_payment_id: 'pay_D', razorpay_order_id: 'order_D', refund_status: 'done' });
    const ids = (await listStuck()).map((s) => String(s.doc._id)).sort();
    expect(ids).toEqual([String(failed._id), String(stuck._id)].sort());
    expect(calls).toHaveLength(0);
  });

  test('preview changes nothing and sends nothing', async () => {
    const calls = fakeRazorpay();
    const o = await order();
    const out = await fixOne(String(o._id), {});
    expect(out).toMatchObject({ ok: true, action: 'would_send_refund', amount: 50000, applied: false });
    expect(calls).toHaveLength(0);
    expect((await Order.findById(o._id)).refund_status).toBe('failed');
  });

  test('failed order refund is sent once with --apply, using the percent on record', async () => {
    const calls = fakeRazorpay();
    const o = await order({ refund_percent: 25 });
    const out = await fixOne(String(o._id), { apply: true });
    expect(out).toMatchObject({ ok: true, action: 'sent_refund', amount: 12500 });
    expect(calls).toEqual([{ id: 'pay_A', amount: 12500 }]);
    const after = await Order.findById(o._id);
    expect(after.refund_status).toBe('done');
    expect(after.payment_status).toBe('partially_refunded');
    // running it again does nothing
    expect((await fixOne(String(o._id), { apply: true })).reason).toBe('nothing_to_fix');
    expect(calls).toHaveLength(1);
  });

  test('stuck processing where Razorpay already refunded: only records it, no second refund', async () => {
    const calls = fakeRazorpay({ existing: { pay_A: [{ id: 'rfnd_old', amount: 50000, status: 'processed' }] } });
    const o = await order({ refund_status: 'processing' });
    await Order.collection.updateOne({ _id: o._id }, { $set: { updatedAt: old() } });
    const out = await fixOne(String(o._id), { apply: true });
    expect(out).toMatchObject({ ok: true, action: 'recorded_existing_refund', refund_id: 'rfnd_old' });
    expect(calls).toHaveLength(0);
    const after = await Order.findById(o._id);
    expect(after).toMatchObject({ refund_status: 'done', refund_id: 'rfnd_old', payment_status: 'refunded' });
  });

  test('stuck processing where Razorpay has nothing: sends the refund', async () => {
    const calls = fakeRazorpay();
    const o = await order({ refund_status: 'processing' });
    await Order.collection.updateOne({ _id: o._id }, { $set: { updatedAt: old() } });
    expect((await fixOne(String(o._id), { apply: true })).action).toBe('sent_refund');
    expect(calls).toHaveLength(1);
  });

  test('a refund with a different amount is never doubled: it stops and asks', async () => {
    const calls = fakeRazorpay({ existing: { pay_A: [{ id: 'rfnd_x', amount: 10000, status: 'processed' }] } });
    const o = await order();
    const out = await fixOne(String(o._id), { apply: true });
    expect(out).toMatchObject({ ok: false, reason: 'refund_amount_differs', already: 10000, expected: 50000 });
    expect(calls).toHaveLength(0);
  });

  test('a fresh processing refund is left alone', async () => {
    fakeRazorpay();
    const o = await order({ refund_status: 'processing' });
    expect((await fixOne(String(o._id), { apply: true })).reason).toBe('still_processing');
  });

  test('if Razorpay refuses again it stays failed and can be retried later', async () => {
    fakeRazorpay({ failRefund: true });
    const o = await order();
    await expect(fixOne(String(o._id), { apply: true })).rejects.toThrow('razorpay down');
    expect((await Order.findById(o._id)).refund_status).toBe('failed');
  });

  test('a booking needs the percent said out loud, then works the same way', async () => {
    const calls = fakeRazorpay();
    const { user } = await db.createUser();
    const table = await Table.create({ number: 1, seats: 4 });
    const r = await Reservation.create({
      user: user._id, table: table._id, date: '2030-01-01', slot: '19:00', guests: 2, status: 'cancelled',
      amount: 10000, payment_status: 'paid', razorpay_payment_id: 'pay_R', refund_status: 'failed'
    });
    expect((await fixOne(String(r._id), { apply: true })).reason).toBe('need_percent');
    const out = await fixOne(String(r._id), { percent: 50, apply: true });
    expect(out).toMatchObject({ ok: true, action: 'sent_refund', amount: 5000 });
    expect(calls).toEqual([{ id: 'pay_R', amount: 5000 }]);
    expect((await Reservation.findById(r._id)).payment_status).toBe('partially_refunded');
  });

  test('unknown id and unpaid records are reported, not touched', async () => {
    fakeRazorpay();
    expect((await fixOne('64b000000000000000000001', {})).reason).toBe('not_found');
    const o = await order({ razorpay_payment_id: null, razorpay_order_id: 'order_Z' });
    expect((await fixOne(String(o._id), {})).reason).toBe('no_payment');
  });
});
