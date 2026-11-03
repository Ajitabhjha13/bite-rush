// Lists refunds that never finished, and fixes one at a time. Safe to run: it asks Razorpay first and never
// refunds the same payment twice. TEST keys only.
//
// From /backend:
//   node scripts/fixStuckRefunds.js                      list stuck refunds (changes nothing)
//   node scripts/fixStuckRefunds.js <id> --percent 100   show what it WOULD do for one (changes nothing)
//   node scripts/fixStuckRefunds.js <id> --percent 100 --apply   really do it
// For a food order the percent is remembered, so --percent can be left out.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { listStuck, fixOne } = require('../services/stuckRefunds');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const pIdx = args.indexOf('--percent');
const percent = pIdx >= 0 ? Number(args[pIdx + 1]) : null;
const id = args.find((a) => /^[a-f0-9]{24}$/i.test(a));

(async () => {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  if (!keyId.startsWith('rzp_test_') || !process.env.RAZORPAY_KEY_SECRET) {
    console.error('STOP: need rzp_test_ keys in backend/.env. This script only runs in test mode.');
    process.exit(1);
  }
  if (pIdx >= 0 && !(percent > 0 && percent <= 100)) { console.error('--percent must be a number from 1 to 100'); process.exit(1); }
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    if (!id) {
      const stuck = await listStuck();
      if (stuck.length === 0) return console.log('No stuck refunds. Nothing to do.');
      console.log(`${stuck.length} stuck refund(s):\n`);
      for (const { kind, doc } of stuck) {
        console.log(`${kind === 'booking' ? 'table booking' : 'food order'}  ${doc._id}`);
        console.log(`   refund_status: ${doc.refund_status}   paid: Rs ${(doc.amount || 0) / 100}   payment: ${doc.razorpay_payment_id}`);
        if (kind === 'order' && doc.refund_percent) console.log(`   refund percent on record: ${doc.refund_percent}%`);
      }
      console.log('\nTo fix one:  node scripts/fixStuckRefunds.js <id> --percent 100 --apply');
      return;
    }
    const out = await fixOne(id, { percent, apply });
    console.log(out);
    if (out.ok && !out.applied) console.log('\nThis was only a preview. Add --apply to do it for real.');
    if (!out.ok && out.reason === 'need_percent') console.log('\nSay how much goes back, for example: --percent 100');
  } catch (e) {
    console.error('FAIL:', (e && e.error && e.error.description) || e.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
