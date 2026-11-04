const request = require('supertest');
const app = require('../app');
const db = require('./helpers');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const mailer = require('../services/mailer');
const resets = require('../services/passwordResetService');
const jwt = require('jsonwebtoken');

beforeAll(db.connect);
afterEach(async () => { await db.clearDb(); mailer.setTransport(null); delete process.env.BREVO_API_KEY; delete process.env.MAIL_FROM; delete process.env.FRONTEND_URL; });
afterAll(db.disconnect);

const body = { name: 'Ajitabh', email: 'a@test.com', password: 'secret123' };
const register = () => request(app).post('/api/auth/register').send(body);
const flush = () => new Promise((r) => setTimeout(r, 50));

function captureMail() {
  const sent = [];
  mailer.setTransport(async (m) => { sent.push(m); return { sent: true }; });
  return sent;
}
const tokenFrom = (mail) => mail.text.match(/token=([a-f0-9]{64})/)[1];

describe('forgot password', () => {
  test('known and unknown emails get the same answer', async () => {
    captureMail();
    await register();
    const a = await request(app).post('/api/auth/forgot-password').send({ email: body.email });
    const b = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@test.com' });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body).toEqual(b.body);
  });

  test('email is sent only for a real account, with a working link and no em dash', async () => {
    const sent = captureMail();
    await register();
    await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@test.com' });
    await request(app).post('/api/auth/forgot-password').send({ email: body.email });
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(body.email);
    expect(sent[0].text).toMatch(/reset-password\.html\?token=[a-f0-9]{64}/);
    expect(sent[0].text + sent[0].html).not.toMatch(/—/);
  });

  test('link uses FRONTEND_URL', async () => {
    const sent = captureMail();
    process.env.FRONTEND_URL = 'http://localhost:3000/';
    await register();
    await request(app).post('/api/auth/forgot-password').send({ email: body.email });
    await flush();
    expect(sent[0].text).toContain('http://localhost:3000/reset-password.html?token=');
  });

  test('only a hash of the token is stored', async () => {
    const sent = captureMail();
    await register();
    await request(app).post('/api/auth/forgot-password').send({ email: body.email });
    await flush();
    const token = tokenFrom(sent[0]);
    const row = await PasswordReset.findOne();
    expect(row.token_hash).not.toBe(token);
    expect(row.token_hash).toBe(resets.hash(token));
  });

  test('asking again within a minute does not send a second email', async () => {
    const sent = captureMail();
    await register();
    await request(app).post('/api/auth/forgot-password').send({ email: body.email });
    await request(app).post('/api/auth/forgot-password').send({ email: body.email });
    await flush();
    expect(sent).toHaveLength(1);
    expect(await PasswordReset.countDocuments()).toBe(1);
  });

  test('a newer link replaces the older one', async () => {
    const sent = captureMail();
    await register();
    const user = await User.findOne();
    const old = await resets.requestReset(body.email, new Date());
    await PasswordReset.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } }); // pretend it was sent 5 minutes ago
    await resets.requestReset(body.email);
    await flush();
    expect(await PasswordReset.countDocuments({ user: user._id })).toBe(1);
    const r = await request(app).post('/api/auth/reset-password').send({ token: old.token, password: 'newpass123' });
    expect(r.status).toBe(400);
    expect(sent).toHaveLength(2);
  });

  test('bad email format is rejected', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nope' });
    expect(res.status).toBe(400);
  });

  test('a failing mail provider does not break the request', async () => {
    mailer.setTransport(async () => { throw new Error('brevo down'); });
    await register();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/api/auth/forgot-password').send({ email: body.email });
    await flush();
    spy.mockRestore();
    expect(res.status).toBe(200);
  });
});

describe('reset password', () => {
  async function setup() {
    const sent = captureMail();
    const reg = await register();
    await request(app).post('/api/auth/forgot-password').send({ email: body.email });
    await flush();
    return { token: tokenFrom(sent[0]), oldJwt: reg.body.token, sent };
  }

  test('sets the new password; old one stops working', async () => {
    const { token } = await setup();
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'brandnew99' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    const oldLogin = await request(app).post('/api/auth/login').send({ email: body.email, password: body.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/auth/login').send({ email: body.email, password: 'brandnew99' });
    expect(newLogin.status).toBe(200);
    const user = await User.findOne();
    expect(user.password).not.toBe('brandnew99');
  });

  test('the link works only once', async () => {
    const { token } = await setup();
    const first = await request(app).post('/api/auth/reset-password').send({ token, password: 'brandnew99' });
    const second = await request(app).post('/api/auth/reset-password').send({ token, password: 'another999' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
  });

  test('two requests at the same moment: only one wins', async () => {
    const { token } = await setup();
    const [a, b] = await Promise.all([
      request(app).post('/api/auth/reset-password').send({ token, password: 'brandnew99' }),
      request(app).post('/api/auth/reset-password').send({ token, password: 'brandnew88' })
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
  });

  test('an expired link is refused', async () => {
    await register();
    captureMail();
    const { token } = await resets.requestReset(body.email, new Date(Date.now() - 31 * 60 * 1000));
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'brandnew99' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/);
  });

  test('a wrong or malformed token is refused', async () => {
    await setup();
    const wrong = await request(app).post('/api/auth/reset-password').send({ token: 'a'.repeat(64), password: 'brandnew99' });
    expect(wrong.status).toBe(400);
    const malformed = await request(app).post('/api/auth/reset-password').send({ token: { $ne: null }, password: 'brandnew99' });
    expect(malformed.status).toBe(400);
  });

  test('short password is rejected and the link stays usable', async () => {
    const { token } = await setup();
    const short = await request(app).post('/api/auth/reset-password').send({ token, password: 'short' });
    expect(short.status).toBe(400);
    const ok = await request(app).post('/api/auth/reset-password').send({ token, password: 'longenough1' });
    expect(ok.status).toBe(200);
  });

  test('login tokens from before the reset stop working', async () => {
    const { token, oldJwt } = await setup();
    const before = await request(app).get('/api/orders/my').set('Authorization', `Bearer ${oldJwt}`);
    expect(before.status).not.toBe(401);
    await new Promise((r) => setTimeout(r, 1100)); // jwt iat has one-second resolution
    await request(app).post('/api/auth/reset-password').send({ token, password: 'brandnew99' });
    const after = await request(app).get('/api/orders/my').set('Authorization', `Bearer ${oldJwt}`);
    expect(after.status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: body.email, password: 'brandnew99' });
    const fresh = await request(app).get('/api/orders/my').set('Authorization', `Bearer ${login.body.token}`);
    expect(fresh.status).not.toBe(401);
  });

  test('a confirmation email is sent after the change', async () => {
    const { token, sent } = await setup();
    await request(app).post('/api/auth/reset-password').send({ token, password: 'brandnew99' });
    await flush();
    expect(sent).toHaveLength(2);
    expect(sent[1].subject).toMatch(/changed/);
  });

  test('accounts that never reset still log in and use their token', async () => {
    const reg = await register();
    const me = await request(app).get('/api/orders/my').set('Authorization', `Bearer ${reg.body.token}`);
    expect(me.status).not.toBe(401);
  });
});

describe('mailer', () => {
  afterEach(() => { jest.restoreAllMocks(); delete global.__f; });

  test('sends the right payload to Brevo', async () => {
    process.env.BREVO_API_KEY = 'key-123';
    process.env.MAIL_FROM = 'from@test.com';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
    const r = await mailer.sendMail({ to: 'x@test.com', subject: 'Hi', text: 'T', html: '<p>H</p>' });
    expect(r.sent).toBe(true);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(opts.headers['api-key']).toBe('key-123');
    const payload = JSON.parse(opts.body);
    expect(payload.sender.email).toBe('from@test.com');
    expect(payload.to).toEqual([{ email: 'x@test.com' }]);
    expect(payload.subject).toBe('Hi');
    expect(payload.textContent).toBe('T');
  });

  test('throws when Brevo rejects', async () => {
    process.env.BREVO_API_KEY = 'k';
    process.env.MAIL_FROM = 'from@test.com';
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401, text: async () => 'bad key' });
    await expect(mailer.sendMail({ to: 'x@test.com', subject: 's', text: 't', html: 'h' })).rejects.toThrow(/401/);
  });

  test('without a key nothing is sent and nothing crashes', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const r = await mailer.sendMail({ to: 'x@test.com', subject: 's', text: 't', html: 'h' });
    expect(r.sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
