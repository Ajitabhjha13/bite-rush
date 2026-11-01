const request = require('supertest');
const app = require('../app');
const db = require('./helpers');

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
