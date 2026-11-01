process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

// Tests must never depend on a developer's real .env: wipe anything payment-related.
// (payments.test.js sets its own fake values.)
for (const k of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'BOOKING_MOCK_PAYMENT',
  'BOOKING_HOLD_MINUTES', 'BOOKING_DEPOSIT_RUPEES']) delete process.env[k];
