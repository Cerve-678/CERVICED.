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
  feePaymentRequestEmail,
  generalWelcomeEmail,
  LINK_ONLY_GO_LIVE_STEPS,
  linkOnlyClientHatAddedEmail,
  linkOnlyGoLiveReminderEmail,
  linkOnlyHatAddedEmail,
  linkOnlyLiveEmail,
  linkOnlyWelcomeEmail,
  passwordChangedEmail,
  providerHatAddedEmail,
  providerWelcomeEmail,
  recoveryCodeEmail,
  refundRequestedProviderEmail,
  payoutFailedSupportEmail,
  moneySummaryEmail,
  signupCodeEmail,
  supportRequestEmail,
} from './emailTemplates.ts';

/** No whitespace: firstNameOf() splits on it, so this survives whole. */
const HOSTILE = `<script>alert(1)</script>&"'`;
const AMPERSAND = 'Curls&Co';

const BOOKING = {
  providerName: 'Amara Lash Studio',
  service: 'Classic lash full set',
  date: 'Wednesday, 14 October 2026',
  time: '2:30pm',
  location: '12 Rose Street',
  reference: 'CRV-7K2QMX',
  basePrice: 65,
  addOns: [{ name: 'Lash bath', price: 8 }],
  serviceCharge: 1.99,
  depositAmount: 0,
  amountPaid: 74.99,
  paymentType: 'full',
  paymentStatus: 'fully_paid',
};

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
      ...BOOKING,
      providerName: HOSTILE,
      service: HOSTILE,
      date: HOSTILE,
      time: HOSTILE,
      location: HOSTILE,
      reference: HOSTILE,
      addOns: [{ name: HOSTILE, price: 5 }],
    }),
  ],
  [
    'refundRequestedProviderEmail',
    refundRequestedProviderEmail({
      clientName: HOSTILE,
      service: HOSTILE,
      date: HOSTILE,
      time: HOSTILE,
      reason: HOSTILE,
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
  ['linkOnlyWelcomeEmail', linkOnlyWelcomeEmail({ name: HOSTILE, businessName: HOSTILE })],
  ['linkOnlyHatAddedEmail', linkOnlyHatAddedEmail({ name: HOSTILE, businessName: HOSTILE })],
  ['linkOnlyLiveEmail', linkOnlyLiveEmail({ name: HOSTILE, businessName: HOSTILE })],
  ['linkOnlyClientHatAddedEmail', linkOnlyClientHatAddedEmail({ name: HOSTILE })],
  [
    'linkOnlyGoLiveReminderEmail',
    linkOnlyGoLiveReminderEmail({ name: HOSTILE, businessName: HOSTILE, remaining: [HOSTILE] }),
  ],
  [
    'payoutFailedSupportEmail',
    payoutFailedSupportEmail({
      kind: 'transfer', provider: HOSTILE, amount: HOSTILE, booking: HOSTILE, why: HOSTILE, tries: HOSTILE, nextStep: HOSTILE,
    }),
  ],
  [
    'moneySummaryEmail',
    moneySummaryEmail({
      failed: [{ title: HOSTILE, amount: HOSTILE }],
      owed: [{ title: HOSTILE, amount: HOSTILE }],
      refunds: [{ title: HOSTILE, amount: HOSTILE }],
      unsentRefunds: [{ title: HOSTILE, amount: HOSTILE }],
    }),
  ],
] as Array<[string, { subject: string; html: string }]>;

describe('email templates', () => {
  it.each(every())('%s never lets raw markup into the body', (_name, mail) => {
    expect(mail.html).not.toContain('<script');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  // Emails never follow the reader's dark mode (user, 2026-10-19).
  it.each(every())('%s asks mail apps to keep it light', (_name, mail) => {
    expect(mail.html).toContain('<meta name="color-scheme" content="light only" />');
    expect(mail.html).toContain('color-scheme: light only');
    expect(mail.html).not.toMatch(/prefers-color-scheme:\s*dark/);
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
        ...BOOKING,
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

describe('booking confirmation money', () => {
  it('itemises the services, the platform fee and a pay-in-full total', () => {
    const { html } = bookingConfirmationEmail(BOOKING);
    expect(html).toContain('Lash bath');
    expect(html).toContain('Cerviced platform fee');
    expect(html).toContain('£74.99');
    expect(html).toContain('Paid in full');
    expect(html).toContain('Due at Appointment');
    expect(html).toContain('£0.00');
  });

  it('tells a client who paid in full that they paid, using the status the database stores', () => {
    const { html } = bookingConfirmationEmail({ ...BOOKING, paymentStatus: 'fully_paid' });
    expect(html).toContain('Paid in full');
    expect(html).toContain('>Paid<');
    expect(html).toContain('£74.99');
    expect(html).not.toContain('Awaiting payment');
    expect(html).not.toContain('Due to provider');
  });

  it('shows a deposit as what left the card and what remains', () => {
    const { html } = bookingConfirmationEmail({
      ...BOOKING,
      paymentType: 'deposit',
      paymentStatus: 'deposit_paid',
      depositAmount: 20,
      amountPaid: 21.99,
    });
    // £65 + £8 add-on + £1.99 fee = £74.99 total; £21.99 paid, £53.00 left.
    expect(html).toContain('Deposit paid');
    expect(html).toContain('>Paid (incl. fee)<');
    expect(html).toContain('£21.99');
    expect(html).toContain('Due at Appointment');
    expect(html).toContain('£53.00');
    expect(html).not.toContain('Due to provider');
  });

  it('lists a paid deposit under the total, with the payment', () => {
    const { html } = bookingConfirmationEmail({
      ...BOOKING,
      paymentType: 'deposit',
      paymentStatus: 'deposit_paid',
      depositAmount: 20,
      amountPaid: 21.99,
    });
    const depositLine = html.search(/>Deposit paid<\/td>\s*<td[^>]*>£20\.00</);
    expect(depositLine).toBeGreaterThan(-1);
    expect(depositLine).toBeGreaterThan(html.indexOf('>Total<'));
    expect(depositLine).toBeLessThan(html.indexOf('>Paid (incl. fee)<'));
  });

  it('leaves the deposit line out until the deposit is paid, and on a full payment', () => {
    const unpaid = bookingConfirmationEmail({
      ...BOOKING, paymentType: 'deposit', paymentStatus: 'pending', depositAmount: 20, amountPaid: 0,
    }).html;
    expect(unpaid).not.toMatch(/>Deposit paid<\/td>/);
    expect(bookingConfirmationEmail(BOOKING).html).not.toMatch(/>Deposit paid<\/td>/);
  });

  it('never calls a hand-added unpaid booking paid in full', () => {
    const { html } = bookingConfirmationEmail({
      ...BOOKING,
      serviceCharge: 0,
      amountPaid: 0,
      paymentType: 'full',
      paymentStatus: 'pending',
    });
    expect(html).not.toContain('Paid in full');
    expect(html).toContain('Awaiting payment');
    expect(html).not.toContain('platform fee');
    expect(html).toContain('£73.00');
  });

  // Link-only pros book on their own page: nothing sent to them may tell them
  // to add services, prices or availability, which they don't have here.
  it.each([
    ['linkOnlyWelcomeEmail', linkOnlyWelcomeEmail({ name: 'Ada', businessName: 'Ada Lashes' })],
    ['linkOnlyHatAddedEmail', linkOnlyHatAddedEmail({ name: 'Ada', businessName: 'Ada Lashes' })],
    ['linkOnlyLiveEmail', linkOnlyLiveEmail({ name: 'Ada', businessName: 'Ada Lashes' })],
    ['linkOnlyClientHatAddedEmail', linkOnlyClientHatAddedEmail({ name: 'Ada' })],
  ])('%s never asks a link-only pro for services, pricing or availability', (_name, mail) => {
    expect(mail.html).not.toMatch(/services &amp; pricing|availability|services and bookings/i);
  });

  it('lists the four link-only go-live steps in the welcome', () => {
    const { html } = linkOnlyWelcomeEmail({ name: 'Ada' });
    for (const step of LINK_ONLY_GO_LIVE_STEPS) expect(html).toContain(step);
  });

  it('counts only the steps still left in the reminder', () => {
    expect(linkOnlyGoLiveReminderEmail({ name: 'Ada', remaining: ['Add your logo'] }).subject)
      .toBe("You're one step from going live on CERVICED");
    const two = linkOnlyGoLiveReminderEmail({ name: 'Ada', remaining: ['Add your logo', 'Write your About'] });
    expect(two.subject).toBe("You're 2 steps from going live on CERVICED");
    expect(two.html).toContain('Write your About');
    expect(two.html).not.toContain('Set your opening hours');
  });
});

describe('fee payment request email', () => {
  const base = {
    name: 'Sam Lee', amount: '£15.00', feeLabel: 'no-show fee', providerName: AMPERSAND,
    service: 'Classic lash full set', payBy: 'Mon 26 Oct',
    payUrl: 'https://invoice.stripe.com/i/acct_1/test_abc?s=ap&x=1',
  };

  it('names the amount and provider in a plain-text subject', () => {
    expect(feePaymentRequestEmail(base).subject).toBe('Please pay your £15.00 no-show fee to Curls&Co');
  });

  it('escapes every caller value in the body, including the link', () => {
    const { html } = feePaymentRequestEmail({ ...base, providerName: HOSTILE, service: HOSTILE });
    expect(html).not.toContain('<script>');
    expect(html).toContain('href="https://invoice.stripe.com/i/acct_1/test_abc?s=ap&amp;x=1"');
    expect(html).toContain('Mon 26 Oct');
  });
});

describe('refundRequestedProviderEmail', () => {
  it('says the payout is on hold only when there is one', () => {
    const base = { clientName: 'Amy', service: 'Lash lift', date: '18 Oct', time: '2:30pm', reason: 'The provider cancelled' };
    expect(refundRequestedProviderEmail({ ...base, heldPence: 4500 }).html).toContain('Your £45.00 for this booking is on hold');
    expect(refundRequestedProviderEmail(base).html).not.toContain('on hold');
    expect(refundRequestedProviderEmail({ ...base, heldPence: 0 }).html).not.toContain('on hold');
  });
});

// These two are rendered to static HTML that Supabase fills in itself. What must
// survive is the literal placeholder: escaped or dropped, every user would get a
// code email with no code in it.
describe('Supabase Auth code emails', () => {
  for (const [name, email] of [
    ['signup', signupCodeEmail()],
    ['recovery', recoveryCodeEmail()],
  ] as const) {
    it(`${name}: puts the code in the subject and the inbox preview`, () => {
      expect(email.subject).toContain('{{ .Token }}');
      expect(email.html).toMatch(/\{\{ \.Token \}\} is your CERVICED/);
    });

    it(`${name}: draws six boxes, and shows the code whole if it is not six digits`, () => {
      for (let i = 0; i < 6; i++) {
        expect(email.html).toContain(`{{ slice .Token ${i} ${i + 1} }}`);
      }
      // Slicing a shorter token fails the render, and Supabase then sends nothing.
      const guard = email.html.indexOf('{{ if eq (len .Token) 6 }}');
      const fallback = email.html.indexOf('{{ else }}');
      expect(guard).toBeGreaterThan(-1);
      expect(email.html.indexOf('{{ slice .Token 0 1 }}')).toBeGreaterThan(guard);
      expect(email.html.indexOf('{{ slice .Token 5 6 }}')).toBeLessThan(fallback);
      expect(email.html.indexOf('{{ .Token }}', fallback)).toBeGreaterThan(fallback);
      expect(email.html.indexOf('{{ end }}')).toBeGreaterThan(fallback);
    });

    it(`${name}: names the address and has no script`, () => {
      expect(email.html).toContain('{{ .Email }}');
      expect(email.html).not.toMatch(/<script/i);
    });
  }

  it('makes signup and reset different at a glance', () => {
    const accentBox = 'bgcolor="#5C4033"';
    expect(recoveryCodeEmail().html).toContain(accentBox);
    expect(signupCodeEmail().html).not.toContain(accentBox);
  });

  it('does not tell someone they have an account when they may not', () => {
    expect(signupCodeEmail().html).not.toContain('you have a CERVICED account');
    expect(recoveryCodeEmail().html).not.toContain('you have a CERVICED account');
  });
});
