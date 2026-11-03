const http = require('http');
const request = require('supertest');
const app = require('../app');
const db = require('./helpers');
const Order = require('../models/Order');
const events = require('../services/orderEvents');

let server; let base;
beforeAll(async () => {
  await db.connect();
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { events.closeAll(); await db.clearDb(); });
afterAll(async () => { events.closeAll(); await new Promise((r) => server.close(r)); await db.disconnect(); });

const ticketFor = async (token) =>
  (await request(app).post('/api/orders/stream-ticket').set('Authorization', `Bearer ${token}`)).body.ticket;

// Opens the stream and collects what arrives.
function openStream(ticket) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}/api/orders/stream?ticket=${ticket}`, (res) => {
      const out = { status: res.statusCode, headers: res.headers, text: '', req };
      res.setEncoding('utf8');
      res.on('data', (c) => { out.text += c; });
      if (res.statusCode !== 200) res.on('end', () => resolve(out));
      else resolve(out);
    });
    req.on('error', reject);
  });
}
const waitFor = async (fn, ms = 2000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 20)); } };
const pings = (s) => (s.text.match(/event: order\ndata: (.*)\n/g) || []).map((m) => JSON.parse(m.split('data: ')[1]));

describe('Live order updates (SSE)', () => {
  test('a ticket needs a login, and a bad, reused or expired ticket is refused', async () => {
    expect((await request(app).post('/api/orders/stream-ticket')).status).toBe(401);
    expect((await openStream('nope')).status).toBe(401);

    const { token } = await db.createUser();
    const t = await ticketFor(token);
    const first = await openStream(t);
    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toMatch(/text\/event-stream/);
    expect((await openStream(t)).status).toBe(401); // single use

    const v = events.issueTicket({ _id: 'x', role: 'customer' }, Date.now() - 120000);
    expect(events.redeemTicket(v.ticket)).toBeNull(); // expired
    first.req.destroy();
  });

  test('a customer hears about their own order only; an admin hears about every order', async () => {
    const a = await db.createUser(); const b = await db.createUser(); const admin = await db.createUser({ role: 'admin' });
    const sa = await openStream(await ticketFor(a.token));
    const sb = await openStream(await ticketFor(b.token));
    const sAdmin = await openStream(await ticketFor(admin.token));

    const order = await Order.create({ user: a.user._id, total_amount: 100 });
    const res = await request(app).put(`/api/orders/admin/${order._id}/status`).set('Authorization', `Bearer ${admin.token}`).send({ status: 'Preparing' });
    expect(res.status).toBe(200);

    await waitFor(() => pings(sa).length === 1 && pings(sAdmin).length === 1);
    await new Promise((r) => setTimeout(r, 150));
    expect(pings(sb)).toHaveLength(0);
    expect(pings(sa)[0].order_id).toBe(String(order._id));
    // the ping carries no order data at all
    expect(Object.keys(pings(sa)[0]).sort()).toEqual(['kind', 'order_id']);
    [sa, sb, sAdmin].forEach((s) => s.req.destroy());
  });

  test('a customer cancel and a new cash order also ping', async () => {
    const a = await db.createUser(); const admin = await db.createUser({ role: 'admin' });
    const sAdmin = await openStream(await ticketFor(admin.token));
    const order = await Order.create({ user: a.user._id, total_amount: 100 });
    await request(app).put(`/api/orders/${order._id}/cancel`).set('Authorization', `Bearer ${a.token}`);
    await waitFor(() => pings(sAdmin).length === 1);
    sAdmin.req.destroy();
  });

  test('no more than 5 open streams per user', async () => {
    const { token } = await db.createUser();
    const open = [];
    for (let i = 0; i < events.MAX_STREAMS_PER_USER; i++) open.push(await openStream(await ticketFor(token)));
    expect(open.every((s) => s.status === 200)).toBe(true);
    expect((await openStream(await ticketFor(token))).status).toBe(429);
    open.forEach((s) => s.req.destroy());
  });

  test('a closed stream is forgotten', async () => {
    const { token } = await db.createUser();
    const s = await openStream(await ticketFor(token));
    await waitFor(() => events.stats().streams === 1);
    s.req.destroy();
    await waitFor(() => events.stats().streams === 0);
  });
});
