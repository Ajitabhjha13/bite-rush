const request = require('supertest');
const express = require('express');
const app = require('../app');
const db = require('./helpers');
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const { parsePagination, pageResult } = require('../utils/paginate');
const limiters = require('../middleware/rateLimiters');

beforeAll(db.connect);
afterEach(db.clearDb);
afterAll(db.disconnect);

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('paginate helpers', () => {
  test('defaults, clamping and bad input', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, skip: 0 });
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, skip: 20 });
    expect(parsePagination({ page: '-4', limit: 'abc' })).toEqual({ page: 1, limit: 20, skip: 0 });
    expect(parsePagination({ page: '0', limit: '9999' }, { defaultLimit: 5, maxLimit: 50 })).toEqual({ page: 1, limit: 50, skip: 0 });
  });
  test('pageResult reports pages, never fewer than 1', () => {
    expect(pageResult([], 0, { page: 1, limit: 10 }).pages).toBe(1);
    expect(pageResult([1], 25, { page: 1, limit: 10 })).toMatchObject({ total: 25, pages: 3 });
  });
});

describe('pagination on the API', () => {
  async function seedOrders(user, n) {
    const cat = (await Category.findOne({ name: 'Mains' })) || (await Category.create({ name: 'Mains' }));
    const dish = (await MenuItem.findOne({ name: 'Paneer' })) || (await MenuItem.create({ name: 'Paneer', price: 100, category: cat._id }));
    for (let i = 0; i < n; i++) {
      const o = await Order.create({ user: user._id, total_amount: 100 });
      await OrderItem.create({ order: o._id, item: dish._id, quantity: 1, unit_price: 100 });
    }
  }

  test('my orders: pages of 10, newest first, items attached to the right order', async () => {
    const { user, token } = await db.createUser();
    const other = await db.createUser();
    await seedOrders(user, 12);
    await seedOrders(other.user, 3); // must not leak into my list
    const p1 = await request(app).get('/api/orders/my').set(bearer(token));
    expect(p1.status).toBe(200);
    expect(p1.body).toMatchObject({ total: 12, page: 1, limit: 10, pages: 2 });
    expect(p1.body.items).toHaveLength(10);
    expect(p1.body.items.every((o) => o.items.length === 1 && o.items[0].item.name === 'Paneer')).toBe(true);
    const p2 = await request(app).get('/api/orders/my?page=2').set(bearer(token));
    expect(p2.body.items).toHaveLength(2);
  });

  test('admin orders: paginated; customers still get 403', async () => {
    const admin = await db.createUser({ role: 'admin' });
    const { user, token } = await db.createUser();
    await seedOrders(user, 25);
    const res = await request(app).get('/api/orders/admin/all?limit=20').set(bearer(admin.token));
    expect(res.body).toMatchObject({ total: 25, pages: 2 });
    expect(res.body.items).toHaveLength(20);
    expect(res.body.items[0].user.email).toBe(user.email);
    expect((await request(app).get('/api/orders/admin/all').set(bearer(token))).status).toBe(403);
  });

  test('admin menu is paginated and limit is capped', async () => {
    const admin = await db.createUser({ role: 'admin' });
    const cat = await Category.create({ name: 'Mains' });
    await MenuItem.insertMany(Array.from({ length: 30 }, (_, i) => ({ name: `Dish ${i}`, price: 50, category: cat._id })));
    const res = await request(app).get('/api/menu/admin/all?limit=1000').set(bearer(admin.token));
    expect(res.body.limit).toBe(50);
    expect(res.body.items).toHaveLength(30);
    const small = await request(app).get('/api/menu/admin/all?limit=7&page=2').set(bearer(admin.token));
    expect(small.body.items).toHaveLength(7);
    expect(small.body.pages).toBe(5);
  });
});

describe('security headers and CORS', () => {
  test('helmet headers are present', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('CORS: own frontend and localhost allowed, other sites not', async () => {
    const get = (origin) => request(app).get('/api/health').set('Origin', origin);
    expect((await get('https://bite-rush-frontend.onrender.com')).headers['access-control-allow-origin'])
      .toBe('https://bite-rush-frontend.onrender.com');
    expect((await get('http://localhost:53504')).headers['access-control-allow-origin']).toBe('http://localhost:53504');
    expect((await get('http://127.0.0.1:5500')).headers['access-control-allow-origin']).toBe('http://127.0.0.1:5500');
    expect((await get('https://evil.example.com')).headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  // A tiny app with a small limit, so the test is quick and independent of the real numbers.
  function tinyApp(limiter) {
    const a = express();
    a.set('trust proxy', 1);
    a.get('/x', limiter, (req, res) => res.json({ ok: true }));
    return a;
  }
  beforeEach(() => { process.env.ENABLE_RATE_LIMIT = 'true'; });
  afterEach(() => { delete process.env.ENABLE_RATE_LIMIT; });

  test('blocks after the limit with a friendly 429', async () => {
    const a = tinyApp(limiters.make({ windowMs: 60000, max: 3 }, 'slow down'));
    for (let i = 0; i < 3; i++) expect((await request(a).get('/x')).status).toBe(200);
    const blocked = await request(a).get('/x');
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe('slow down');
  });

  test('each client IP (from the Cloudflare header) has its own bucket', async () => {
    const a = tinyApp(limiters.make({ windowMs: 60000, max: 1 }, 'slow down'));
    const hit = (ip) => request(a).get('/x').set('CF-Connecting-IP', ip);
    expect((await hit('1.1.1.1')).status).toBe(200);
    expect((await hit('1.1.1.1')).status).toBe(429);
    expect((await hit('2.2.2.2')).status).toBe(200); // someone else is unaffected
  });

  test('booking limiter is per user, not per IP', async () => {
    const a = express();
    a.get('/x', limiters.make({ windowMs: 60000, max: 1 }, 'slow', limiters.userOrIp), (req, res) => res.json({ ok: true }));
    const u1 = await db.createUser();
    const u2 = await db.createUser();
    expect((await request(a).get('/x').set(bearer(u1.token))).status).toBe(200);
    expect((await request(a).get('/x').set(bearer(u1.token))).status).toBe(429);
    expect((await request(a).get('/x').set(bearer(u2.token))).status).toBe(200); // same IP, other user
  });

  test('real app: login is blocked after 10 tries, webhook is never rate limited', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await request(app).post('/api/auth/login').send({ email: 'nobody@test.com', password: 'wrong-pass-1' });
      expect(r.status).not.toBe(429);
    }
    const blocked = await request(app).post('/api/auth/login').send({ email: 'nobody@test.com', password: 'wrong-pass-1' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Too many attempts/);
    // webhook still answers (400 = bad signature, i.e. it reached the handler), never 429
    for (let i = 0; i < 15; i++) expect((await request(app).post('/api/payments/webhook').send({})).status).not.toBe(429);
  });
});
