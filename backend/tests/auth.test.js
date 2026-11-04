const request = require('supertest');
const app = require('../app');
const db = require('./helpers');
const User = require('../models/User');

beforeAll(db.connect);
afterEach(db.clearDb);
afterAll(db.disconnect);

describe('Auth', () => {
  const body = { name: 'Ajitabh', email: 'a@test.com', password: 'secret123' };

  test('register returns token and hashes the password', async () => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('customer');
    const User = require('../models/User');
    const saved = await User.findOne({ email: 'a@test.com' });
    expect(saved.password).not.toBe('secret123');
  });

  test('register rejects short password and bad email', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'Aj', email: 'not-an-email', password: '123' });
    expect(res.status).toBe(400);
  });

  test('duplicate email is rejected', async () => {
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
  });

  test('login works with right password, fails with wrong one', async () => {
    await request(app).post('/api/auth/register').send(body);
    const ok = await request(app).post('/api/auth/login').send({ email: body.email, password: body.password });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/auth/login').send({ email: body.email, password: 'wrongpass' });
    expect(bad.status).toBe(401);
  });

  test('protected route needs a token; admin route blocks customers', async () => {
    expect((await request(app).get('/api/orders/my')).status).toBe(401);
    const { token } = await db.createUser();
    const res = await request(app).get('/api/orders/admin/all').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Names and passwords are checked on the server', () => {
  const body = { name: 'Ajitabh', email: 'safe@test.com', password: 'longenough1' };

  test('a name with HTML characters is rejected', async () => {
    for (const name of ['<img src=x onerror=alert(1)>', 'Aj<b>', '<svg/onload=1>']) {
      const res = await request(app).post('/api/auth/register').send({ ...body, name });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/< or >/);
    }
    expect(await User.countDocuments()).toBe(0);
  });

  test('ordinary names still work, including apostrophes and dots', async () => {
    for (const [i, name] of ["D'Souza", 'Dr. A. K. Jha', 'Ajitabh Kumar Jha'].entries()) {
      const res = await request(app).post('/api/auth/register').send({ ...body, name, email: `n${i}@test.com` });
      expect(res.status).toBe(201);
    }
  });

  test('a name over 60 characters is rejected', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...body, name: 'a'.repeat(61) });
    expect(res.status).toBe(400);
  });

  test('password needs 8 characters', async () => {
    const short = await request(app).post('/api/auth/register').send({ ...body, password: '1234567' });
    expect(short.status).toBe(400);
    expect(short.body.message).toMatch(/at least 8/);
    const ok = await request(app).post('/api/auth/register').send({ ...body, password: '12345678' });
    expect(ok.status).toBe(201);
  });

  test('an older account with a short password can still log in', async () => {
    await User.collection.insertOne({
      name: 'Old', email: 'old@test.com', role: 'customer', createdAt: new Date(), updatedAt: new Date(),
      password: await require('bcryptjs').hash('abc123', 10)
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'old@test.com', password: 'abc123' });
    expect(res.status).toBe(200);
  });
});
