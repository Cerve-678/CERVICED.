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
          'Complete your profile &amp; add your logo',
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
    subject: `You're a client now too, ${firstName} ✨`,
    html: emailWrapper(
      heading(CLIENT, "You're a client now too ✨", 'Both hats, one account') +
        paragraph(
          CLIENT,
          `Hi ${firstName} — your CERVICED account now wears both hats. You're still a provider, with your business exactly as you left it, and from today you're a client as well: you can book other beauty professionals for yourself, on the same login.`,
        ) +
        bulletPanel(CLIENT, "What's new for you", [
          'Discover verified beauty providers',
          'Browse portfolios &amp; real work',
          'Book &amp; manage your own appointments',
          'Save your favourite providers',
        ]) +
        note(
          CLIENT,
          'Switch between your two hats any time from your account screen. Your provider profile, services and bookings are untouched, and nothing you do as a client is visible to your own clients.',
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
    subject: `You're a provider now too, ${display} 🎉`,
    html: emailWrapper(
      heading(PROVIDER, "You're a provider now too 🎉", 'Both hats, one account') +
        paragraph(
          PROVIDER,
          `Hi ${firstName} — your CERVICED account now wears both hats. You're still a client, with your bookings and saved providers exactly as they were, and from today you're a provider as well. Here's what to do next so clients can find and book you.`,
        ) +
        stepPanel(PROVIDER, 'Get started', [
          'Complete your profile &amp; add your logo',
          'Upload your portfolio work',
          'Add your services &amp; pricing',
          'Set your availability',
        ]) +
        note(
          PROVIDER,
          'Switch between your two hats any time from your account screen — your client side carries on exactly as before.',
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

// ---------------------------------------------------------------------------
// General welcome — the brand email
// ---------------------------------------------------------------------------
// Everything above is transactional: it confirms a thing that just happened,
// on the palette of the hat it happened to. This one is different in kind. It
// says what CERVICED *is* and what it offers, to someone who may have only
// just heard of it, so it gets its own editorial treatment rather than a
// fifth variation on the light transactional card.
//
// It runs on a deep aubergine ground with the real brand mark, and alternates
// dark and light panels so the two hats each get their own section in their
// own colour. Both hats are covered on purpose: a general welcome that only
// described booking would be selling half the product.

const BRAND = {
  ink:       '#2A1325', // deep aubergine — the ground
  inkRaised: '#3A1D33', // raised panel on the dark ground
  onInk:     '#F7F1F4', // warm white — body text on the dark ground
  onInkSub:  '#C6A6BA', // muted plum-pink — secondary text on the dark ground
  rule:      '#4E2E45', // hairline on the dark ground
  blush:     '#FBF7F8', // client-side light panel (clientLightTheme bg)
  cream:     '#F5F1EC', // provider-side light panel (lightTheme bg)
  plum:      '#4A2340', // client accent — text on the light panels
  choc:      '#5C4033', // provider accent — text on the cream panel
  onLight:   '#000000',
  subLight:  '#8F7789',
};

// Brand assets live in the `public` bucket rather than being attached or
// inlined: Gmail strips data: URIs, and an attachment on a marketing email is
// a spam signal. Hosted URLs are the only thing that reliably renders.
const BRAND_ASSETS =
  'https://ztrfpfvvejzaysrelmfm.supabase.co/storage/v1/object/public/public/brand';

/** The real mark — assets/CVD.png, resized to 400px. */
const BRAND_MARK = `${BRAND_ASSETS}/cerviced-mark.png`;

/**
 * The brand photography. Tiles are all cropped to 4:5 so the two grid columns
 * line up; a ragged grid is the tell that images were dropped in untouched.
 */
const BRAND_PHOTOS = {
  hero: `${BRAND_ASSETS}/hero-hair.jpg`,
  provider: `${BRAND_ASSETS}/cornrows.jpg`,
  grid: [
    { url: `${BRAND_ASSETS}/braids.jpg`, label: 'Braids' },
    { url: `${BRAND_ASSETS}/blonde.jpg`, label: 'Colour' },
    { url: `${BRAND_ASSETS}/nails.jpg`, label: 'Nails' },
    { url: `${BRAND_ASSETS}/makeup.jpg`, label: 'Makeup' },
  ],
};

const CATEGORIES = ['Hair', 'Nails', 'Lashes', 'Brows', 'Makeup', 'Skin'];

/** Blush pill on the dark ground — the primary call to action. */
function brandButton(href: string, label: string) {
  return `
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center">
          <a href="${href}" style="display:inline-block;background:${BRAND.blush};color:${BRAND.plum};font-family:${DISPLAY};font-size:14px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:16px 42px;border-radius:100px;">${label}</a>
        </td></tr>
      </table>`;
}

/** Outlined pill on a light panel — the secondary call to action. */
function brandButtonOutline(href: string, label: string, colour: string) {
  return `
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center">
          <a href="${href}" style="display:inline-block;background:${colour};color:#FFFFFF;font-family:${DISPLAY};font-size:13px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:14px 34px;border-radius:100px;">${label}</a>
        </td></tr>
      </table>`;
}

/** A labelled offer line: bold term, then the plain-English explanation. */
function offerRow(term: string, copy: string, accent: string) {
  return `
          <tr><td style="padding:11px 0;border-bottom:1px solid rgba(0,0,0,0.06);">
            <div style="font-family:${DISPLAY};color:${accent};font-size:13px;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:5px;">${term}</div>
            <div style="font-family:${BODY};color:${BRAND.subLight};font-size:14px;line-height:1.6;">${copy}</div>
          </td></tr>`;
}

/**
 * The general brand welcome.
 *
 * `images` is optional and every slot degrades to simply not being there:
 * a good half of mail clients block remote images by default, so the email
 * has to carry itself on type and colour alone regardless. Pass hosted URLs
 * (Supabase public storage) — never a data: URI, which Gmail strips.
 */
export function generalWelcomeEmail(params: {
  name?: string;
  images?: { hero?: string; provider?: string; grid?: { url: string; label: string }[] };
} = {}) {
  const firstName = (params.name ?? '').split(' ')[0];
  const greeting = firstName ? `Welcome, ${firstName}.` : 'Welcome.';
  const img = { ...BRAND_PHOTOS, ...(params.images ?? {}) };

  const heroImage = img.hero
    ? `
        <img src="${img.hero}" alt="" width="456" style="display:block;width:100%;max-width:456px;height:auto;border-radius:14px;margin:34px 0 0;" />`
    : '';

  const providerImage = img.provider
    ? `
          <img src="${img.provider}" alt="" width="404" style="display:block;width:100%;max-width:404px;height:auto;border-radius:12px;margin:0 0 24px;" />`
    : '';

  // Two columns of labelled tiles. The label is real text under each image,
  // not burnt into it, so a reader whose client blocks images still learns
  // what CERVICED covers — which is the whole job of this section.
  const tile = (t: { url: string; label: string }) => `
              <img src="${t.url}" alt="${t.label}" width="212" style="display:block;width:100%;height:auto;border-radius:12px;" />
              <p style="font-family:${DISPLAY};color:${BRAND.onInkSub};font-size:11px;letter-spacing:2px;text-transform:uppercase;padding-top:9px;">${t.label}</p>`;
  const grid = img.grid ?? [];
  const gridRows: string[] = [];
  for (let i = 0; i < grid.length; i += 2) {
    const left = grid[i];
    const right = grid[i + 1];
    gridRows.push(`
            <tr>
              <td width="50%" valign="top" style="padding:0 6px 18px 0;">${tile(left)}
              </td>
              <td width="50%" valign="top" style="padding:0 0 18px 6px;">${right ? tile(right) : ''}
              </td>
            </tr>`);
  }

  const chips = CATEGORIES.map(
    (c) => `<td style="padding:5px 4px;"><span style="display:inline-block;border:1px solid ${BRAND.rule};color:${BRAND.onInkSub};font-family:${BODY};font-size:12px;letter-spacing:1.2px;padding:8px 15px;border-radius:100px;white-space:nowrap;">${c}</span></td>`,
  ).join('');

  // The tiles say it better when they load; the chips are the fallback for
  // when there is no photography configured at all.
  const whatYoullFind = gridRows.length
    ? `
          <table cellpadding="0" cellspacing="0" width="100%">${gridRows.join('')}
          </table>`
    : `
          <table cellpadding="0" cellspacing="0" align="center"><tr>${chips}</tr></table>`;

  return {
    subject: 'Welcome to CERVICED — beauty at your fingertips',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${FONT_LINK}" rel="stylesheet" />
  <style>
    @import url('${FONT_LINK}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: ${BRAND.ink}; font-family: ${BODY}; }
  </style>
</head>
<body style="background:${BRAND.ink};padding:0;font-family:${BODY};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.ink};">
    <tr><td align="center" style="padding:36px 16px 48px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Mark -->
        <tr><td align="center" style="padding-bottom:34px;">
          <img src="${BRAND_MARK}" alt="CERVICED" width="84" height="84" style="display:block;width:84px;height:84px;border-radius:20px;" />
        </td></tr>

        <!-- Hero -->
        <tr><td align="center" style="padding:0 8px 44px;">
          <p style="font-family:${BODY};color:${BRAND.onInkSub};font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-bottom:18px;">${greeting}</p>
          <h1 style="font-family:${DISPLAY};color:${BRAND.onInk};font-size:38px;line-height:1.12;letter-spacing:0.5px;margin-bottom:20px;">Beauty at your<br />fingertips</h1>
          <p style="font-family:${BODY};color:${BRAND.onInkSub};font-size:15px;line-height:1.75;max-width:420px;margin:0 auto 30px;">CERVICED is where you find, book and keep the beauty professionals worth going back to — hair, nails, lashes, brows, makeup and skin, all in one place.</p>
          ${brandButton('cerviced://home', 'Explore CERVICED')}${heroImage}
        </td></tr>

        <!-- What you'll find -->
        <tr><td align="center" style="padding:0 0 34px;">
          <p style="font-family:${DISPLAY};color:${BRAND.onInkSub};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;padding-bottom:18px;">What you'll find</p>
          ${whatYoullFind}
        </td></tr>

        <!-- Client side -->
        <tr><td style="padding-bottom:20px;">
          <div style="background:${BRAND.blush};border-radius:18px;padding:34px 30px;">
            <p style="font-family:${DISPLAY};color:${BRAND.plum};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:10px;">For booking</p>
            <h2 style="font-family:${DISPLAY};color:${BRAND.onLight};font-size:24px;line-height:1.25;letter-spacing:0.5px;margin-bottom:22px;">Find someone brilliant, then keep them</h2>
            <table cellpadding="0" cellspacing="0" width="100%">
              ${offerRow('Discover', 'Search by service, area and availability — and see who can actually fit you in.', BRAND.plum)}
              ${offerRow('Real work', 'Every provider has a portfolio of what they have actually done, not stock photos.', BRAND.plum)}
              ${offerRow('Book &amp; manage', 'Book, reschedule or cancel in the app. Your provider is told either way.', BRAND.plum)}
              ${offerRow('Your people', 'Save the ones you love and rebook them in a couple of taps.', BRAND.plum)}
            </table>
          </div>
        </td></tr>

        <!-- Provider side -->
        <tr><td style="padding-bottom:40px;">
          <div style="background:${BRAND.cream};border-radius:18px;padding:34px 30px;">
            ${providerImage}<p style="font-family:${DISPLAY};color:${BRAND.choc};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:10px;">For working</p>
            <h2 style="font-family:${DISPLAY};color:${BRAND.onLight};font-size:24px;line-height:1.25;letter-spacing:0.5px;margin-bottom:16px;">Or run your whole business on it</h2>
            <p style="font-family:${BODY};color:${BRAND.subLight};font-size:14px;line-height:1.7;margin-bottom:22px;">CERVICED is both sides of the chair. If you take clients yourself, your profile, portfolio, prices, diary and bookings all live here — and you can wear both hats on one account.</p>
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
              ${offerRow('Your profile', 'Logo, portfolio, services and pricing — the shopfront clients actually see.', BRAND.choc)}
              ${offerRow('Your diary', 'Set your hours and notice period. Bookings land straight in your schedule.', BRAND.choc)}
              ${offerRow('Your terms', 'Deposits, cancellation windows and policies, applied for you at booking.', BRAND.choc)}
            </table>
            ${brandButtonOutline('cerviced://provider/profile', 'Become a provider', BRAND.choc)}
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="border-top:1px solid ${BRAND.rule};padding-top:28px;">
          <p style="font-family:${DISPLAY};color:${BRAND.onInk};font-size:15px;letter-spacing:5px;margin-bottom:10px;">CERVICED</p>
          <p style="font-family:${BODY};color:${BRAND.onInkSub};font-size:11px;letter-spacing:1.5px;margin-bottom:6px;">© CERVICED · cerviced.co</p>
          <p style="font-family:${BODY};color:${BRAND.onInkSub};font-size:11px;">You're receiving this because you joined CERVICED.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
