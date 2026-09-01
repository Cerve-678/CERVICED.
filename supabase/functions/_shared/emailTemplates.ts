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
// Ported verbatim from the client versions so nothing about the emails
// people receive changes. Two templates were NOT ported: bookingReminderEmail
// and newBookingProviderEmail had zero callers and were deleted rather than
// carried across.
//
// Every interpolated value below is a name, service or address that ends up
// inside HTML, so it goes through escapeHtml() at the call site in the
// functions that use these — see send-booking-confirmation.

const BASE_STYLE = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Jura:wght@400;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: #F5E6FA; font-family: 'Jura', Georgia, sans-serif; }
  </style>
`;

function emailWrapper(content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${BASE_STYLE}
</head>
<body style="background:#F5E6FA;padding:40px 16px;font-family:'Jura',Georgia,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
    <!-- Header -->
    <tr>
      <td align="center" style="padding-bottom:32px;">
        <div style="background:linear-gradient(135deg,#a342c3,#DA70D6);border-radius:20px;padding:28px 40px;display:inline-block;">
          <div style="color:#fff;font-size:36px;font-weight:900;letter-spacing:4px;font-family:Impact,'Arial Black',sans-serif;">CERVICED</div>
          <div style="color:rgba(255,255,255,0.85);font-size:13px;letter-spacing:1px;margin-top:4px;font-family:'Jura',Georgia,sans-serif;">Beauty at your fingertips</div>
        </div>
      </td>
    </tr>
    <!-- Card -->
    <tr>
      <td>
        <div style="background:#fff;border-radius:20px;padding:40px 36px;box-shadow:0 4px 24px rgba(163,66,195,0.12);">
          ${content}
        </div>
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td align="center" style="padding-top:28px;padding-bottom:8px;">
        <p style="color:#a342c3;font-size:12px;letter-spacing:1px;">© CERVICED · cerviced.co</p>
        <p style="color:#999;font-size:11px;margin-top:6px;">You're receiving this because you signed up for CERVICED.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function clientWelcomeEmail(params: { name: string }) {
  const firstName = params.name.split(' ')[0];
  return {
    subject: `Welcome to CERVICED, ${firstName} ✨`,
    html: emailWrapper(`
      <h1 style="font-size:26px;color:#1a1a1a;font-weight:700;letter-spacing:1px;margin-bottom:8px;">Welcome, ${firstName} ✨</h1>
      <p style="color:#DA70D6;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-bottom:24px;">Your beauty journey starts now</p>

      <p style="color:#444;font-size:15px;line-height:1.7;margin-bottom:24px;">
        You're now part of CERVICED — the home of top beauty professionals near you. Book hair, nails, lashes, brows, MUA, and more, all in one place.
      </p>

      <div style="background:#F5E6FA;border-radius:14px;padding:20px 24px;margin-bottom:28px;">
        <p style="color:#a342c3;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:14px;">What you can do</p>
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr><td style="padding:6px 0;"><span style="color:#a342c3;font-size:16px;margin-right:10px;">✦</span><span style="color:#333;font-size:14px;">Discover verified beauty providers</span></td></tr>
          <tr><td style="padding:6px 0;"><span style="color:#a342c3;font-size:16px;margin-right:10px;">✦</span><span style="color:#333;font-size:14px;">Browse portfolios & real work</span></td></tr>
          <tr><td style="padding:6px 0;"><span style="color:#a342c3;font-size:16px;margin-right:10px;">✦</span><span style="color:#333;font-size:14px;">Book & manage appointments</span></td></tr>
          <tr><td style="padding:6px 0;"><span style="color:#a342c3;font-size:16px;margin-right:10px;">✦</span><span style="color:#333;font-size:14px;">Save your favourite providers</span></td></tr>
        </table>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <a href="cerviced://home" style="display:inline-block;background:linear-gradient(135deg,#a342c3,#DA70D6);color:#fff;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:14px 40px;border-radius:50px;">Open CERVICED</a>
          </td>
        </tr>
      </table>

      <p style="color:#999;font-size:12px;text-align:center;margin-top:24px;">Not working? Open the CERVICED app on your phone.</p>
    `),
  };
}

export function providerWelcomeEmail(params: { name: string; businessName?: string }) {
  const firstName = params.name.split(' ')[0];
  const display = params.businessName || firstName;
  return {
    subject: `Welcome to CERVICED, ${display} — your profile is ready 🎉`,
    html: emailWrapper(`
      <h1 style="font-size:26px;color:#1a1a1a;font-weight:700;letter-spacing:1px;margin-bottom:8px;">You're live on CERVICED 🎉</h1>
      <p style="color:#DA70D6;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-bottom:24px;">Welcome to the platform, ${display}</p>

      <p style="color:#444;font-size:15px;line-height:1.7;margin-bottom:24px;">
        Your provider account is set up and ready. Clients across the platform can now discover your work. Here's how to get the most out of CERVICED from day one.
      </p>

      <div style="background:#F5E6FA;border-radius:14px;padding:20px 24px;margin-bottom:28px;">
        <p style="color:#a342c3;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:14px;">Get started</p>
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr><td style="padding:6px 0;">
            <span style="background:#a342c3;color:#fff;font-size:10px;font-weight:700;letter-spacing:1px;padding:2px 8px;border-radius:20px;margin-right:10px;">1</span>
            <span style="color:#333;font-size:14px;">Complete your profile & add a photo</span>
          </td></tr>
          <tr><td style="padding:6px 0;">
            <span style="background:#a342c3;color:#fff;font-size:10px;font-weight:700;letter-spacing:1px;padding:2px 8px;border-radius:20px;margin-right:10px;">2</span>
            <span style="color:#333;font-size:14px;">Upload your portfolio work</span>
          </td></tr>
          <tr><td style="padding:6px 0;">
            <span style="background:#a342c3;color:#fff;font-size:10px;font-weight:700;letter-spacing:1px;padding:2px 8px;border-radius:20px;margin-right:10px;">3</span>
            <span style="color:#333;font-size:14px;">Add your services & pricing</span>
          </td></tr>
          <tr><td style="padding:6px 0;">
            <span style="background:#a342c3;color:#fff;font-size:10px;font-weight:700;letter-spacing:1px;padding:2px 8px;border-radius:20px;margin-right:10px;">4</span>
            <span style="color:#333;font-size:14px;">Set your availability</span>
          </td></tr>
        </table>
      </div>

      <div style="border-left:3px solid #DA70D6;padding-left:16px;margin-bottom:28px;">
        <p style="color:#666;font-size:13px;line-height:1.7;">Providers with complete profiles and portfolio photos get significantly more bookings. Take 5 minutes to set yours up now.</p>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <a href="cerviced://provider/profile" style="display:inline-block;background:linear-gradient(135deg,#a342c3,#DA70D6);color:#fff;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:14px 40px;border-radius:50px;">Set Up My Profile</a>
          </td>
        </tr>
      </table>

      <p style="color:#999;font-size:12px;text-align:center;margin-top:24px;">Not working? Open the CERVICED app on your phone.</p>
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
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;color:#1a1a1a">
        <h2 style="color:#a342c3">Booking Confirmed ✓</h2>
        <p>Hi ${params.clientName},</p>
        <p>Your booking is confirmed. Here are the details:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;font-weight:600">Service</td><td>${params.service}</td></tr>
          <tr><td style="padding:8px 0;font-weight:600">Provider</td><td>${params.providerName}</td></tr>
          <tr><td style="padding:8px 0;font-weight:600">Date</td><td>${params.date}</td></tr>
          <tr><td style="padding:8px 0;font-weight:600">Time</td><td>${params.time}</td></tr>
          <tr><td style="padding:8px 0;font-weight:600">Location</td><td>${params.location}</td></tr>
        </table>
        <p style="color:#666;font-size:14px">Need to cancel or reschedule? Open the CERVICED app.</p>
        <p style="color:#a342c3;font-weight:600">CERVICED</p>
      </div>
    `,
  };
}
