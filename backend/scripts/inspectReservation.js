// READ-ONLY: prints the refund-related fields of one booking from your database.
// Usage (from /backend):  node scripts/inspectReservation.js <reservationId>
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');

const id = (process.argv[2] || '').trim();
if (!/^[a-f0-9]{24}$/i.test(id)) { console.error('Usage: node scripts/inspectReservation.js <24-char id>'); process.exit(1); }

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const r = await Reservation.findById(id).lean();
    if (!r) { console.log('not found'); return; }
    const show = (v) => JSON.stringify(v); // JSON makes hidden spaces/characters visible
    console.log({
      status: r.status, payment_status: r.payment_status, attendance: r.attendance,
      amount: show(r.amount), amount_type: typeof r.amount,
      razorpay_payment_id: show(r.razorpay_payment_id), id_length: (r.razorpay_payment_id || '').length,
      razorpay_order_id: show(r.razorpay_order_id),
      refund_status: r.refund_status, refund_id: show(r.refund_id), refund_amount: show(r.refund_amount)
    });
  } catch (e) {
    console.error('FAIL:', e.message);
  } finally {
    await mongoose.disconnect();
  }
})();
