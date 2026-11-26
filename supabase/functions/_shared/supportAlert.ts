// Sends one internal alert to the support inbox through Resend. Never throws:
// an alert that can't be sent must not undo or block the money work that
// prompted it, so a failure is logged and reported as false.

const SUPPORT_EMAIL = 'support@cerviced.co';
const FROM_EMAIL = 'CERVICED alerts <noreply@cerviced.co>';

export async function sendSupportAlert(email: { subject: string; html: string }, tag: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    console.error(`[${tag}] support alert not sent: RESEND_API_KEY is not set`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: SUPPORT_EMAIL, subject: email.subject, html: email.html }),
    });
    if (!res.ok) throw new Error(await res.text());
    return true;
  } catch (err) {
    console.error(`[${tag}] support alert not sent: ${String(err)}`);
    return false;
  }
}
