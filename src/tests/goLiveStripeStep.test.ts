import { buildGoLiveSteps, type GoLiveStatus } from '../features/providers/goLiveStatus';

/**
 * The Stripe go-live step is BLOCKING but conditional: it exists only when
 * `stripeSet` is present (the feature flag decides that upstream, in
 * deriveStripeGoLiveField). These tests pin the step-emission contract that
 * keeps the checklist honest against the server gate — the whole reason
 * goLiveStatus.ts warns "never add a blocking step the server doesn't gate on".
 */

const base: GoLiveStatus = {
  scheduleSet: true,
  servicesSet: true,
  addressSet: true,
  profileCompleteSet: true,
  policiesSet: true,
  paymentSet: true,
  brandingSet: true,
  isLive: false,
};

const stripeStep = (status: GoLiveStatus) =>
  buildGoLiveSteps(status).find(step => step.key === 'stripe');

describe('go-live Stripe step', () => {
  it('is absent when stripeSet is undefined (feature off)', () => {
    // Byte-for-byte the pre-Stripe checklist: six blocking steps, no stripe.
    const steps = buildGoLiveSteps({ ...base, stripeSet: undefined });
    expect(stripeStep({ ...base, stripeSet: undefined })).toBeUndefined();
    expect(steps.filter(s => s.blocking)).toHaveLength(6);
  });

  it('replaces the deposit row with one blocking Stripe row when the feature is on', () => {
    const steps = buildGoLiveSteps({ ...base, stripeSet: false });
    const step = stripeStep({ ...base, stripeSet: false });
    expect(step?.blocking).toBe(true);
    expect(step?.done).toBe(false);
    expect(steps.find(s => s.key === 'payment')).toBeUndefined();
    // Still six blocking steps: the deposit row became the Stripe row.
    expect(steps.filter(s => s.blocking)).toHaveLength(6);
  });

  it('is done only once Stripe AND the deposit choice are both set', () => {
    expect(stripeStep({ ...base, stripeSet: true })?.done).toBe(true);
    // The server still gates on the deposit choice, so Stripe alone can't tick it.
    expect(stripeStep({ ...base, stripeSet: true, paymentSet: false })?.done).toBe(false);
  });

  it('sits where the deposit row was, after policies and before the logo', () => {
    const keys = buildGoLiveSteps({
      ...base,
      stripeSet: false,
      portfolioSet: false,
      termsSet: false,
    }).map(s => s.key);
    expect(keys.indexOf('stripe')).toBe(keys.indexOf('policies') + 1);
    expect(keys.indexOf('stripe')).toBeLessThan(keys.indexOf('logo'));
  });
});
