const db = require('./helpers');
const Table = require('../models/Table');
const Reservation = require('../models/Reservation');
const { seed } = require('../seedTables');

beforeAll(async () => {
  await db.connect();
  await Table.init();
  await Reservation.init(); // make sure the unique indexes exist
});
afterEach(db.clearDb);
afterAll(db.disconnect);

const DATE = '2026-11-05';

async function setup() {
  const table = await Table.create({ number: 1, seats: 4 });
  const u1 = await db.createUser();
  const u2 = await db.createUser();
  return { table, u1: u1.user, u2: u2.user };
}

describe('Reservation model', () => {
  test('status controls is_active automatically', async () => {
    const { table, u1 } = await setup();
    const r = await Reservation.create({ user: u1._id, table: table._id, date: DATE, slot: '19:00', guests: 2 });
    expect(r.is_active).toBe(true);
    r.status = 'cancelled';
    await r.save();
    expect(r.is_active).toBe(false);
  });

  test('rejects invalid slot, date format and guest count', async () => {
    const { table, u1 } = await setup();
    const base = { user: u1._id, table: table._id, date: DATE, slot: '19:00', guests: 2 };
    await expect(Reservation.create({ ...base, slot: '18:00' })).rejects.toThrow();
    await expect(Reservation.create({ ...base, date: '5-11-2026' })).rejects.toThrow();
    await expect(Reservation.create({ ...base, guests: 0 })).rejects.toThrow();
  });
});

describe('double-booking protection', () => {
  test('10 simultaneous requests for one table+slot: exactly 1 wins', async () => {
    const { table } = await setup();
    const users = [];
    for (let i = 0; i < 10; i++) users.push((await db.createUser()).user);

    const results = await Promise.allSettled(users.map((u) =>
      Reservation.create({ user: u._id, table: table._id, date: DATE, slot: '19:00', guests: 2 })));

    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(9);
    expect(lost.every((r) => r.reason.code === 11000)).toBe(true);
    expect(await Reservation.countDocuments()).toBe(1);
  });

  test('same table, different slot or date is fine', async () => {
    const { table, u1, u2 } = await setup();
    await Reservation.create({ user: u1._id, table: table._id, date: DATE, slot: '19:00', guests: 2, status: 'confirmed' });
    await Reservation.create({ user: u2._id, table: table._id, date: DATE, slot: '20:30', guests: 2, status: 'confirmed' });
    await Reservation.create({ user: u2._id, table: table._id, date: '2026-11-06', slot: '19:00', guests: 2, status: 'confirmed' });
    expect(await Reservation.countDocuments()).toBe(3);
  });

  test('seat frees up once the hold expires or booking is cancelled', async () => {
    const { table, u1, u2 } = await setup();
    const r = await Reservation.create({ user: u1._id, table: table._id, date: DATE, slot: '19:00', guests: 2 });
    r.status = 'expired';
    await r.save();
    const again = await Reservation.create({ user: u2._id, table: table._id, date: DATE, slot: '19:00', guests: 2 });
    expect(again.is_active).toBe(true);
    expect(await Reservation.countDocuments({ is_active: true })).toBe(1);
  });

  test('a user cannot hold two seats at once, nor book the same slot on two tables', async () => {
    const { table, u1 } = await setup();
    const t2 = await Table.create({ number: 2, seats: 2 });
    await Reservation.create({ user: u1._id, table: table._id, date: DATE, slot: '19:00', guests: 2 });
    await expect(Reservation.create({ user: u1._id, table: t2._id, date: DATE, slot: '20:30', guests: 2 }))
      .rejects.toMatchObject({ code: 11000 }); // second concurrent hold
    const c = await Reservation.create({ user: u1._id, table: t2._id, date: '2026-11-06', slot: '19:00', guests: 2, status: 'confirmed' });
    expect(c._id).toBeDefined();
    await expect(Reservation.create({ user: u1._id, table: table._id, date: '2026-11-06', slot: '19:00', guests: 2, status: 'confirmed' }))
      .rejects.toMatchObject({ code: 11000 }); // same user, same slot, other table
  });

  test('same idempotency key twice creates only one booking', async () => {
    const { table, u1 } = await setup();
    const t2 = await Table.create({ number: 2, seats: 2 });
    const base = { user: u1._id, date: DATE, slot: '19:00', guests: 2, idempotency_key: 'abc-123' };
    await Reservation.create({ ...base, table: table._id });
    await expect(Reservation.create({ ...base, table: t2._id })).rejects.toMatchObject({ code: 11000 });
  });
});

describe('seedTables', () => {
  test('creates 10 tables (6 online) and is idempotent', async () => {
    await seed(false);
    await seed(false);
    expect(await Table.countDocuments()).toBe(10);
    expect(await Table.countDocuments({ bookable_online: true })).toBe(6);
  });
});
