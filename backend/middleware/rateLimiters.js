const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const limits = require('../config/limits');

// Tests would trip the limits (many logins in a row), so they are off in tests unless a test turns them on.
const skip = () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT !== 'true';

// Behind Render's proxy chain the plain req.ip can be a shared proxy address, which would make every user
// share one bucket. Prefer the header Cloudflare sets from the real client; fall back to req.ip (local dev).
function clientIp(req) {
  const h = req.headers['cf-connecting-ip'] || req.headers['true-client-ip'];
  return ipKeyGenerator((Array.isArray(h) ? h[0] : h) || req.ip || '');
}

function make({ windowMs, max }, message, keyGenerator = (req) => clientIp(req)) {
  return rateLimit({
    windowMs,
    max,
    skip,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator,
    handler: (req, res) => res.status(429).json({ message })
  });
}

// Booking actions are limited per logged-in user (falls back to IP when there is no valid token).
function userOrIp(req) {
  try {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) {
      const { id } = jwt.verify(h.slice(7), process.env.JWT_SECRET);
      if (id) return `u:${id}`;
    }
  } catch (e) { /* fall through to IP */ }
  return `ip:${clientIp(req)}`;
}

const authLimiter = make(limits.auth, 'Too many attempts. Please wait a few minutes and try again.');
const bookingLimiter = make(limits.booking, 'You are doing that too quickly. Please wait a few minutes and try again.', userOrIp);
const orderLimiter = make(limits.booking, 'You are doing that too quickly. Please wait a few minutes and try again.', userOrIp);
const globalLimiter = make(limits.global, 'Too many requests. Please slow down and try again shortly.');

module.exports = { authLimiter, bookingLimiter, orderLimiter, globalLimiter, make, userOrIp, clientIp };
