// One place for every rate limit and page size, so they are easy to tune.
const MIN = 60 * 1000;

module.exports = {
  auth:    { windowMs: 15 * MIN, max: 10 },   // login + register, per IP (brute force)
  booking: { windowMs: 10 * MIN, max: 20 },   // hold / confirm / cancel, per user (or IP if no token)
  global:  { windowMs: 15 * MIN, max: 600 },  // everything else, per IP (admin tabs poll every 15-30s)
  pageSize: {
    adminOrders: { defaultLimit: 20, maxLimit: 50 },
    adminMenu:   { defaultLimit: 20, maxLimit: 50 },
    myOrders:    { defaultLimit: 10, maxLimit: 30 },
    myBookings:  { defaultLimit: 10, maxLimit: 30 }
  }
};
