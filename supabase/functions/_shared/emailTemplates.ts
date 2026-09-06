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
// Two templates were NOT ported from the client versions: bookingReminderEmail
// and newBookingProviderEmail had zero callers and were deleted rather than
// carried across.
//
// Every interpolated value below is a name, service or address that ends up
// inside HTML, so it goes through escapeHtml() at the call site in the
// functions that use these — see send-booking-confirmation.

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
// These are the app's own colours (src/constants/theme.ts, documented in
// DESIGN_SYSTEM.md), not an email-only invention. The templates used to render
// a bright orchid gradient (#a342c3 → #DA70D6 on #F5E6FA lilac) with an Impact
// wordmark — a palette that appears nowhere in the product — so a welcome
// email looked like a different company to the app it was welcoming you into.
//
// There are two palettes because the app has two hats, and an email belongs to
// the hat it is about: a client email is plum, a provider email is chocolate.
// Both are the LIGHT-mode values only. Email clients' dark modes range from no
// support at all to inverting the whole message unasked, so a template that
// tries to follow the reader's theme reliably renders worse than one that
// commits to a single ground.
//
// rgba() tokens are pre-flattened to hex against the surface they actually sit
// on — Outlook drops rgba() outright and would leave the element transparent.

interface EmailPalette {
  bg: string;
  surface: string;
  card: string;
  accent: string;
  /** Drawn ON TOP of a solid accent fill — never a hardcoded white. */
  onAccent: string;
  text: string;
  sub: string;
  border: string;
}

/** Client hat — clientLightTheme. */
const CLIENT: EmailPalette = {
  bg:       '#FBF7F8',
  surface:  '#F3EEF0',
  card:     '#FFFFFF',
  accent:   '#4A2340', // plum
  onAccent: '#FFFFFF',
  text:     '#000000',
  sub:      '#8F7789', // rgba(74,35,64,0.62) flattened onto white
  border:   '#E6E0E4', // rgba(74,35,64,0.14) flattened onto white
};

/** Provider hat — lightTheme. Also the account-level default. */
const PROVIDER: EmailPalette = {
  bg:       '#F5F1EC',
  surface:  '#EDE8E2',
  card:     '#FFFFFF',
  accent:   '#5C4033', // dark chocolate brown
  onAccent: '#FFFFFF',
  text:     '#000000',
  sub:      '#7E6667',
  border:   '#EDEAEA', // rgba(126,102,103,0.14) flattened onto white
};

// The app's two fonts (DESIGN_SYSTEM.md: uppercase/display → BakbakOne,
// sentences → Jura), each with a real fallback stack. Apple Mail honours the
// webfont link and most CERVICED mail is read on an iPhone; Gmail strips it
// and lands on the fallback, which is why the stacks matter more than the
// @import does.
const DISPLAY = "'Bakbak One', 'Arial Black', Impact, sans-serif";
const BODY = "'Jura', 'Trebuchet MS', Verdana, sans-serif";

const FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Bakbak+One&family=Jura:wght@400;600;700&display=swap';

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
// Shared so the templates below stay readable and can't drift apart one inline
// style at a time — the previous versions were five hand-maintained copies of
// near-identical style soup.

function emailWrapper(content: string, P: EmailPalette) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${FONT_LINK}" rel="stylesheet" />
  <style>
    @import url('${FONT_LINK}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: ${P.bg}; font-family: ${BODY}; }
  </style>
</head>
<body style="background:${P.bg};padding:40px 16px;font-family:${BODY};">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
    <tr>
      <td align="center" style="padding-bottom:28px;">
        <div style="font-family:${DISPLAY};font-size:30px;letter-spacing:6px;color:${P.accent};line-height:1.2;">CERVICED</div>
        <div style="font-family:${BODY};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${P.sub};margin-top:8px;">Beauty at your fingertips</div>
      </td>
    </tr>
    <tr>
      <td>
        <div style="background:${P.card};border:1px solid ${P.border};border-radius:16px;padding:36px 32px;">
          ${content}
        </div>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding-top:28px;padding-bottom:8px;">
        <p style="font-family:${BODY};color:${P.sub};font-size:11px;letter-spacing:1.5px;">© CERVICED · cerviced.co</p>
        <p style="font-family:${BODY};color:${P.sub};font-size:11px;margin-top:6px;">You're receiving this because you have a CERVICED account.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Big display title plus the small caps kicker under it. */
function heading(P: EmailPalette, title: string, kicker: string) {
  return `
      <h1 style="font-family:${DISPLAY};font-size:26px;color:${P.text};letter-spacing:1px;line-height:1.3;margin-bottom:10px;">${title}</h1>
      <p style="font-family:${BODY};color:${P.accent};font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:24px;">${kicker}</p>`;
}

function paragraph(P: EmailPalette, html: string) {
  return `
      <p style="font-family:${BODY};color:${P.text};font-size:15px;line-height:1.7;margin-bottom:24px;">${html}</p>`;
}

/** Tinted panel with a caps label over a bulleted list. */
function bulletPanel(P: EmailPalette, label: string, items: string[]) {
  const rows = items
    .map(
      (item) => `
          <tr><td style="padding:6px 0;">
            <span style="color:${P.accent};font-size:15px;padding-right:10px;">✦</span>
            <span style="font-family:${BODY};color:${P.text};font-size:14px;">${item}</span>
          </td></tr>`,
    )
    .join('');
  return `
      <div style="background:${P.surface};border-radius:14px;padding:20px 24px;margin-bottom:28px;">
        <p style="font-family:${DISPLAY};color:${P.accent};font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">${label}</p>
        <table cellpadding="0" cellspacing="0" width="100%">${rows}
        </table>
      </div>`;
}

/** Tinted panel with a caps label over a numbered list. */
function stepPanel(P: EmailPalette, label: string, items: string[]) {
  const rows = items
    .map(
      (item, i) => `
          <tr><td style="padding:6px 0;">
            <span style="background:${P.accent};color:${P.onAccent};font-family:${DISPLAY};font-size:10px;letter-spacing:1px;padding:3px 9px;border-radius:100px;margin-right:10px;">${i + 1}</span>
            <span style="font-family:${BODY};color:${P.text};font-size:14px;">${item}</span>
          </td></tr>`,
    )
    .join('');
  return `
      <div style="background:${P.surface};border-radius:14px;padding:20px 24px;margin-bottom:28px;">
        <p style="font-family:${DISPLAY};color:${P.accent};font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">${label}</p>
        <table cellpadding="0" cellspacing="0" width="100%">${rows}
        </table>
      </div>`;
}

/** Quiet aside marked with an accent rule down its left edge. */
function note(P: EmailPalette, html: string, marginBottom = 28) {
  return `
      <div style="border-left:3px solid ${P.accent};padding-left:16px;margin-bottom:${marginBottom}px;">
        <p style="font-family:${BODY};color:${P.sub};font-size:13px;line-height:1.7;">${html}</p>
      </div>`;
}

function button(P: EmailPalette, href: string, label: string) {
  return `
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <a href="${href}" style="display:inline-block;background:${P.accent};color:${P.onAccent};font-family:${DISPLAY};font-size:14px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:15px 40px;border-radius:100px;">${label}</a>
          </td>
        </tr>
      </table>`;
}

function appHint(P: EmailPalette) {
  return `
      <p style="font-family:${BODY};color:${P.sub};font-size:12px;text-align:center;margin-top:24px;">Not working? Open the CERVICED app on your phone.</p>`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function clientWelcomeEmail(params: { name: string }) {
  const firstName = params.name.split(' ')[0] || 'there';
  return {
    subject: `Welcome to CERVICED, ${firstName} ✨`,
    html: emailWrapper(
      heading(CLIENT, `Welcome, ${firstName} ✨`, 'Your beauty journey starts now') +
        paragraph(
          CLIENT,
          "You're now part of CERVICED — the home of top beauty professionals near you. Book hair, nails, lashes, brows, MUA, and more, all in one place.",
        ) +
        bulletPanel(CLIENT, 'What you can do', [
          'Discover verified beauty providers',
          'Browse portfolios &amp; real work',
          'Book &amp; manage appointments',
          'Save your favourite providers',
        ]) +
        button(CLIENT, 'cerviced://home', 'Open CERVICED') +
        appHint(CLIENT),
      CLIENT,
    ),
  };
}

export function providerWelcomeEmail(params: { name: string; businessName?: string }) {
  const firstName = params.name.split(' ')[0] || 'there';
  const display = params.businessName || firstName;
  return {
    subject: `Welcome to CERVICED, ${display} — your profile is ready 🎉`,
    html: emailWrapper(
      heading(PROVIDER, "You're live on CERVICED 🎉", `Welcome to the platform, ${display}`) +
        paragraph(
          PROVIDER,
          "Your provider account is set up and ready. Clients across the platform can now discover your work. Here's how to get the most out of CERVICED from day one.",
        ) +
        stepPanel(PROVIDER, 'Get started', [
          'Complete your profile &amp; add a photo',
          'Upload your portfolio work',
          'Add your services &amp; pricing',
          'Set your availability',
        ]) +
        note(
          PROVIDER,
          'Providers with complete profiles and portfolio photos get significantly more bookings. Take 5 minutes to set yours up now.',
        ) +
        button(PROVIDER, 'cerviced://provider/profile', 'Set Up My Profile') +
        appHint(PROVIDER),
      PROVIDER,
    ),
  };
}

// The two templates below are for an account that ALREADY exists on CERVICED
// taking on its second hat, so neither may say "welcome to CERVICED" — the
// person has been here for months. clientWelcomeEmail/providerWelcomeEmail
// stay for genuinely new signups; these are what the switch flows send.

export function clientHatAddedEmail(params: { name: string }) {
  const firstName = params.name.split(' ')[0] || 'there';
  return {
    subject: `Your client side is ready, ${firstName} ✨`,
    html: emailWrapper(
      heading(CLIENT, 'You can book now too ✨', 'Client mode is on your account') +
        paragraph(
          CLIENT,
          `Hi ${firstName} — you've added a client profile to your CERVICED account. Same login, same business, one more thing you can do with it: book other beauty professionals for yourself.`,
        ) +
        bulletPanel(CLIENT, "What's new for you", [
          'Discover verified beauty providers',
          'Browse portfolios &amp; real work',
          'Book &amp; manage your own appointments',
          'Save your favourite providers',
        ]) +
        note(
          CLIENT,
          'Your provider profile, services and bookings are untouched. Switch between the two any time from your account screen — nothing you do as a client is visible to your own clients.',
        ) +
        button(CLIENT, 'cerviced://home', 'Start Browsing') +
        appHint(CLIENT),
      CLIENT,
    ),
  };
}

export function providerHatAddedEmail(params: { name: string; businessName?: string }) {
  const firstName = params.name.split(' ')[0] || 'there';
  const display = params.businessName || firstName;
  return {
    subject: `Your provider profile is set up, ${display} 🎉`,
    html: emailWrapper(
      heading(PROVIDER, "You're a provider now 🎉", 'Provider mode is on your account') +
        paragraph(
          PROVIDER,
          `Hi ${firstName} — you've added a provider profile to your CERVICED account. Here's what to do next so clients can find and book you.`,
        ) +
        stepPanel(PROVIDER, 'Get started', [
          'Complete your profile &amp; add a photo',
          'Upload your portfolio work',
          'Add your services &amp; pricing',
          'Set your availability',
        ]) +
        note(
          PROVIDER,
          'Your bookings and saved providers as a client are untouched. Switch between the two any time from your account screen.',
        ) +
        button(PROVIDER, 'cerviced://provider/profile', 'Set Up My Profile') +
        appHint(PROVIDER),
      PROVIDER,
    ),
  };
}

// Account-level rather than hat-specific — it can reach either hat, so it uses
// the app's base theme (the provider/shared palette) rather than picking one.
export function passwordChangedEmail(params: { name: string }) {
  const firstName = params.name.split(' ')[0] || 'there';
  return {
    subject: 'Your CERVICED password was changed',
    html: emailWrapper(
      heading(PROVIDER, 'Password changed', `Hi ${firstName}`) +
        paragraph(
          PROVIDER,
          'This confirms the password on your CERVICED account was just changed. You can use your new password to sign in from now on.',
        ) +
        note(
          PROVIDER,
          "If you made this change, no further action is needed. If you didn't, someone else may have access to your account — contact support@cerviced.co right away.",
          8,
        ) +
        appHint(PROVIDER),
      PROVIDER,
    ),
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
  const P = CLIENT;
  const row = (label: string, value: string) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid ${P.border};font-family:${DISPLAY};color:${P.accent};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap;vertical-align:top;">${label}</td>
            <td style="padding:10px 0 10px 16px;border-bottom:1px solid ${P.border};font-family:${BODY};color:${P.text};font-size:14px;text-align:right;">${value}</td>
          </tr>`;
  return {
    subject: `Booking confirmed — ${params.service} with ${params.providerName}`,
    html: emailWrapper(
      heading(P, 'Booking confirmed ✓', `Hi ${params.clientName}`) +
        paragraph(P, 'Your booking is confirmed. Here are the details:') +
        `
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">${row('Service', params.service)}${row('Provider', params.providerName)}${row('Date', params.date)}${row('Time', params.time)}${row('Location', params.location)}
      </table>` +
        note(P, 'Need to cancel or reschedule? Open the CERVICED app — your provider is notified either way.') +
        button(P, 'cerviced://home', 'View Booking') +
        appHint(P),
      P,
    ),
  };
}
