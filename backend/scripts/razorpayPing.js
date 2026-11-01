// Checks your Razorpay TEST keys by creating one ₹1 test order.
// Usage (from /backend):  node scripts/razorpayPing.js
require('dotenv').config({ quiet: true });
const Razorpay = require('razorpay');

const id = (process.env.RAZORPAY_KEY_ID || '').trim();
const secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();

console.log('Bite Rush - Razorpay key check');
console.log(`  .env found key id : ${id ? id.slice(0, 12) + '...' : 'NO'}`);
console.log(`  .env found secret : ${secret ? 'yes (' + secret.length + ' characters)' : 'NO'}`);

if (!id || !secret) {
  console.error('FAIL: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing in backend/.env (file must be named exactly ".env", not ".env.txt")');
  process.exit(1);
}
if (!id.startsWith('rzp_test_')) {
  console.error('FAIL: refusing to run, this is not a TEST key (must start with rzp_test_).');
  process.exit(1);
}

console.log('Contacting Razorpay (waits up to 20 seconds)...');
const timer = setTimeout(() => {
  console.error('FAIL: no reply from Razorpay in 20s. Check your internet / VPN / firewall and try again.');
  process.exit(1);
}, 20000);

new Razorpay({ key_id: id, key_secret: secret }).orders
  .create({ amount: 100, currency: 'INR', receipt: 'ping_' + Date.now() })
  .then((o) => {
    clearTimeout(timer);
    console.log(`OK: keys work. Test order created: ${o.id} (Rs ${o.amount / 100})`);
    process.exit(0);
  })
  .catch((e) => {
    clearTimeout(timer);
    const msg = (e && e.error && e.error.description) || (e && e.message) || JSON.stringify(e);
    console.error(`FAIL: Razorpay said: ${msg}${e && e.statusCode ? ' (HTTP ' + e.statusCode + ')' : ''}`);
    process.exit(1);
  });
