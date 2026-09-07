// supabase/functions/_shared/emailTemplates.ts
// The app's transactional email templates, server-side.
//
// These used to live in src/services/emailService.ts and were rendered on the
// device, which meant the phone decided what our emails said and — worse — an
// email only got sent if the app stayed open long enough to send it. A booking
// confirmation that depends on the user not switching apps is not a
// confirmation. They live here now so the server owns both the wording and
// the sending.
//
// "Quiet Signal" design: no card, no gradient header, no button chrome — a
// hairline rule under the wordmark and a text-link CTA carry the identity,
// typeset in the app's real client-hat faces (Bakbak One / Jura) and real
// palette (plum on warm pink-white in light, blue-grey on near-black in
// dark — the accent changes hue between modes, it isn't the same colour
// dimmed). Dark mode is a `prefers-color-scheme` media query rather than a
// second template; clients that don't support it just render light, which
// is a strict improvement over the old design having no dark mode at all.
//
// Every interpolated value below is a name, service or address that ends up
// inside HTML, so it goes through escapeHtml() at the call site in the
// functions that use these — see send-booking-confirmation.

const BASE_STYLE = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Jura:wght@400;500;600;700&family=Bakbak+One&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: #FBF7F8; font-family: 'Jura', Georgia, serif; }
    a { color: inherit; }

    .qs-mark { font-family: 'Bakbak One', 'Arial Black', sans-serif; font-size: 13px; letter-spacing: 4px; color: #1A1418; }
    .qs-rule { width: 34px; height: 2px; margin: 14px 0 40px; background: #3F1E36; font-size: 0; line-height: 0; }
    .qs-h1 { font-size: 25px; font-weight: 400; line-height: 1.3; margin: 0 0 20px; letter-spacing: 0.2px; color: #1A1418; }
    .qs-body { font-size: 15px; line-height: 1.8; margin: 0 0 34px; max-width: 46ch; color: rgba(26,20,24,0.78); }
    .qs-list { margin: 0 0 40px; padding: 0; list-style: none; }
    .qs-list td { font-size: 14.5px; padding: 13px 0; border-bottom: 1px solid rgba(26,20,24,0.10); color: rgba(26,20,24,0.85); }
    .qs-note { border-top: 1px solid rgba(26,20,24,0.10); padding: 20px 0 0; margin: 0 0 34px; font-size: 13px; line-height: 1.7; color: rgba(26,20,24,0.65); }
    .qs-cta { display: inline-block; font-family: 'Jura', Georgia, serif; font-size: 14.5px; font-weight: 600; text-decoration: none; padding-bottom: 3px; border-bottom: 1.5px solid #3F1E36; color: #3F1E36; }
    .qs-code { font-family: 'Bakbak One', 'Arial Black', sans-serif; font-size: 32px; letter-spacing: 8px; color: #1A1418; margin: 0 0 34px; }
    .qs-foot { margin-top: 52px; font-size: 11.5px; color: rgba(26,20,24,0.42); }
    .qs-foot p { margin: 0 0 4px; }

    @media (prefers-color-scheme: dark) {
      body { background-color: #17151A !important; }
      .qs-mark { color: #F0ECE7 !important; }
      .qs-rule { background: #E5ECF4 !important; }
      .qs-h1 { color: #F0ECE7 !important; }
      .qs-body { color: rgba(240,236,231,0.78) !important; }
      .qs-list td { border-color: rgba(240,236,231,0.12) !important; color: rgba(240,236,231,0.85) !important; }
      .qs-note { border-color: rgba(240,236,231,0.12) !important; color: rgba(240,236,231,0.65) !important; }
      .qs-cta { border-color: #E5ECF4 !important; color: #E5ECF4 !important; }
      .qs-code { color: #F0ECE7 !important; }
      .qs-foot { color: rgba(240,236,231,0.42) !important; }
    }
  </style>
`;

function emailWrapper(content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  ${BASE_STYLE}
</head>
<body style="background:#FBF7F8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:56px 24px 44px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <tr>
            <td>
              <div class="qs-mark">CERVICED</div>
              <div class="qs-rule">&nbsp;</div>
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function qsFooter(extra?: string) {
  return `
      <div class="qs-foot">
        <p>CERVICED &middot; cerviced.co</p>
        <p>${extra ?? "You're receiving this because you have a CERVICED account."}</p>
      </div>`;
}

export function clientWelcomeEmail(params: { name: string }) {
  const firstName = params.name.split(' ')[0];
  return {
    subject: `Welcome to CERVICED, ${firstName}`,
    html: emailWrapper(`
      <h1 class="qs-h1">Welcome, ${firstName}.</h1>
      <p class="qs-body">You're now part of CERVICED &mdash; the home of top beauty professionals near you. Book hair, nails, lashes, brows, MUA, and more, all in one place.</p>

      <table class="qs-list" width="100%" cellpadding="0" cellspacing="0">
        <tr><td>Discover verified beauty providers</td></tr>
        <tr><td>Browse portfolios &amp; real work</td></tr>
        <tr><td>Book &amp; manage appointments</td></tr>
        <tr><td>Save your favourite providers</td></tr>
      </table>

      <a class="qs-cta" href="cerviced://home">Open CERVICED &rarr;</a>

      ${qsFooter("You're receiving this because you signed up for CERVICED.")}
    `),
  };
}

export function providerWelcomeEmail(params: { name: string; businessName?: string }) {
  const firstName = params.name.split(' ')[0];
  const display = params.businessName || firstName;
  return {
    subject: `Welcome to CERVICED, ${display} — your profile is ready`,
    html: emailWrapper(`
      <h1 class="qs-h1">You're live on CERVICED.</h1>
      <p class="qs-body">Hi ${display}, your provider account is set up and ready. Clients across the platform can now discover your work. Here's how to get the most out of CERVICED from day one.</p>

      <table class="qs-list" width="100%" cellpadding="0" cellspacing="0">
        <tr><td>1. Complete your profile &amp; add a photo</td></tr>
        <tr><td>2. Upload your portfolio work</td></tr>
        <tr><td>3. Add your services &amp; pricing</td></tr>
        <tr><td>4. Set your availability</td></tr>
      </table>

      <p class="qs-note">Providers with complete profiles and portfolio photos get significantly more bookings. Take 5 minutes to set yours up now.</p>

      <a class="qs-cta" href="cerviced://provider/profile">Set Up My Profile &rarr;</a>

      ${qsFooter("You're receiving this because you signed up for CERVICED.")}
    `),
  };
}

export function passwordChangedEmail(params: { name: string }) {
  const firstName = params.name.split(' ')[0] || 'there';
  return {
    subject: 'Your CERVICED password was changed',
    html: emailWrapper(`
      <h1 class="qs-h1">Password changed.</h1>
      <p class="qs-body">Hi ${firstName}, this confirms the password on your CERVICED account was just changed. You can use your new password to sign in from now on.</p>

      <p class="qs-note">If you made this change, no further action is needed. If you didn't, someone else may have access to your account &mdash; contact support@cerviced.co right away.</p>

      ${qsFooter()}
    `),
  };
}

export function claimVerificationCodeEmail(params: { code: string }) {
  return {
    subject: `Your CERVICED verification code: ${params.code}`,
    html: emailWrapper(`
      <h1 class="qs-h1">Claim your listing.</h1>
      <p class="qs-body">Enter this code in the CERVICED app to confirm this listing is yours:</p>

      <div class="qs-code">${params.code}</div>

      <p class="qs-note">This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>

      ${qsFooter()}
    `),
  };
}

export function passwordChangedEmail(params: { name: string }) {
  const firstName = params.name.split(' ')[0] || 'there';
  return {
    subject: 'Your CERVICED password was changed',
    html: emailWrapper(`
      <h1 style="font-size:26px;color:#1a1a1a;font-weight:700;letter-spacing:1px;margin-bottom:8px;">Password changed</h1>
      <p style="color:#DA70D6;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-bottom:24px;">Hi ${firstName}</p>

      <p style="color:#444;font-size:15px;line-height:1.7;margin-bottom:24px;">
        This confirms the password on your CERVICED account was just changed. You can use your new password to sign in from now on.
      </p>

      <div style="border-left:3px solid #DA70D6;padding-left:16px;margin-bottom:8px;">
        <p style="color:#666;font-size:13px;line-height:1.7;">
          If you made this change, no further action is needed. If you didn't, someone else may have access to your account — contact support@cerviced.co right away.
        </p>
      </div>

      <p style="color:#999;font-size:12px;text-align:center;margin-top:24px;">Not working? Open the CERVICED app on your phone.</p>
    `),
  };
}

export function bookingConfirmationEmail(params: {
  clientName: string;
  providerName: string;
  service: string;
  date: string;
  time: string;
  location: string;
}) {
  return {
    subject: `Booking Confirmed – ${params.service} with ${params.providerName}`,
    html: emailWrapper(`
      <h1 class="qs-h1">Booking confirmed.</h1>
      <p class="qs-body">Hi ${params.clientName}, your booking is confirmed. Here are the details:</p>

      <table class="qs-list" width="100%" cellpadding="0" cellspacing="0">
        <tr><td>Service &mdash; ${params.service}</td></tr>
        <tr><td>Provider &mdash; ${params.providerName}</td></tr>
        <tr><td>Date &mdash; ${params.date}</td></tr>
        <tr><td>Time &mdash; ${params.time}</td></tr>
        <tr><td>Location &mdash; ${params.location}</td></tr>
      </table>

      <p class="qs-note">Need to cancel or reschedule? Open the CERVICED app.</p>

      ${qsFooter()}
    `),
  };
}
