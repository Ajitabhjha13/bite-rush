const crypto = require('crypto');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const rules = require('../config/passwordReset');
const { sendMail } = require('./mailer');

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const frontendUrl = () => (process.env.FRONTEND_URL || 'https://bite-rush-frontend.onrender.com').replace(/\/+$/, '');
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class ResetError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

function resetEmail(user, link) {
  const text = [
    `Hi ${user.name},`,
    '',
    'Someone asked to reset the password for your Bite Rush account. Open this link to choose a new one:',
    link,
    '',
    `The link works for ${rules.TOKEN_MINUTES} minutes and only once. If you did not ask for this, ignore this email and your password stays the same.`,
    '',
    'Bite Rush is a portfolio project (payments run in test mode).'
  ].join('\n');
  const html = `<p>Hi ${esc(user.name)},</p>
<p>Someone asked to reset the password for your Bite Rush account. Use the button below to choose a new one.</p>
<p><a href="${esc(link)}" style="background:#E8A93B;color:#14110F;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Choose a new password</a></p>
<p>Or paste this link into your browser:<br>${esc(link)}</p>
<p>The link works for ${rules.TOKEN_MINUTES} minutes and only once. If you did not ask for this, ignore this email and your password stays the same.</p>
<p style="color:#666;font-size:12px">Bite Rush is a portfolio project (payments run in test mode).</p>`;
  return { subject: 'Reset your Bite Rush password', text, html };
}

// Always behaves the same from the outside, whether or not the email belongs to an account.
// The email is sent in the background (`pending`), so a reply is not slower for a real account than for an unknown one.
async function requestReset(email, now = new Date()) {
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user) return { pending: Promise.resolve() };

  const recent = await PasswordReset.findOne({
    user: user._id, createdAt: { $gt: new Date(now - rules.RESEND_SECONDS * 1000) }
  });
  if (recent) return { pending: Promise.resolve() }; // just sent one

  await PasswordReset.deleteMany({ user: user._id }); // only the newest link works
  const token = crypto.randomBytes(32).toString('hex');
  await PasswordReset.create({
    user: user._id, token_hash: hash(token), expires_at: new Date(now.getTime() + rules.TOKEN_MINUTES * 60 * 1000)
  });

  const link = `${frontendUrl()}/reset-password.html?token=${token}`;
  const pending = sendMail({ to: user.email, ...resetEmail(user, link) })
    .catch((e) => console.error('[mail] reset email failed:', e.message));
  return { pending, token }; // `token` is for tests only; the controller never returns it
}

async function resetPassword(token, newPassword, now = new Date()) {
  // One atomic claim: two people (or two clicks) cannot both use the same link.
  const claimed = await PasswordReset.findOneAndUpdate(
    { token_hash: hash(String(token)), used_at: null, expires_at: { $gt: now } },
    { $set: { used_at: now } },
    { returnDocument: 'after' }
  );
  if (!claimed) throw new ResetError('This reset link is invalid or has expired. Please ask for a new one.');

  const user = await User.findById(claimed.user);
  if (!user) throw new ResetError('This reset link is invalid or has expired. Please ask for a new one.');

  user.password = newPassword;            // hashed by the model's save hook
  user.password_changed_at = now;         // signs out every device that logged in before this
  await user.save();
  await PasswordReset.deleteMany({ user: user._id });

  const text = `Hi ${user.name},\n\nThe password for your Bite Rush account was just changed. If this was you, nothing more to do. If it was not, reset it again right away.`;
  const pending = sendMail({
    to: user.email, subject: 'Your Bite Rush password was changed', text,
    html: `<p>Hi ${esc(user.name)},</p><p>The password for your Bite Rush account was just changed. If this was you, nothing more to do. If it was not, reset it again right away.</p>`
  }).catch((e) => console.error('[mail] confirmation email failed:', e.message));
  return { pending };
}

module.exports = { requestReset, resetPassword, ResetError, hash };
