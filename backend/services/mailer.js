// Sends email through Brevo's HTTP API (free plan: 300 a day). HTTP, not SMTP, because Render's free plan blocks SMTP ports.
//
// Needs BREVO_API_KEY and MAIL_FROM (an address verified as a sender in Brevo). Without them nothing is sent:
// on a developer machine the message is printed so the reset link can be copied; in production only a warning is logged,
// never the link, because logs are not a safe place for it.
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const FROM_NAME = process.env.MAIL_FROM_NAME || 'Bite Rush';

let transport = null; // tests replace this
function setTransport(t) { transport = t; }

const configured = () => Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM);

async function sendMail({ to, subject, text, html }) {
  if (transport) return transport({ to, subject, text, html });

  if (!configured()) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[mail] BREVO_API_KEY or MAIL_FROM is not set, so no email was sent');
    } else if (process.env.NODE_ENV !== 'test') {
      console.log(`[mail] (not sent, no Brevo key) to ${to}\n${subject}\n${text}`);
    }
    return { sent: false, via: 'none' };
  }

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: process.env.MAIL_FROM },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo returned ${res.status} ${detail.slice(0, 200)}`);
  }
  return { sent: true, via: 'brevo' };
}

module.exports = { sendMail, setTransport, configured };
