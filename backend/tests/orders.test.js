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

// A valid delivery block; individual tests override single fields.
const delivery = {
  name: 'Riya Sharma',
  phone: '9876543210',
  address_line: 'B-12, Shanti Apartments, Alkapuri Road',
  area: 'Alkapuri',
  landmark: 'Near the post office',
  pincode: '390007'
};

async function makeItem(price = 200, extra = {}) {
  const cat = (await Category.findOne({ name: 'Mains' })) || (await Category.create({ name: 'Mains' }));
  return MenuItem.create({ name: 'Paneer', price, category: cat._id, ...extra });
}

describe('Orders', () => {
  test('server computes total from DB price, ignoring client price', async () => {
    const item = await makeItem(200);
    const { token } = await db.createUser();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`)
      .send({ delivery, cart_items: [{ type: 'item', item_id: item._id, quantity: 2, price: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.total_amount).toBe(400);
    const oi = await OrderItem.findOne({ order: res.body.order_id });
    expect(oi.unit_price).toBe(200);
  });

  test('empty cart and unavailable item are rejected', async () => {
    const { token } = await db.createUser();
    const empty = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send({ delivery, cart_items: [] });
    expect(empty.status).toBe(400);
    const item = await makeItem(100, { is_available: false });
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`)
      .send({ delivery, cart_items: [{ type: 'item', item_id: item._id, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  test('spice level ignored for dishes that do not support it', async () => {
    const item = await makeItem(100, { has_spice_level: false });
    const { token } = await db.createUser();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`)
      .send({ delivery, cart_items: [{ type: 'item', item_id: item._id, quantity: 1, spice_level: 'Hot' }] });
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

describe('Delivery details on orders', () => {
  async function place(token, d, extra = {}) {
    const item = await makeItem(150);
    return request(app).post('/api/orders').set('Authorization', `Bearer ${token}`)
      .send({ delivery: d, cart_items: [{ type: 'item', item_id: item._id, quantity: 1 }], ...extra });
  }

  test('a valid order saves the address as a copy, with cash on delivery', async () => {
    const { token } = await db.createUser();
    const res = await place(token, delivery);
    expect(res.status).toBe(201);
    expect(res.body.payment_method).toBe('cod');
    const saved = await Order.findById(res.body.order_id).lean();
    expect(saved.delivery).toEqual({
      name: 'Riya Sharma', phone: '9876543210', address_line: 'B-12, Shanti Apartments, Alkapuri Road',
      area: 'Alkapuri', landmark: 'Near the post office', pincode: '390007', city: 'Vadodara'
    });
    expect(saved.payment_method).toBe('cod');
  });

  test('missing delivery details are rejected', async () => {
    const { token } = await db.createUser();
    const item = await makeItem(100);
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`)
      .send({ cart_items: [{ type: 'item', item_id: item._id, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/delivery|name|phone|address/i);
    expect(await Order.countDocuments()).toBe(0);
  });

  test.each([
    ['short phone', { phone: '98765' }, /10-digit mobile/],
    ['phone starting with 1', { phone: '1234567890' }, /10-digit mobile/],
    ['letters in phone', { phone: 'abcdefghij' }, /10-digit mobile/],
    ['pincode with 5 digits', { pincode: '39000' }, /6-digit/],
    ['pincode with letters', { pincode: '39000a' }, /6-digit/],
    ['pincode outside Vadodara (Ahmedabad)', { pincode: '380001' }, /Vadodara/],
    ['pincode just past the series', { pincode: '390026' }, /Vadodara/],
    ['empty address', { address_line: '   ' }, /Address/],
    ['too-short name', { name: 'A' }, /Name/],
    ['empty area', { area: '' }, /Area/],
    ['very long landmark', { landmark: 'x'.repeat(81) }, /Landmark/]
  ])('rejects %s', async (_label, override, message) => {
    const { token } = await db.createUser();
    const res = await place(token, { ...delivery, ...override });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
    expect(await Order.countDocuments()).toBe(0);
  });

  test('phone formats are normalised to 10 digits', async () => {
    const { token } = await db.createUser();
    for (const [input, expected] of [['+91 98765 43210', '9876543210'], ['09876543210', '9876543210'], ['98765-43210', '9876543210']]) {
      const res = await place(token, { ...delivery, phone: input });
      expect(res.status).toBe(201);
      expect((await Order.findById(res.body.order_id).lean()).delivery.phone).toBe(expected);
    }
  });

  test('the city is always ours and unknown fields are dropped', async () => {
    const { token } = await db.createUser();
    const res = await place(token, { ...delivery, city: 'Mumbai', is_admin: true, coupon: 'FREE' });
    expect(res.status).toBe(201);
    const saved = await Order.findById(res.body.order_id).lean();
    expect(saved.delivery.city).toBe('Vadodara');
    expect(saved.delivery.is_admin).toBeUndefined();
    expect(saved.delivery.coupon).toBeUndefined();
  });

  test('object or array values cannot be smuggled in (400, not a server error)', async () => {
    const { token } = await db.createUser();
    for (const bad of [{ name: { $gt: '' } }, { phone: ['9876543210'] }, { pincode: { $ne: null } }, { area: ['a', 'b'] }]) {
      const res = await place(token, { ...delivery, ...bad });
      expect(res.status).toBe(400);
    }
    expect((await place(token, 'not an object')).status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);
  });

  test('my orders and the admin list include the address; old orders without one still load', async () => {
    const customer = await db.createUser();
    const admin = await db.createUser({ role: 'admin' });
    const placed = await place(customer.token, delivery);
    await Order.create({ user: customer.user._id, total_amount: 80 }); // an older order, no delivery

    const mine = await request(app).get('/api/orders/my').set('Authorization', `Bearer ${customer.token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.items).toHaveLength(2);
    const withAddr = mine.body.items.find((o) => o._id === placed.body.order_id);
    expect(withAddr.delivery.address_line).toMatch(/Shanti Apartments/);
    const old = mine.body.items.find((o) => o._id !== placed.body.order_id);
    expect(old.delivery && old.delivery.address_line).toBeFalsy();

    const all = await request(app).get('/api/orders/admin/all').set('Authorization', `Bearer ${admin.token}`);
    expect(all.status).toBe(200);
    expect(all.body.items.find((o) => o._id === placed.body.order_id).delivery.phone).toBe('9876543210');
  });
});
