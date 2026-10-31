const request = require('supertest');
const app = require('../app');
const db = require('./helpers');
const Table = require('../models/Table');
const Reservation = require('../models/Reservation');
const { seed } = require('../seedTables');
const { istToday, addDays } = require('../config/booking');

beforeAll(async () => {
  await db.connect();
  await Table.init();
  await Reservation.init();
});
beforeEach(async () => { await seed(false); process.env.BOOKING_MOCK_PAYMENT = 'true'; });
afterEach(db.clearDb);
afterAll(db.disconnect);

const date = () => addDays(istToday(), 2); // always inside the bookable window

describe('Booking API', () => {
  test('availability is public; bad/closed dates are 400', async () => {
    const ok = await request(app).get(`/api/bookings/availability?date=${date()}`);
    expect(ok.status).toBe(200);
    expect(ok.body.slots).toHaveLength(5);
    expect((await request(app).get('/api/bookings/availability?date=abc')).status).toBe(400);
    expect((await request(app).get(`/api/bookings/availability?date=${istToday()}`)).status).toBe(400);
  });

  test('hold / confirm / my / cancel need a login', async () => {
    expect((await request(app).post('/api/bookings/hold').send({})).status).toBe(401);
    expect((await request(app).get('/api/bookings/my')).status).toBe(401);
  });

  test('full flow: hold -> confirm -> appears in my bookings', async () => {
    const { token } = await db.createUser();
    const auth = { Authorization: `Bearer ${token}` };
    const h = await request(app).post('/api/bookings/hold').set(auth)
      .send({ date: date(), slot: '19:00', guests: 3 });
    expect(h.status).toBe(201);
    expect(h.body.reservation.status).toBe('held');

    const c = await request(app).post(`/api/bookings/${h.body.reservation._id}/confirm`).set(auth).send({});
    expect(c.status).toBe(200);
    expect(c.body.reservation.status).toBe('confirmed');

    const my = await request(app).get('/api/bookings/my').set(auth);
    expect(my.body).toHaveLength(1);
    expect(my.body[0].table.seats).toBe(4); // 3 guests -> 4-seater
  });

  test('Idempotency-Key header: retry returns the same booking (200)', async () => {
    const { token } = await db.createUser();
    const send = () => request(app).post('/api/bookings/hold')
      .set({ Authorization: `Bearer ${token}`, 'Idempotency-Key': 'abc' })
      .send({ date: date(), slot: '12:00', guests: 2 });
    const a = await send();
    const b = await send();
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.reservation._id).toBe(a.body.reservation._id);
  });

  test('validation: bad slot / guests / ids', async () => {
    const { token } = await db.createUser();
    const auth = { Authorization: `Bearer ${token}` };
    expect((await request(app).post('/api/bookings/hold').set(auth).send({ date: date(), slot: '18:00', guests: 2 })).status).toBe(400);
    expect((await request(app).post('/api/bookings/hold').set(auth).send({ date: date(), slot: '19:00', guests: 9 })).status).toBe(400);
    expect((await request(app).post('/api/bookings/nope/confirm').set(auth).send({})).status).toBe(400);
  });

  test('mock payment is off unless BOOKING_MOCK_PAYMENT=true', async () => {
    const { token } = await db.createUser();
    const auth = { Authorization: `Bearer ${token}` };
    const h = await request(app).post('/api/bookings/hold').set(auth).send({ date: date(), slot: '19:00', guests: 2 });
    process.env.BOOKING_MOCK_PAYMENT = 'false';
    const c = await request(app).post(`/api/bookings/${h.body.reservation._id}/confirm`).set(auth).send({});
    expect(c.status).toBe(501);
    expect((await Reservation.findById(h.body.reservation._id)).status).toBe('held');
  });

  test("cancelling someone else's booking is 403", async () => {
    const a = await db.createUser();
    const b = await db.createUser();
    const h = await request(app).post('/api/bookings/hold').set({ Authorization: `Bearer ${a.token}` })
      .send({ date: date(), slot: '19:00', guests: 2 });
    const r = await request(app).put(`/api/bookings/${h.body.reservation._id}/cancel`).set({ Authorization: `Bearer ${b.token}` });
    expect(r.status).toBe(403);
  });
});
