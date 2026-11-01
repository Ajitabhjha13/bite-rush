// ===== RESERVE PAGE =====
// Book a table (date -> guests -> slot -> 2-minute hold -> Razorpay) and manage bookings.
// The SERVER is the single source of truth (cutoff, availability, price, refund).
// Everything calculated here (refund preview, countdown) is for display only.

const state = {
  policy: null,
  date: null,
  guests: 2,
  slot: null,
  availability: null,
  hold: null,       // { reservation, payment, endAt }
  timer: null,
  rzp: null,
  busy: false
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- helpers ----------
async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data.message || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

const istDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d); // YYYY-MM-DD
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtSlot(slot) {
  const [h, m] = slot.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function fmtDate(dateStr, long = false) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: long ? 'long' : 'short', day: 'numeric', month: 'short' });
}
const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
const newKey = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function goLogin() {
  window.location.href = 'login.html?next=reserve.html';
}

// ---------- policy ----------
async function loadPolicy() {
  try {
    state.policy = await api('/bookings/policy');
  } catch (e) {
    state.policy = {
      deposit_rupees: 100, hold_minutes: 2, max_guests: 6, max_advance_days: 7,
      refund_policy: [{ min_hours_before: 6, refund_percent: 100 }, { min_hours_before: 2, refund_percent: 50 }, { min_hours_before: 0, refund_percent: 0 }]
    };
  }
  const p = state.policy;
  $('heroHold').textContent = p.hold_minutes;
  $('heroDeposit').textContent = `₹${p.deposit_rupees}`;
  const t = p.refund_policy;
  $('policyList').innerHTML = `
    <li><span>Cancel ${t[0].min_hours_before}+ hours before your slot</span><strong class="text-success">${t[0].refund_percent}% refund</strong></li>
    <li><span>Cancel ${t[1].min_hours_before} to ${t[0].min_hours_before} hours before</span><strong class="text-warning">${t[1].refund_percent}% refund</strong></li>
    <li><span>Cancel less than ${t[1].min_hours_before} hours before / no-show</span><strong class="text-danger">${t[2].refund_percent}% refund</strong></li>`;
}

function refundPreview(b) {
  const hours = (new Date(`${b.date}T${b.slot}:00+05:30`) - Date.now()) / 3600000;
  if (hours <= 0) return null; // slot already started
  const tier = state.policy.refund_policy.find((t) => hours >= t.min_hours_before);
  return tier ? tier.refund_percent : 0;
}

// ---------- booking form ----------
function renderDateChips() {
  const first = addDays(istDate(new Date()), 1);
  const days = Array.from({ length: state.policy.max_advance_days }, (_, i) => addDays(first, i));
  if (!state.date) state.date = days[0];
  $('dateChips').innerHTML = days.map((d) => {
    const dt = new Date(`${d}T00:00:00Z`);
    return `<button type="button" class="date-chip ${d === state.date ? 'active' : ''}" data-date="${d}">
      <small>${dt.toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short' })}</small>
      <strong>${dt.getUTCDate()}</strong>
      <small>${dt.toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'short' })}</small>
    </button>`;
  }).join('');
}

function freeFor(slotInfo, guests) {
  let n = 0;
  if (guests <= 2) n += slotInfo.free['2'];
  if (guests <= 4) n += slotInfo.free['4'];
  return n + slotInfo.free['6'];
}

function renderSlots() {
  const grid = $('slotGrid');
  if (!state.availability) { grid.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-warning"></div></div>'; return; }
  grid.innerHTML = state.availability.slots.map((s) => {
    const n = freeFor(s, state.guests);
    const full = n === 0;
    return `<div class="col-6 col-md-4 col-lg">
      <button type="button" class="slot-card ${s.slot === state.slot ? 'active' : ''} ${n > 0 && n <= 2 ? 'low' : ''}" data-slot="${s.slot}" ${full ? 'disabled' : ''}>
        <div class="slot-time">${fmtSlot(s.slot)}</div>
        <div class="slot-free">${full ? 'Full' : n === 1 ? 'Last table!' : `${n} tables free`}</div>
      </button></div>`;
  }).join('');
  updateSummary();
}

function updateSummary() {
  const ok = state.date && state.slot;
  $('holdBtn').disabled = !ok || state.busy;
  $('selectionSummary').innerHTML = ok
    ? `<strong>${fmtDate(state.date, true)}</strong> at <strong>${fmtSlot(state.slot)}</strong> for <strong>${state.guests}</strong> guest${state.guests > 1 ? 's' : ''}`
    : 'Select a date and a time.';
}

async function loadAvailability() {
  state.availability = null;
  renderSlots();
  try {
    state.availability = await api(`/bookings/availability?date=${state.date}`);
  } catch (e) {
    $('slotGrid').innerHTML = `<p class="text-danger">${esc(e.message)}</p>`;
    return;
  }
  const cur = state.availability.slots.find((s) => s.slot === state.slot);
  if (!cur || freeFor(cur, state.guests) === 0) state.slot = null; // chosen slot just got taken
  renderSlots();
}

// ---------- hold + pay ----------
const modal = (id) => bootstrap.Modal.getOrCreateInstance($(id));

function holdSummaryHtml(r) {
  return `<div class="bg-light rounded-3 p-3 mb-3 small">
    <div class="d-flex justify-content-between"><span class="text-muted">Date</span><strong>${fmtDate(r.date, true)}</strong></div>
    <div class="d-flex justify-content-between"><span class="text-muted">Time</span><strong>${fmtSlot(r.slot)}</strong></div>
    <div class="d-flex justify-content-between"><span class="text-muted">Guests</span><strong>${r.guests}</strong></div>
    <div class="d-flex justify-content-between"><span class="text-muted">Deposit</span><strong>${state.hold.payment ? rupees(state.hold.payment.amount) : `₹${state.policy.deposit_rupees}`}</strong></div>
  </div>`;
}

function renderPayingView() {
  const r = state.hold.reservation;
  const demo = !state.hold.payment;
  $('holdModalBody').innerHTML = `
    <div class="text-center">
      <p class="text-muted mb-1">Your table is held for</p>
      <div class="hold-timer" id="holdTimer">02:00</div>
      <div class="hold-progress my-3"><div id="holdBar" style="width:100%"></div></div>
    </div>
    ${holdSummaryHtml(r)}
    ${demo ? '<div class="alert alert-warning small py-2">Demo mode: online payment is not configured on this server.</div>' : ''}
    <div class="d-grid gap-2">
      <button class="btn btn-warning btn-lg fw-semibold" id="payBtn">${demo ? 'Simulate payment' : `Pay ₹${state.policy.deposit_rupees} deposit`}</button>
      <button class="btn btn-outline-secondary" id="releaseBtn">Release this table</button>
    </div>
    <p class="text-muted small text-center mt-3 mb-0">Deposit is adjusted in your final bill. Test mode: no real money is charged.</p>`;
}

function startCountdown(seconds) {
  clearInterval(state.timer);
  state.hold.endAt = Date.now() + seconds * 1000;
  const total = seconds;
  const tick = () => {
    const left = Math.max(0, Math.ceil((state.hold.endAt - Date.now()) / 1000));
    const t = $('holdTimer'); const b = $('holdBar');
    if (t) { t.textContent = mmss(left); t.classList.toggle('urgent', left <= 20); }
    if (b) b.style.width = `${(left / total) * 100}%`;
    if (left <= 0) { clearInterval(state.timer); onHoldExpired(); }
  };
  tick();
  state.timer = setInterval(tick, 250);
}

async function startHold() {
  if (!isLoggedIn()) { showToast('Please log in to reserve a table.', 'info'); setTimeout(goLogin, 700); return; }
  if (state.busy) return;
  state.busy = true; updateSummary();
  $('holdBtn').innerHTML = '<span class="spinner-border spinner-border-sm"></span> Holding...';
  try {
    const out = await api('/bookings/hold', {
      method: 'POST', auth: true,
      body: { date: state.date, slot: state.slot, guests: state.guests, idempotency_key: newKey() }
    });
    state.hold = { reservation: out.reservation, payment: out.payment, endAt: 0 };
    renderPayingView();
    modal('holdModal').show();
    startCountdown(out.payment ? out.payment.timeout_seconds : state.policy.hold_minutes * 60);
    if (out.payment) openCheckout();
  } catch (e) {
    if (e.status === 401) { showToast('Your session expired. Please log in again.', 'error'); setTimeout(goLogin, 900); }
    else showToast(e.message, 'error');
    loadAvailability();
  } finally {
    state.busy = false;
    $('holdBtn').innerHTML = 'Hold my table <i class="bi bi-arrow-right-circle ms-1"></i>';
    updateSummary();
  }
}

function openCheckout() {
  const { payment, reservation } = state.hold;
  if (typeof Razorpay === 'undefined') { showToast('The payment popup could not load. Check your internet and try again.', 'error'); return; }
  const user = getCurrentUser() || {};
  const options = {
    key: payment.key_id,
    amount: payment.amount,
    currency: payment.currency,
    order_id: payment.order_id,
    name: 'Bite Rush',
    description: `Table deposit • ${fmtDate(reservation.date)} ${fmtSlot(reservation.slot)}`,
    image: 'images/logo.png',
    prefill: { name: user.name || '', email: user.email || '' },
    theme: { color: '#E8A93B' },
    timeout: Math.max(30, Math.floor((state.hold.endAt - Date.now()) / 1000)),
    handler: (resp) => confirmPayment({
      razorpay_payment_id: resp.razorpay_payment_id,
      razorpay_signature: resp.razorpay_signature
    }),
    modal: { ondismiss: () => { /* hold stays alive until the timer ends */ } }
  };
  state.rzp = new Razorpay(options);
  state.rzp.on('payment.failed', (r) => {
    const why = r && r.error && r.error.description ? r.error.description : 'Payment failed.';
    showToast(`${why} You can try again before the timer ends.`, 'error');
  });
  state.rzp.open();
}

async function confirmPayment(body) {
  const id = state.hold.reservation._id;
  $('holdModalBody').innerHTML = '<div class="text-center py-4"><div class="spinner-border text-warning mb-3"></div><p class="mb-0">Confirming your payment...</p></div>';
  try {
    const out = await api(`/bookings/${id}/confirm`, { method: 'POST', auth: true, body });
    clearInterval(state.timer);
    renderSuccessView(out.reservation);
    loadAvailability();
    loadMyBookings();
  } catch (e) {
    clearInterval(state.timer);
    if (/refunded/i.test(e.message)) renderMessageView('bi-arrow-return-left text-warning', 'Payment refunded', esc(e.message));
    else renderMessageView('bi-exclamation-octagon-fill text-danger', 'Could not confirm', esc(e.message));
    loadAvailability();
    loadMyBookings();
  }
}

function renderSuccessView(r) {
  $('holdModalBody').innerHTML = `
    <div class="text-center">
      <i class="bi bi-check-circle-fill text-success" style="font-size:3.5rem;"></i>
      <h4 class="fw-bold mt-2">Table confirmed!</h4>
      <p class="text-muted">See you on <strong>${fmtDate(r.date, true)}</strong> at <strong>${fmtSlot(r.slot)}</strong>.</p>
    </div>
    ${holdSummaryHtml(r)}
    <div class="d-grid gap-2">
      <button class="btn btn-warning fw-semibold" id="viewBookingsBtn">View my bookings</button>
      <button class="btn btn-outline-secondary" id="closeModalBtn">Book another</button>
    </div>`;
}

function renderMessageView(icon, title, text) {
  $('holdModalBody').innerHTML = `
    <div class="text-center">
      <i class="bi ${icon}" style="font-size:3.2rem;"></i>
      <h5 class="fw-bold mt-2">${title}</h5>
      <p class="text-muted">${text}</p>
    </div>
    <div class="d-grid gap-2">
      <button class="btn btn-warning fw-semibold" id="closeModalBtn">OK</button>
      <button class="btn btn-outline-secondary" id="viewBookingsBtn">View my bookings</button>
    </div>`;
}

function onHoldExpired() {
  try { if (state.rzp) state.rzp.close(); } catch (e) { /* ignore */ }
  renderMessageView('bi-hourglass-bottom text-warning', 'Hold expired',
    'Your 2-minute hold ended and the table was released. If you completed a payment just now, we will either confirm the booking or refund you automatically. Check <strong>My bookings</strong> in a minute.');
  loadAvailability();
  loadMyBookings();
}

async function releaseHold() {
  clearInterval(state.timer);
  try { if (state.rzp) state.rzp.close(); } catch (e) { /* ignore */ }
  try { await api(`/bookings/${state.hold.reservation._id}/cancel`, { method: 'PUT', auth: true }); } catch (e) { /* already gone */ }
  modal('holdModal').hide();
  showToast('Table released.', 'info');
  loadAvailability();
  loadMyBookings();
}

// ---------- my bookings ----------
const STATUS_LABEL = { held: 'Payment pending', confirmed: 'Confirmed', cancelled: 'Cancelled', expired: 'Expired' };

function refundNote(b) {
  if (b.refund_status === 'done' && b.refund_amount > 0) return `<span class="text-success small"><i class="bi bi-arrow-return-left"></i> ${rupees(b.refund_amount)} refunded</span>`;
  if (b.refund_status === 'failed') return '<span class="text-danger small"><i class="bi bi-exclamation-triangle"></i> Refund is being retried</span>';
  if (b.status === 'cancelled' && b.payment_status === 'paid') return '<span class="text-muted small">No refund (late cancellation)</span>';
  return '';
}

async function loadMyBookings() {
  const box = $('myBookings');
  if (!isLoggedIn()) {
    box.innerHTML = `<div class="text-center py-5"><i class="bi bi-person-lock fs-1 text-warning"></i>
      <p class="mt-2 mb-3">Please log in to see your bookings.</p><button class="btn btn-warning fw-semibold" id="loginForBookings">Login</button></div>`;
    return;
  }
  try {
    const list = await api('/bookings/my', { auth: true });
    if (!list.length) {
      box.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-calendar2-x fs-1"></i><p class="mt-2">No bookings yet.</p></div>';
      return;
    }
    box.innerHTML = list.map((b) => {
      const canCancel = (b.status === 'confirmed' && refundPreview(b) !== null) || b.status === 'held';
      return `<div class="card booking-card mb-3"><div class="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <div class="fw-semibold fs-5">${fmtDate(b.date, true)} • ${fmtSlot(b.slot)}</div>
          <div class="text-muted small">Table ${b.table ? b.table.number : '-'} (${b.table ? b.table.seats : '-'} seats) • ${b.guests} guest${b.guests > 1 ? 's' : ''}${b.amount ? ` • Deposit ${rupees(b.amount)}` : ''}</div>
          <div class="mt-1">${refundNote(b)}</div>
        </div>
        <div class="text-end">
          <span class="status-badge bk-${b.status}">${STATUS_LABEL[b.status] || b.status}</span>
          ${canCancel ? `<div class="mt-2"><button class="btn btn-sm btn-outline-danger" data-cancel="${b._id}">Cancel</button></div>` : ''}
        </div>
      </div></div>`;
    }).join('');
    state.myList = list;
  } catch (e) {
    box.innerHTML = `<p class="text-danger text-center py-4">${esc(e.message)}</p>`;
  }
}

function openCancelModal(id) {
  const b = (state.myList || []).find((x) => x._id === id);
  if (!b) return;
  const pct = b.status === 'held' ? null : refundPreview(b);
  const msg = b.status === 'held'
    ? 'This releases the table. You have not paid yet, so nothing is charged.'
    : pct === 100 ? `You will get a <strong class="text-success">full refund</strong> of ${rupees(b.amount)}.`
    : pct === 50 ? `You will get a <strong class="text-warning">50% refund</strong> (${rupees(b.amount / 2)}). Cancelling this close to your slot keeps half the deposit.`
    : `<strong class="text-danger">No refund</strong> applies: your slot is less than ${state.policy.refund_policy[1].min_hours_before} hours away. The table will still be freed.`;
  $('cancelModalBody').innerHTML = `
    <h5 class="fw-bold mb-2">Cancel this booking?</h5>
    <p class="mb-1">${fmtDate(b.date, true)} • ${fmtSlot(b.slot)} • ${b.guests} guests</p>
    <p class="mb-4">${msg}</p>
    <div class="d-flex gap-2 justify-content-end">
      <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Keep booking</button>
      <button class="btn btn-danger" id="confirmCancelBtn" data-id="${id}">Yes, cancel</button>
    </div>`;
  modal('cancelModal').show();
}

async function doCancel(id) {
  const btn = $('confirmCancelBtn');
  btn.disabled = true; btn.textContent = 'Cancelling...';
  try {
    const out = await api(`/bookings/${id}/cancel`, { method: 'PUT', auth: true });
    modal('cancelModal').hide();
    const r = out.refund || {};
    if (r.status === 'processed') showToast(`Booking cancelled. ${rupees(r.amount)} (${r.percent}%) is being refunded.`, 'success');
    else if (r.status === 'pending') showToast('Booking cancelled. Your refund is delayed and will be retried.', 'info');
    else showToast('Booking cancelled.', 'success');
  } catch (e) {
    modal('cancelModal').hide();
    showToast(e.message, 'error');
  }
  loadMyBookings();
  loadAvailability();
}

// ---------- wiring ----------
function bindEvents() {
  $('dateChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.date-chip');
    if (!chip) return;
    state.date = chip.dataset.date; state.slot = null;
    renderDateChips(); loadAvailability();
  });
  $('slotGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.slot-card');
    if (!card || card.disabled) return;
    state.slot = card.dataset.slot; renderSlots();
  });
  $('guestMinus').addEventListener('click', () => { if (state.guests > 1) { state.guests--; $('guestCount').textContent = state.guests; renderSlots(); } });
  $('guestPlus').addEventListener('click', () => { if (state.guests < state.policy.max_guests) { state.guests++; $('guestCount').textContent = state.guests; renderSlots(); } });
  $('holdBtn').addEventListener('click', startHold);

  // modal buttons are re-rendered, so use delegation
  $('holdModalBody').addEventListener('click', (e) => {
    if (e.target.closest('#payBtn')) {
      if (state.hold.payment) openCheckout();
      else confirmPayment({});
    } else if (e.target.closest('#releaseBtn')) releaseHold();
    else if (e.target.closest('#closeModalBtn')) modal('holdModal').hide();
    else if (e.target.closest('#viewBookingsBtn')) {
      modal('holdModal').hide();
      bootstrap.Tab.getOrCreateInstance($('tabMineBtn')).show();
    }
  });
  $('myBookings').addEventListener('click', (e) => {
    const c = e.target.closest('[data-cancel]');
    if (c) openCancelModal(c.dataset.cancel);
    if (e.target.closest('#loginForBookings')) goLogin();
  });
  $('cancelModalBody').addEventListener('click', (e) => {
    const b = e.target.closest('#confirmCancelBtn');
    if (b) doCancel(b.dataset.id);
  });
  $('tabMineBtn').addEventListener('shown.bs.tab', loadMyBookings);
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadPolicy();
  renderDateChips();
  bindEvents();
  loadAvailability();
  loadMyBookings();
  if (window.location.hash === '#my-bookings') bootstrap.Tab.getOrCreateInstance($('tabMineBtn')).show();
});
