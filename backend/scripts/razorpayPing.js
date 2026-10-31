// Checks your Razorpay TEST keys by creating one ₹1 test order.
// Usage (from /backend):  node scripts/razorpayPing.js
require('dotenv').config({ quiet: true });
const Razorpay = require('razorpay');

const id = process.env.RAZORPAY_KEY_ID;
const secret = process.env.RAZORPAY_KEY_SECRET;

if (!id || !secret) {
  console.error('❌ RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing in backend/.env');
  process.exit(1);
}
if (!id.startsWith('rzp_test_')) {
  console.error('❌ Refusing to run: this is not a TEST key (must start with rzp_test_).');
  process.exit(1);
}

new Razorpay({ key_id: id, key_secret: secret }).orders
  .create({ amount: 100, currency: 'INR', receipt: 'ping_' + Date.now() })
  .then((o) => console.log(`✅ Keys work. Test order created: ${o.id} (₹${o.amount / 100})`))
  .catch((e) => {
    console.error('❌ Razorpay said:', (e.error && e.error.description) || e.message);
    process.exit(1);
  });
