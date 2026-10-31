const request = require('supertest');
const app = require('../app');
const db = require('./helpers');
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const OrderItem = require('../models/OrderItem');
const Order = require('../models/Order');

beforeAll(db.connect);
afterEach(db.clearDb);
afterAll(db.disconnect);

async function makeItem(price = 200, extra = {}) {
  const cat = await Category.create({ name: 'Mains' });
  return MenuItem.create({ name: 'Paneer', price, category: cat._id, ...extra });
}

describe('Orders', () => {
  test('server computes total from DB price, ignoring client price', async () => {
    const item = await makeItem(200);
    const { token } = await db.createUser();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`)
      .send({ cart_items: [{ type: 'item', item_id: item._id, quantity: 2, price: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.total_amount).toBe(400);
    const oi = await OrderItem.findOne({ order: res.body.order_id });
    expect(oi.unit_price).toBe(200);
  });

  test('empty cart and unavailable item are rejected', async () => {
    const { token } = await db.createUser();
    const empty = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send({ cart_items: [] });
    expect(empty.status).toBe(400);
    const item = await makeItem(100, { is_available: false });
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`)
      .send({ cart_items: [{ type: 'item', item_id: item._id, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  test('spice level ignored for dishes that do not support it', async () => {
    const item = await makeItem(100, { has_spice_level: false });
    const { token } = await db.createUser();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`)
      .send({ cart_items: [{ type: 'item', item_id: item._id, quantity: 1, spice_level: 'Hot' }] });
    expect(res.status).toBe(201);
    const oi = await OrderItem.findOne({ order: res.body.order_id });
    expect(oi.spice_level).toBeNull();
  });

  test('only the owner can cancel, and only while Received', async () => {
    const owner = await db.createUser();
    const other = await db.createUser();
    const order = await Order.create({ user: owner.user._id, total_amount: 100 });

    const forbidden = await request(app).put(`/api/orders/${order._id}/cancel`).set('Authorization', `Bearer ${other.token}`);
    expect(forbidden.status).toBe(403);

    const ok = await request(app).put(`/api/orders/${order._id}/cancel`).set('Authorization', `Bearer ${owner.token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.order.status).toBe('Cancelled');

    const preparing = await Order.create({ user: owner.user._id, total_amount: 50, status: 'Preparing' });
    const late = await request(app).put(`/api/orders/${preparing._id}/cancel`).set('Authorization', `Bearer ${owner.token}`);
    expect(late.status).toBe(400);
  });
});
