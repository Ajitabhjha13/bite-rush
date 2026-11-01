const dotenv = require('dotenv');
dotenv.config({ quiet: true });

const connectDB = require('./config/db');
const app = require('./app');
const { expireStaleHolds } = require('./services/bookingService');

connectDB();

// Safety net: release expired 2-minute holds every 30s (requests also do this lazily)
setInterval(() => { expireStaleHolds().catch(() => {}); }, 30 * 1000);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
