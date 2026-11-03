// Rules for paying for food orders online. One place to change them.
module.exports = {
  // A customer who cancels within this many seconds of paying gets everything back.
  FULL_REFUND_SECONDS: 30,
  // Network and clock slack on the server side, so a click at 29.9 seconds is not refused.
  GRACE_SECONDS: 5,
  // After the window, cancelling (while the order is still Received) refunds this share.
  LATE_REFUND_PERCENT: 25,
  // An order whose payment was never completed disappears after this long.
  PENDING_MINUTES: 15
};
