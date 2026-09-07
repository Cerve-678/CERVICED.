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
// ESCAPING IS DONE HERE, not by the caller. Every value handed in is a name,
// service, address or free-typed report, and callers pass it RAW.
//
// It used to be the other way round — each function escaped before calling —
// and that quietly corrupted every subject line built from one of those
// values: a service called "Gel manicure & art" went out as
// "Booking confirmed — Gel manicure &amp; art", because a subject line is
// plain text and escaping it once for the body escaped it for the inbox too.
// A template knows which of its own interpolations are HTML and which are the
// subject; a caller cannot. So the escaping lives with that knowledge.
//
// ---------------------------------------------------------------------------
// The design: one letterhead, many letters
// ---------------------------------------------------------------------------
// The previous versions were structurally identical to each other — every
// email was the same white card with a display title, a small caps line under
// it, a paragraph, a tinted panel and a pill. A welcome, a booking receipt and
// a "your password changed" security notice all arrived looking like the same
// message, which is the one thing a transactional email must not do: the shape
// of the mail should tell you what it is before you read a word of it.
//
// So the shell is now shared and the CONTENT is what differs:
//
//   • A masthead on the page ground — the real brand mark, then the wordmark.
//     Branded before you reach the message, and before any image loads.
//   • A sheet with an accent cap — a solid bar of the hat's accent across the
//     top of the white sheet. It is a background colour, not an image, so it
//     survives blocked images and Outlook alike (Outlook drops the corner
//     radius and renders it square, which is a fine outcome).
//   • Eyebrow ABOVE the headline, not below it. The eyebrow classifies the
//     email ("Security notice", "Booking confirmed"); the headline states the
//     thing. The old order put an uppercase, letterspaced, bold accent
//     "HI SARAH" under the title, which spent the loudest type in the message
//     on a greeting.
//   • A hero module chosen per email rather than one generic panel: the
//     booking leads with the appointment, the claim email leads with the code,
//     the welcomes lead with a list of what to do next.
//   • A preheader on every template. Without one, the inbox preview line for
//     every email we send is the masthead — "CERVICED Beauty at your
//     fingertips" — which is the same for all of them and says nothing.
//
// Headline emoji were removed. They render inconsistently across clients,
// carry no meaning the words don't already, and read as decoration next to
// BakbakOne. Subject lines keep theirs — that is an inbox/open-rate decision,
// not a design one.
//
// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
// These are the app's own colours (src/constants/theme.ts, documented in
// DESIGN_SYSTEM.md), not an email-only invention.
//
// There are two palettes because the app has two hats, and an email belongs to
// the hat it is about: a client email is plum, a provider email is chocolate.
// Both are the LIGHT-mode values only, on purpose. Email clients' dark modes
// range from no support at all to inverting the whole message unasked, so a
// template that tries to follow the reader's theme reliably renders worse than
// one that commits to a single ground.
//
// rgba() tokens are pre-flattened to hex against the surface they actually sit
// on — Outlook drops rgba() outright and would leave the element transparent.

import { escapeHtml as esc } from './escapeHtml.ts';

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

const SUPPORT_ADDRESS = 'support@cerviced.co';

// Brand assets live in the `public` bucket rather than being attached or
// inlined: Gmail strips data: URIs, and an attachment is a spam signal.
// Hosted URLs are the only thing that reliably renders.
const BRAND_ASSETS =
  'https://ztrfpfvvejzaysrelmfm.supabase.co/storage/v1/object/public/public/brand';

/** The real mark — assets/CVD.png, resized to 400px. */
const BRAND_MARK = `${BRAND_ASSETS}/cerviced-mark.png`;

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

/**
 * The inbox preview line, hidden inside the message itself.
 *
 * The padding characters after it are deliberate: without them the client
 * pulls the next visible text into the preview and the preheader runs
 * straight into "CERVICED Beauty at your fingertips".
 */
function preheader(text: string) {
  const pad = '&#8199;&#65279;&#847; '.repeat(30);
  return `
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;opacity:0;">${text}</div>
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;opacity:0;">${pad}</div>`;
}

/**
 * The letterhead: masthead on the page ground, white sheet under an accent
 * cap, then the footer. Every transactional email is this shell plus content.
 */
function letter(
  P: EmailPalette,
  opts: {
    preview: string;
    content: string;
    /**
     * Who is reading. Everything here goes to a user except the support
     * report, which lands in our own inbox — and telling ourselves we're
     * receiving it "because you have a CERVICED account", above a support
     * address that is the recipient, is nonsense.
     */
    audience?: 'user' | 'internal';
  },
) {
  const footer = opts.audience === 'internal'
    ? `
          <p style="font-family:${BODY};color:${P.sub};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;">Support inbox</p>
          <p style="font-family:${BODY};color:${P.sub};font-size:11px;line-height:1.7;padding-top:12px;">Filed from Report a Problem in the CERVICED app. Reply to reach the reporter.</p>`
    : `
          <p style="font-family:${BODY};color:${P.sub};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;">Beauty at your fingertips</p>
          <p style="font-family:${BODY};color:${P.sub};font-size:12px;line-height:1.7;padding-top:14px;">Questions? <a href="mailto:${SUPPORT_ADDRESS}" style="color:${P.accent};text-decoration:underline;">${SUPPORT_ADDRESS}</a></p>
          <p style="font-family:${BODY};color:${P.sub};font-size:11px;line-height:1.7;padding-top:10px;">You're receiving this because you have a CERVICED account.<br />&copy; CERVICED &middot; cerviced.co</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <link href="${FONT_LINK}" rel="stylesheet" />
  <style>
    @import url('${FONT_LINK}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: ${P.bg}; font-family: ${BODY}; }
    a { color: ${P.accent}; }
  </style>
</head>
<body style="background:${P.bg};margin:0;padding:0;font-family:${BODY};">${preheader(opts.preview)}
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:${P.bg};">
    <tr><td align="center" style="padding:36px 16px 44px;">
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Masthead -->
        <tr><td align="center" style="padding-bottom:26px;">
          <img src="${BRAND_MARK}" alt="CERVICED" width="60" height="60" style="display:block;width:60px;height:60px;border-radius:16px;" />
          <div style="font-family:${DISPLAY};font-size:21px;letter-spacing:7px;color:${P.accent};line-height:1.2;padding-top:14px;">CERVICED</div>
        </td></tr>

        <!-- Sheet, capped in the hat's accent -->
        <tr><td>
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:${P.accent};border-radius:20px;">
            <tr><td style="padding-top:6px;font-size:0;line-height:0;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:${P.card};border-radius:0 0 20px 20px;">
                <tr><td style="padding:36px 30px 34px;">${opts.content}
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding-top:30px;">
          <div style="height:1px;line-height:1px;font-size:0;background:${P.border};margin-bottom:22px;">&nbsp;</div>${footer}
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------
// Shared so the templates below stay readable and can't drift apart one inline
// style at a time.

/** Classifies the email. Always sits above the headline. */
function eyebrow(P: EmailPalette, label: string) {
  return `
      <p style="font-family:${DISPLAY};color:${P.accent};font-size:11px;letter-spacing:2.6px;text-transform:uppercase;line-height:1.4;margin-bottom:12px;">${label}</p>`;
}

function headline(P: EmailPalette, title: string) {
  return `
      <h1 style="font-family:${DISPLAY};color:${P.text};font-size:27px;letter-spacing:0.4px;line-height:1.24;margin-bottom:18px;">${title}</h1>`;
}

function lede(P: EmailPalette, html: string) {
  return `
      <p style="font-family:${BODY};color:${P.text};font-size:15px;line-height:1.75;margin-bottom:26px;">${html}</p>`;
}

/** A tinted panel with a caps label — the base every hero module sits in. */
function panel(P: EmailPalette, label: string, inner: string, padBottom = 22) {
  return `
      <div style="background:${P.surface};border-radius:16px;padding:22px 24px ${padBottom}px;margin-bottom:26px;">
        <p style="font-family:${DISPLAY};color:${P.accent};font-size:11px;letter-spacing:2.4px;text-transform:uppercase;line-height:1.4;margin-bottom:14px;">${label}</p>${inner}
      </div>`;
}

/** Ticked list — "here is what you can now do". */
function checklistPanel(P: EmailPalette, label: string, items: string[]) {
  const rows = items
    .map(
      (item) => `
          <tr>
            <td width="22" valign="top" style="padding:7px 0;font-family:${BODY};color:${P.accent};font-size:14px;line-height:1.5;">&#10003;</td>
            <td valign="top" style="padding:7px 0;font-family:${BODY};color:${P.text};font-size:14px;line-height:1.5;">${item}</td>
          </tr>`,
    )
    .join('');
  return panel(
    P,
    label,
    `
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${rows}
        </table>`,
    18,
  );
}

/** Numbered list — "here is what to do next, in order". */
function stepsPanel(P: EmailPalette, label: string, items: string[]) {
  const rows = items
    .map(
      (item, i) => `
          <tr>
            <td width="34" valign="top" style="padding:7px 0;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr><td width="22" height="22" align="center" valign="middle" bgcolor="${P.accent}" style="background:${P.accent};border-radius:11px;font-family:${DISPLAY};color:${P.onAccent};font-size:11px;line-height:22px;">${i + 1}</td></tr>
              </table>
            </td>
            <td valign="top" style="padding:9px 0 7px;font-family:${BODY};color:${P.text};font-size:14px;line-height:1.5;">${item}</td>
          </tr>`,
    )
    .join('');
  return panel(
    P,
    label,
    `
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${rows}
        </table>`,
    18,
  );
}

/**
 * The appointment. Date and time are the largest things in the panel because
 * they are the reason the email exists — the previous version buried them as
 * rows three and four of a five-row table in 14px, right-aligned.
 */
function appointmentPanel(
  P: EmailPalette,
  a: { date: string; time: string; service: string; location: string },
) {
  const detail = (label: string, value: string) => `
          <tr><td style="padding:13px 0 0;border-top:1px solid ${P.border};">
            <div style="font-family:${DISPLAY};color:${P.sub};font-size:10px;letter-spacing:2px;text-transform:uppercase;line-height:1.4;">${label}</div>
            <div style="font-family:${BODY};color:${P.text};font-size:15px;line-height:1.6;padding:5px 0 13px;">${value}</div>
          </td></tr>`;
  return panel(
    P,
    'Your appointment',
    `
        <p style="font-family:${DISPLAY};color:${P.text};font-size:20px;letter-spacing:0.3px;line-height:1.3;">${a.date}</p>
        <p style="font-family:${DISPLAY};color:${P.accent};font-size:30px;letter-spacing:0.5px;line-height:1.2;padding:4px 0 20px;">${a.time}</p>
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${detail('Service', a.service)}${detail('Where', a.location)}
        </table>`,
    8,
  );
}

/** The one-time code, sized so it is unmistakably the point of the email. */
function codePanel(P: EmailPalette, code: string, expiry: string) {
  return `
      <div style="background:${P.surface};border-radius:16px;padding:26px 20px;text-align:center;margin-bottom:26px;">
        <div style="font-family:${DISPLAY};color:${P.accent};font-size:36px;letter-spacing:10px;line-height:1.1;">${code}</div>
        <div style="font-family:${BODY};color:${P.sub};font-size:11px;letter-spacing:2px;text-transform:uppercase;padding-top:14px;">${expiry}</div>
      </div>`;
}

/** Quiet aside marked with an accent rule down its left edge. */
function note(P: EmailPalette, html: string, marginBottom = 26) {
  return `
      <div style="border-left:3px solid ${P.accent};padding-left:16px;margin-bottom:${marginBottom}px;">
        <p style="font-family:${BODY};color:${P.sub};font-size:13px;line-height:1.7;">${html}</p>
      </div>`;
}

/**
 * Louder than note() — a full panel. For the "if this wasn't you" line on the
 * security and verification emails, which is the one part of those messages
 * that must not be skimmed past.
 */
function alertPanel(P: EmailPalette, label: string, html: string, marginBottom = 0) {
  return `
      <div style="background:${P.surface};border-left:3px solid ${P.accent};border-radius:0 16px 16px 0;padding:20px 22px;margin-bottom:${marginBottom}px;">
        <p style="font-family:${DISPLAY};color:${P.accent};font-size:11px;letter-spacing:2.4px;text-transform:uppercase;line-height:1.4;margin-bottom:9px;">${label}</p>
        <p style="font-family:${BODY};color:${P.text};font-size:13px;line-height:1.7;">${html}</p>
      </div>`;
}

/**
 * The call to action. Built on a table cell with a bgcolor attribute rather
 * than a styled <a> alone, so Outlook still paints the fill (it renders the
 * pill as a rectangle, which is the correct thing to degrade to).
 */
function button(P: EmailPalette, href: string, label: string) {
  return `
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
        <tr><td align="center">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr><td align="center" bgcolor="${P.accent}" style="background:${P.accent};border-radius:100px;">
              <a href="${href}" style="display:inline-block;color:${P.onAccent};font-family:${DISPLAY};font-size:14px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:16px 40px;">${label}</a>
            </td></tr>
          </table>
        </td></tr>
      </table>`;
}

function appHint(P: EmailPalette) {
  return `
      <p style="font-family:${BODY};color:${P.sub};font-size:12px;line-height:1.6;text-align:center;padding-top:20px;">Not working? Open the CERVICED app on your phone.</p>`;
}

/**
 * A first name, or nothing.
 *
 * Deliberately not defaulted to "there": the headlines below read as
 * sentences, and "You're in, there" is worse than "You're in".
 */
function firstNameOf(name: string | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function clientWelcomeEmail(params: { name: string }) {
  const first = firstNameOf(params.name);
  const P = CLIENT;
  return {
    subject: `Welcome to CERVICED${first ? `, ${first}` : ''} ✨`,
    html: letter(P, {
      preview: 'Your account is ready — find, book and keep the beauty pros worth going back to.',
      content:
        eyebrow(P, 'Welcome to CERVICED') +
        headline(P, `You're in${first ? `, ${esc(first)}` : ''}`) +
        lede(
          P,
          "You're now part of CERVICED — the home of top beauty professionals near you. Hair, nails, lashes, brows, makeup and skin, all bookable in one place.",
        ) +
        checklistPanel(P, 'What you can do', [
          'Discover verified beauty providers',
          'Browse portfolios of real work',
          'Book &amp; manage appointments',
          'Save your favourite providers',
        ]) +
        button(P, 'cerviced://home', 'Open CERVICED') +
        appHint(P),
    }),
  };
}

export function providerWelcomeEmail(params: { name: string; businessName?: string }) {
  const first = firstNameOf(params.name);
  const display = params.businessName || first;
  const P = PROVIDER;
  return {
    subject: `Welcome to CERVICED${display ? `, ${display}` : ''} — your profile is ready 🎉`,
    html: letter(P, {
      preview: 'Your provider account is set up. Four steps and clients can start booking you.',
      content:
        eyebrow(P, 'Welcome to CERVICED') +
        headline(P, `You're live${display ? `, ${esc(display)}` : ''}`) +
        lede(
          P,
          "Your provider account is set up and ready. Clients across the platform can now discover your work — here's how to get the most out of CERVICED from day one.",
        ) +
        stepsPanel(P, 'Get started', [
          'Complete your profile &amp; add your logo',
          'Upload your portfolio work',
          'Add your services &amp; pricing',
          'Set your availability',
        ]) +
        note(
          P,
          'Providers with complete profiles and portfolio photos get significantly more bookings. Take five minutes to set yours up now.',
        ) +
        button(P, 'cerviced://provider/profile', 'Set up my profile') +
        appHint(P),
    }),
  };
}

// The two templates below are for an account that ALREADY exists on CERVICED
// taking on its second hat, so neither may say "welcome to CERVICED" — the
// person has been here for months. clientWelcomeEmail/providerWelcomeEmail
// stay for genuinely new signups; these are what the switch flows send.

export function clientHatAddedEmail(params: { name: string }) {
  const first = firstNameOf(params.name);
  const P = CLIENT;
  return {
    subject: `You're a client now too${first ? `, ${first}` : ''} ✨`,
    html: letter(P, {
      preview: 'Same login, second hat — you can now book other beauty professionals for yourself.',
      content:
        eyebrow(P, 'Both hats, one account') +
        headline(P, "You're a client now too") +
        lede(
          P,
          `${first ? `Hi ${esc(first)} — your` : 'Your'} CERVICED account now wears both hats. You're still a provider, with your business exactly as you left it, and from today you're a client as well: you can book other beauty professionals for yourself, on the same login.`,
        ) +
        checklistPanel(P, "What's new for you", [
          'Discover verified beauty providers',
          'Browse portfolios of real work',
          'Book &amp; manage your own appointments',
          'Save your favourite providers',
        ]) +
        note(
          P,
          'Switch between your two hats any time from your account screen. Your provider profile, services and bookings are untouched, and nothing you do as a client is visible to your own clients.',
        ) +
        button(P, 'cerviced://home', 'Start browsing') +
        appHint(P),
    }),
  };
}

export function providerHatAddedEmail(params: { name: string; businessName?: string }) {
  const first = firstNameOf(params.name);
  const display = params.businessName || first;
  const P = PROVIDER;
  return {
    subject: `You're a provider now too${display ? `, ${display}` : ''} 🎉`,
    html: letter(P, {
      preview: 'Same login, second hat — set up your profile and clients can start booking you.',
      content:
        eyebrow(P, 'Both hats, one account') +
        headline(P, "You're a provider now too") +
        lede(
          P,
          `${first ? `Hi ${esc(first)} — your` : 'Your'} CERVICED account now wears both hats. You're still a client, with your bookings and saved providers exactly as they were, and from today you're a provider as well. Here's what to do next so clients can find and book you.`,
        ) +
        stepsPanel(P, 'Get started', [
          'Complete your profile &amp; add your logo',
          'Upload your portfolio work',
          'Add your services &amp; pricing',
          'Set your availability',
        ]) +
        note(
          P,
          'Switch between your two hats any time from your account screen — your client side carries on exactly as before.',
        ) +
        button(P, 'cerviced://provider/profile', 'Set up my profile') +
        appHint(P),
    }),
  };
}

// Account-level rather than hat-specific — it can reach either hat, so it uses
// the app's base theme (the provider/shared palette) rather than picking one.
export function passwordChangedEmail(params: { name: string }) {
  const first = firstNameOf(params.name);
  const P = PROVIDER;
  return {
    subject: 'Your CERVICED password was changed',
    html: letter(P, {
      preview: "If this wasn't you, contact support straight away.",
      content:
        eyebrow(P, 'Security notice') +
        headline(P, 'Your password was changed') +
        lede(
          P,
          `${first ? `Hi ${esc(first)} — this` : 'This'} confirms the password on your CERVICED account was just changed. You can use your new password to sign in from now on.`,
        ) +
        alertPanel(
          P,
          "Wasn't you?",
          `Someone else may have access to your account. Contact <a href="mailto:${SUPPORT_ADDRESS}" style="color:${P.accent};text-decoration:underline;">${SUPPORT_ADDRESS}</a> right away and we'll secure it. If you made the change yourself, there's nothing else to do.`,
        ),
    }),
  };
}

/**
 * The one-time code for claiming a scraped business listing. Provider-side, so
 * it takes the provider palette.
 *
 * The code is repeated in the preheader on purpose: on a phone that puts it in
 * the lock-screen notification, which is where it is most useful.
 */
export function claimVerificationEmail(params: { code: string; businessName?: string }) {
  const P = PROVIDER;
  const who = params.businessName ? ` for ${esc(params.businessName)}` : '';
  return {
    subject: `Your CERVICED verification code: ${params.code}`,
    html: letter(P, {
      preview: `${esc(params.code)} — your CERVICED verification code. Expires in 15 minutes.`,
      content:
        eyebrow(P, 'Claim your listing') +
        headline(P, 'Your verification code') +
        lede(
          P,
          `Someone asked to claim the CERVICED listing${who}. Enter this code in the app to confirm the business is yours:`,
        ) +
        codePanel(P, esc(params.code), 'Expires in 15 minutes') +
        alertPanel(
          P,
          "Didn't ask for this?",
          'You can ignore this email. The listing stays unclaimed, and nobody gets access to it without this code.',
        ),
    }),
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
  // Subject and preheader are plain text; everything below them is HTML.
  const e = {
    clientName: esc(params.clientName),
    providerName: esc(params.providerName),
    service: esc(params.service),
    date: esc(params.date),
    time: esc(params.time),
    location: esc(params.location),
  };
  return {
    subject: `Booking confirmed — ${params.service} with ${params.providerName}`,
    html: letter(P, {
      preview: `${e.service} with ${e.providerName} — ${e.date} at ${e.time}.`,
      content:
        eyebrow(P, 'Booking confirmed') +
        headline(P, `You're booked in with ${e.providerName}`) +
        lede(
          P,
          `Hi ${e.clientName} — that's all confirmed. Here's everything you need for your appointment.`,
        ) +
        appointmentPanel(P, {
          date: e.date,
          time: e.time,
          service: e.service,
          location: e.location,
        }) +
        note(
          P,
          'Need to cancel or reschedule? Open the CERVICED app — your provider is notified either way.',
        ) +
        button(P, 'cerviced://home', 'View booking') +
        appHint(P),
    }),
  };
}

// ---------------------------------------------------------------------------
// Support report — the one email that goes to US
// ---------------------------------------------------------------------------
// Everything else here is addressed to a user; this is the in-app "Report a
// Problem" form landing in the support inbox. It used to be built inline in
// send-support-request on the retired orchid brand (#a342c3) — the last
// surface still carrying it — with the reporter's words in the same weight as
// the metadata above them.
//
// It lives here now so it is part of the same system, and it is laid out for
// the job it actually does: the report reads first and largest, the metadata
// sits under it as reference, and the ticket ref is findable at a glance.
//
export function supportRequestEmail(params: {
  ticketRef: string;
  category: string;
  reporter: string;
  description: string;
  rows: Array<[string, string]>;
}) {
  const P = PROVIDER;
  const meta = params.rows
    .map(
      ([label, value]) => `
          <tr>
            <td valign="top" style="padding:7px 14px 7px 0;font-family:${DISPLAY};color:${P.sub};font-size:10px;letter-spacing:1.6px;text-transform:uppercase;line-height:1.6;white-space:nowrap;">${esc(label)}</td>
            <td valign="top" style="padding:7px 0;font-family:${BODY};color:${P.text};font-size:13px;line-height:1.6;word-break:break-word;">${esc(value)}</td>
          </tr>`,
    )
    .join('');
  return {
    subject: `${params.ticketRef} [${params.category}] ${params.reporter}`,
    html: letter(P, {
      audience: 'internal',
      preview: `${esc(params.category)} — ${esc(params.reporter)}`,
      content:
        eyebrow(P, `${esc(params.ticketRef)} &middot; ${esc(params.category)}`) +
        headline(P, esc(params.reporter)) +
        `
      <div style="border-left:3px solid ${P.accent};padding:2px 0 2px 16px;margin-bottom:26px;">
        <p style="font-family:${BODY};color:${P.text};font-size:15px;line-height:1.75;white-space:pre-wrap;">${esc(params.description)}</p>
      </div>` +
        panel(
          P,
          'Report details',
          `
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${meta}
        </table>`,
          18,
        ),
    }),
  };
}

// ---------------------------------------------------------------------------
// General welcome — the brand email
// ---------------------------------------------------------------------------
// Everything above is transactional: it confirms a thing that just happened,
// on the palette of the hat it happened to. This one is different in kind. It
// says what CERVICED *is* and what it offers, to someone who may have only
// just heard of it, so it gets its own editorial treatment rather than a
// fifth variation on the light transactional sheet.
//
// It runs on a deep aubergine ground with the real brand mark, and alternates
// dark and light panels so the two hats each get their own section in their
// own colour. Both hats are covered on purpose: a general welcome that only
// described booking would be selling half the product.

const BRAND = {
  ink:       '#2A1325', // deep aubergine — the ground
  onInk:     '#F7F1F4', // warm white — body text on the dark ground
  onInkSub:  '#C6A6BA', // muted plum-pink — secondary text on the dark ground
  rule:      '#4E2E45', // hairline on the dark ground
  blush:     '#FBF7F8', // client-side light panel (clientLightTheme bg)
  cream:     '#F5F1EC', // provider-side light panel (lightTheme bg)
  plum:      '#4A2340', // client accent — text on the light panels
  choc:      '#5C4033', // provider accent — text on the cream panel
  onLight:   '#000000',
  subLight:  '#8F7789',
  // Hairlines inside the light panels. Pre-flattened per panel because Outlook
  // drops rgba() and would render these as no rule at all — the same reason
  // the transactional palette above carries flattened tokens.
  ruleBlush: '#EAE3E6',
  ruleCream: '#E5DFD8',
};

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
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
        <tr><td align="center">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr><td align="center" bgcolor="${BRAND.blush}" style="background:${BRAND.blush};border-radius:100px;">
              <a href="${href}" style="display:inline-block;color:${BRAND.plum};font-family:${DISPLAY};font-size:14px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:17px 42px;">${label}</a>
            </td></tr>
          </table>
        </td></tr>
      </table>`;
}

/** Filled pill on a light panel — the secondary call to action. */
function brandButtonOnLight(href: string, label: string, colour: string) {
  return `
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
        <tr><td align="center">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr><td align="center" bgcolor="${colour}" style="background:${colour};border-radius:100px;">
              <a href="${href}" style="display:inline-block;color:#FFFFFF;font-family:${DISPLAY};font-size:13px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:15px 34px;">${label}</a>
            </td></tr>
          </table>
        </td></tr>
      </table>`;
}

/** A labelled offer line: bold term, then the plain-English explanation. */
function offerRow(term: string, copy: string, accent: string, rule: string) {
  return `
          <tr><td style="padding:11px 0;border-bottom:1px solid ${rule};">
            <div style="font-family:${DISPLAY};color:${accent};font-size:13px;letter-spacing:1.4px;text-transform:uppercase;line-height:1.4;margin-bottom:5px;">${term}</div>
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
  const first = firstNameOf(params.name);
  const greeting = first ? `Welcome, ${esc(first)}.` : 'Welcome.';
  const img = { ...BRAND_PHOTOS, ...(params.images ?? {}) };

  const heroImage = img.hero
    ? `
          <img src="${esc(img.hero)}" alt="" width="544" style="display:block;width:100%;max-width:544px;height:auto;border-radius:16px;margin:34px 0 0;" />`
    : '';

  const providerImage = img.provider
    ? `
            <img src="${esc(img.provider)}" alt="" width="500" style="display:block;width:100%;max-width:500px;height:auto;border-radius:12px;margin:0 0 24px;" />`
    : '';

  // Two columns of labelled tiles. The label is real text under each image,
  // not burnt into it, so a reader whose client blocks images still learns
  // what CERVICED covers — which is the whole job of this section.
  const tile = (t: { url: string; label: string }) => `
              <img src="${esc(t.url)}" alt="${esc(t.label)}" width="274" style="display:block;width:100%;height:auto;border-radius:12px;" />
              <p style="font-family:${DISPLAY};color:${BRAND.onInkSub};font-size:11px;letter-spacing:2px;text-transform:uppercase;line-height:1.4;padding-top:9px;">${esc(t.label)}</p>`;
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
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${gridRows.join('')}
          </table>`
    : `
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center"><tr>${chips}</tr></table>`;

  return {
    subject: 'Welcome to CERVICED — beauty at your fingertips',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <link href="${FONT_LINK}" rel="stylesheet" />
  <style>
    @import url('${FONT_LINK}');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: ${BRAND.ink}; font-family: ${BODY}; }
  </style>
</head>
<body style="background:${BRAND.ink};margin:0;padding:0;font-family:${BODY};">${preheader(
      'Find, book and keep the beauty professionals worth going back to — or run your own business on it.',
    )}
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:${BRAND.ink};">
    <tr><td align="center" style="padding:36px 16px 48px;">
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Mark -->
        <tr><td align="center" style="padding-bottom:34px;">
          <img src="${BRAND_MARK}" alt="CERVICED" width="84" height="84" style="display:block;width:84px;height:84px;border-radius:20px;" />
        </td></tr>

        <!-- Hero -->
        <tr><td align="center" style="padding:0 8px 44px;">
          <p style="font-family:${BODY};color:${BRAND.onInkSub};font-size:11px;letter-spacing:3px;text-transform:uppercase;line-height:1.4;margin-bottom:18px;">${greeting}</p>
          <h1 style="font-family:${DISPLAY};color:${BRAND.onInk};font-size:40px;line-height:1.12;letter-spacing:0.5px;margin-bottom:20px;">Beauty at your<br />fingertips</h1>
          <p style="font-family:${BODY};color:${BRAND.onInkSub};font-size:15px;line-height:1.75;max-width:420px;margin:0 auto 30px;">CERVICED is where you find, book and keep the beauty professionals worth going back to — hair, nails, lashes, brows, makeup and skin, all in one place.</p>
          ${brandButton('cerviced://home', 'Explore CERVICED')}${heroImage}
        </td></tr>

        <!-- What you'll find -->
        <tr><td align="center" style="padding:0 0 34px;">
          <p style="font-family:${DISPLAY};color:${BRAND.onInkSub};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;line-height:1.4;padding-bottom:18px;">What you'll find</p>
          ${whatYoullFind}
        </td></tr>

        <!-- Client side -->
        <tr><td style="padding-bottom:20px;">
          <div style="background:${BRAND.blush};border-radius:18px;padding:34px 30px;">
            <p style="font-family:${DISPLAY};color:${BRAND.plum};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;line-height:1.4;margin-bottom:10px;">For booking</p>
            <h2 style="font-family:${DISPLAY};color:${BRAND.onLight};font-size:24px;line-height:1.25;letter-spacing:0.5px;margin-bottom:22px;">Find someone brilliant, then keep them</h2>
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              ${offerRow('Discover', 'Search by service, area and availability — and see who can actually fit you in.', BRAND.plum, BRAND.ruleBlush)}
              ${offerRow('Real work', 'Every provider has a portfolio of what they have actually done, not stock photos.', BRAND.plum, BRAND.ruleBlush)}
              ${offerRow('Book &amp; manage', 'Book, reschedule or cancel in the app. Your provider is told either way.', BRAND.plum, BRAND.ruleBlush)}
              ${offerRow('Your people', 'Save the ones you love and rebook them in a couple of taps.', BRAND.plum, BRAND.ruleBlush)}
            </table>
          </div>
        </td></tr>

        <!-- Provider side -->
        <tr><td style="padding-bottom:40px;">
          <div style="background:${BRAND.cream};border-radius:18px;padding:34px 30px;">
            ${providerImage}<p style="font-family:${DISPLAY};color:${BRAND.choc};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;line-height:1.4;margin-bottom:10px;">For working</p>
            <h2 style="font-family:${DISPLAY};color:${BRAND.onLight};font-size:24px;line-height:1.25;letter-spacing:0.5px;margin-bottom:16px;">Or run your whole business on it</h2>
            <p style="font-family:${BODY};color:${BRAND.subLight};font-size:14px;line-height:1.7;margin-bottom:22px;">CERVICED is both sides of the chair. If you take clients yourself, your profile, portfolio, prices, diary and bookings all live here — and you can wear both hats on one account.</p>
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
              ${offerRow('Your profile', 'Logo, portfolio, services and pricing — the shopfront clients actually see.', BRAND.choc, BRAND.ruleCream)}
              ${offerRow('Your diary', 'Set your hours and notice period. Bookings land straight in your schedule.', BRAND.choc, BRAND.ruleCream)}
              ${offerRow('Your terms', 'Deposits, cancellation windows and policies, applied for you at booking.', BRAND.choc, BRAND.ruleCream)}
            </table>
            ${brandButtonOnLight('cerviced://provider/profile', 'Become a provider', BRAND.choc)}
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="border-top:1px solid ${BRAND.rule};padding-top:28px;">
          <p style="font-family:${DISPLAY};color:${BRAND.onInk};font-size:15px;letter-spacing:5px;line-height:1.4;margin-bottom:10px;">CERVICED</p>
          <p style="font-family:${BODY};color:${BRAND.onInkSub};font-size:12px;line-height:1.7;margin-bottom:10px;">Questions? <a href="mailto:${SUPPORT_ADDRESS}" style="color:${BRAND.onInk};text-decoration:underline;">${SUPPORT_ADDRESS}</a></p>
          <p style="font-family:${BODY};color:${BRAND.onInkSub};font-size:11px;line-height:1.7;">You're receiving this because you joined CERVICED.<br />&copy; CERVICED &middot; cerviced.co</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
