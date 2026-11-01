// READ-ONLY: shows a payment's status and its refunds from Razorpay (changes nothing).
// Usage (from /backend):  node scripts/razorpayPayment.js pay_XXXXXXXX
require('dotenv').config({ quiet: true });
const Razorpay = require('razorpay');

const id = (process.env.RAZORPAY_KEY_ID || '').trim();
const secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
const payId = (process.argv[2] || '').trim();

if (!id.startsWith('rzp_test_') || !secret) { console.error('FAIL: need rzp_test_ keys in backend/.env'); process.exit(1); }
if (!/^pay_[A-Za-z0-9]+$/.test(payId)) { console.error('Usage: node scripts/razorpayPayment.js pay_XXXXXXXX'); process.exit(1); }

const rz = new Razorpay({ key_id: id, key_secret: secret });
const errText = (e) => JSON.stringify((e && e.error) || (e && e.message) || e);

(async () => {
  try {
    const p = await rz.payments.fetch(payId);
    console.log('--- payment ---');
    console.log({ id: p.id, status: p.status, captured: p.captured, amount: p.amount, amount_refunded: p.amount_refunded,
      refund_status: p.refund_status, method: p.method, order_id: p.order_id, created_at: new Date(p.created_at * 1000).toISOString() });
    const r = await rz.payments.fetchMultipleRefund(payId);
    console.log('--- refunds on this payment ---');
    console.log(r.items.length ? r.items.map((x) => ({ id: x.id, amount: x.amount, status: x.status, notes: x.notes })) : 'none');
  } catch (e) {
    console.error('FAIL:', errText(e));
  }
})();
