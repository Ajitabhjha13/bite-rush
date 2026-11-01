// Idempotent: upserts tables by number. Safe to run more than once.
// Usage: node seedTables.js   (needs MONGO_URI in .env)
const mongoose = require('mongoose');
const Table = require('./models/Table');

const TABLES = [
  // 6 tables in the online pool
  { number: 1, seats: 2, bookable_online: true },
  { number: 2, seats: 2, bookable_online: true },
  { number: 3, seats: 4, bookable_online: true },
  { number: 4, seats: 4, bookable_online: true },
  { number: 5, seats: 4, bookable_online: true },
  { number: 6, seats: 6, bookable_online: true },
  // 4 walk-in-only tables
  { number: 7, seats: 2, bookable_online: false },
  { number: 8, seats: 4, bookable_online: false },
  { number: 9, seats: 4, bookable_online: false },
  { number: 10, seats: 6, bookable_online: false }
];

async function seed(connect = true) {
  if (connect) await mongoose.connect(process.env.MONGO_URI);
  for (const t of TABLES) {
    await Table.updateOne({ number: t.number }, { $set: t }, { upsert: true });
  }
  const count = await Table.countDocuments();
  if (connect) await mongoose.disconnect();
  return count;
}

if (require.main === module) {
  require('dotenv').config({ quiet: true }); // only when run as a script, never when imported by tests
  seed().then((n) => { console.log(`✅ Tables ready: ${n}`); })
    .catch((e) => { console.error('❌', e.message); process.exit(1); });
}

module.exports = { seed, TABLES };
