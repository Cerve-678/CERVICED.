// Pins the two rules the email redesign fixed, so they can't quietly come back.
//
// 1. A subject line is PLAIN TEXT. It used to be built from values the caller
//    had already escaped for HTML, so a service called "Gel manicure & art"
//    arrived in the inbox as "Gel manicure &amp; art".
// 2. A body is HTML. Escaping moved into the templates when it came out of the
//    callers, and a slot that was missed would put caller-controlled markup
//    into mail we send under our own domain.
//
// Both directions matter, and they pull against each other — which is exactly
// why the pair is worth a test rather than a comment.
//
// This file lives beside the templates rather than in src/tests/ because these
// are Deno modules importing with explicit .ts extensions; tsconfig.json
// excludes supabase/functions for that reason, and jest picks the file up here
// on its default testMatch regardless.
import {
  bookingConfirmationEmail,
  claimVerificationEmail,
  clientHatAddedEmail,
  clientWelcomeEmail,
  generalWelcomeEmail,
  passwordChangedEmail,
  providerHatAddedEmail,
  providerWelcomeEmail,
  supportRequestEmail,
} from './emailTemplates.ts';

/** No whitespace: firstNameOf() splits on it, so this survives whole. */
const HOSTILE = `<script>alert(1)</script>&"'`;
const AMPERSAND = 'Curls&Co';

const every = () => [
  ['clientWelcomeEmail', clientWelcomeEmail({ name: HOSTILE })],
  ['providerWelcomeEmail', providerWelcomeEmail({ name: HOSTILE, businessName: HOSTILE })],
  ['clientHatAddedEmail', clientHatAddedEmail({ name: HOSTILE })],
  ['providerHatAddedEmail', providerHatAddedEmail({ name: HOSTILE, businessName: HOSTILE })],
  ['passwordChangedEmail', passwordChangedEmail({ name: HOSTILE })],
  ['claimVerificationEmail', claimVerificationEmail({ code: HOSTILE, businessName: HOSTILE })],
  [
    'bookingConfirmationEmail',
    bookingConfirmationEmail({
      clientName: HOSTILE,
      providerName: HOSTILE,
      service: HOSTILE,
      date: HOSTILE,
      time: HOSTILE,
      location: HOSTILE,
    }),
  ],
  [
    'supportRequestEmail',
    supportRequestEmail({
      ticketRef: HOSTILE,
      category: HOSTILE,
      reporter: HOSTILE,
      description: HOSTILE,
      rows: [[HOSTILE, HOSTILE]],
    }),
  ],
  ['generalWelcomeEmail', generalWelcomeEmail({ name: HOSTILE })],
] as Array<[string, { subject: string; html: string }]>;

describe('email templates', () => {
  it.each(every())('%s never lets raw markup into the body', (_name, mail) => {
    expect(mail.html).not.toContain('<script');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it.each(every())('%s emits a subject and a body', (_name, mail) => {
    expect(mail.subject.length).toBeGreaterThan(0);
    expect(mail.html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  // The regression itself: an ampersand in a name is ordinary, and it is the
  // character that made the double-escaping visible.
  it('keeps subject lines as plain text, not HTML', () => {
    expect(
      bookingConfirmationEmail({
        clientName: 'Sarah',
        providerName: AMPERSAND,
        service: 'Gel manicure & art',
        date: 'Friday, 12 September 2026',
        time: '2:30 PM',
        location: '14 Rye Lane',
      }).subject,
    ).toBe('Booking confirmed — Gel manicure & art with Curls&Co');

    expect(providerWelcomeEmail({ name: 'Ada', businessName: AMPERSAND }).subject).toContain(
      AMPERSAND,
    );
    expect(providerWelcomeEmail({ name: 'Ada', businessName: AMPERSAND }).subject).not.toContain(
      '&amp;',
    );

    expect(
      supportRequestEmail({
        ticketRef: '#12',
        category: 'Booking Issue',
        reporter: `${AMPERSAND} — a@b.co`,
        description: 'x',
        rows: [],
      }).subject,
    ).toBe('#12 [Booking Issue] Curls&Co — a@b.co');
  });

  // ...while the same value is still escaped where it lands in HTML.
  it('escapes that same ampersand in the body', () => {
    expect(providerWelcomeEmail({ name: 'Ada', businessName: AMPERSAND }).html).toContain(
      'Curls&amp;Co',
    );
  });

  it('gives every email its own inbox preview line', () => {
    const previews = every().map(([, mail]) => {
      const match = mail.html.match(/mso-hide:all[^>]*>([^<]*)</);
      return match?.[1] ?? '';
    });
    for (const preview of previews) {
      expect(preview.length).toBeGreaterThan(10);
      // The masthead is what shows when there is no preheader at all.
      expect(preview).not.toContain('Beauty at your fingertips');
    }
    expect(new Set(previews).size).toBe(previews.length);
  });

  // The support report is the one email that goes to us, not to a user.
  it('does not tell the support inbox it has a CERVICED account', () => {
    const ops = supportRequestEmail({
      ticketRef: '#12',
      category: 'Other',
      reporter: 'a@b.co',
      description: 'x',
      rows: [],
    }).html;
    expect(ops).not.toContain('You&#39;re receiving this because you have a CERVICED account');
    expect(ops).not.toContain("You're receiving this because you have a CERVICED account");
    expect(ops).toContain('Support inbox');
  });
});
