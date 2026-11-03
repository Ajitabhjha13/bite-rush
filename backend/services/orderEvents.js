// Live order updates (Server-Sent Events).
//
// The stream only carries a tiny "something changed" ping: { order_id, user_id }. It never carries order
// data, so a ping can leak nothing. The browser reacts by re-fetching its own list through the normal
// authenticated API, which already knows who may see what.
//
// State is kept in this process's memory. That is right for one server (Render free plan). With several
// servers, a ping would only reach people connected to the same one, and the 30-second refresh in the
// browser would still catch up.
const crypto = require('crypto');

const TICKET_SECONDS = 60;      // a ticket must be used within this time
const HEARTBEAT_MS = 25000;     // keeps proxies from closing a quiet connection
const MAX_STREAMS_PER_USER = 5; // several tabs are fine, a runaway script is not

const tickets = new Map();      // ticket -> { userId, role, expires }
const streams = new Set();      // { res, userId, role }

// One-time ticket, because EventSource cannot send an Authorization header and a JWT must never go in a URL.
function issueTicket(user, now = Date.now()) {
  for (const [t, v] of tickets) if (v.expires <= now) tickets.delete(t); // sweep old ones
  const ticket = crypto.randomBytes(24).toString('hex');
  tickets.set(ticket, { userId: String(user._id), role: user.role, expires: now + TICKET_SECONDS * 1000 });
  return { ticket, expires_in: TICKET_SECONDS };
}

function redeemTicket(ticket, now = Date.now()) {
  const v = tickets.get(ticket);
  if (!v) return null;
  tickets.delete(ticket); // single use
  return v.expires > now ? v : null;
}

// Opens the stream for a redeemed ticket. Returns false if this user has too many open already.
function addStream(res, who) {
  let mine = 0;
  for (const s of streams) if (s.userId === who.userId) mine++;
  if (mine >= MAX_STREAMS_PER_USER) return false;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no' // do not let a proxy hold the messages back
  });
  res.write('retry: 3000\n\n'); // browser reconnects after 3 seconds if the line drops
  res.write('event: ready\ndata: {}\n\n');

  const entry = { res, userId: who.userId, role: who.role };
  entry.timer = setInterval(() => res.write(': keep-alive\n\n'), HEARTBEAT_MS);
  streams.add(entry);
  const close = () => { clearInterval(entry.timer); streams.delete(entry); };
  res.on('close', close);
  res.on('error', close);
  return true;
}

// Tell whoever should hear about it: the order's owner, and every admin.
function publish(order, kind = 'order') {
  if (!order) return;
  const userId = String(order.user && order.user._id ? order.user._id : order.user);
  const payload = JSON.stringify({ order_id: String(order._id), kind });
  for (const s of streams) {
    if (s.role === 'admin' || s.userId === userId) {
      try { s.res.write(`event: order\ndata: ${payload}\n\n`); } catch (e) { /* closed; its close handler cleans up */ }
    }
  }
}

function stats() { return { streams: streams.size, tickets: tickets.size }; }
function closeAll() { for (const s of [...streams]) { clearInterval(s.timer); s.res.end(); } streams.clear(); tickets.clear(); }

module.exports = { issueTicket, redeemTicket, addStream, publish, stats, closeAll, TICKET_SECONDS, MAX_STREAMS_PER_USER };
