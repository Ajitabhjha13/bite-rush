// Express app only (no DB connection, no listen) so tests can import it.
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const { globalLimiter, clientIp } = require('./middleware/rateLimiters');
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const menuRoutes = require('./routes/menuRoutes');
const orderRoutes = require('./routes/orderRoutes');
const comboRoutes = require('./routes/comboRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const tableRoutes = require('./routes/tableRoutes');

const app = express();

// Render sits behind a proxy; this makes req.ip / secure-cookie logic see the client, not the proxy.
app.set('trust proxy', 1);

app.use(helmet());

// Only our own frontend (and local development on any port) may call the API from a browser.
// Requests with no Origin (curl, Razorpay webhook, server-to-server) are not affected by CORS.
const allowedOrigins = (process.env.CORS_ORIGINS || 'https://bite-rush-frontend.onrender.com')
  .split(',').map((o) => o.trim()).filter(Boolean);
const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || localOrigin.test(origin) || allowedOrigins.includes(origin))
}));
// Webhook needs the RAW body to verify Razorpay's signature -> mounted BEFORE express.json()
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev')); // before the webhook route so it is logged too
app.use('/api/payments', paymentRoutes); // no rate limit here: this is Razorpay's server
app.use(globalLimiter);
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Bite Rush API is running', client_ip: clientIp(req) }); // client_ip: lets you verify rate-limit keys differ per user
});

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/combos', comboRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/tables', tableRoutes);

// Anything that matched no route: answer in JSON like every other endpoint (not an HTML error page).
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found.' }));

// Malformed JSON, oversized bodies and other request errors: JSON too, with the right status and no stack trace.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[error]', err.message);
  const message = err.type === 'entity.parse.failed' ? 'The request body is not valid JSON.'
    : err.type === 'entity.too.large' ? 'The request body is too large.'
    : status >= 500 ? 'Server error' : (err.message || 'Bad request');
  res.status(status).json({ message });
});

module.exports = app;
