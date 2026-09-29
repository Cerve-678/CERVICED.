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

  it('appears as a blocking, not-done step when stripeSet is false', () => {
    const step = stripeStep({ ...base, stripeSet: false });
    expect(step).toBeDefined();
    expect(step?.blocking).toBe(true);
    expect(step?.done).toBe(false);
    // Seventh blocking step once the feature is on.
    expect(buildGoLiveSteps({ ...base, stripeSet: false }).filter(s => s.blocking))
      .toHaveLength(7);
  });

  it('appears as done when stripeSet is true', () => {
    const step = stripeStep({ ...base, stripeSet: true });
    expect(step?.blocking).toBe(true);
    expect(step?.done).toBe(true);
  });

  it('sits with the money steps, before the recommended portfolio/terms', () => {
    const keys = buildGoLiveSteps({
      ...base,
      stripeSet: false,
      portfolioSet: false,
      termsSet: false,
    }).map(s => s.key);
    expect(keys.indexOf('stripe')).toBeGreaterThan(keys.indexOf('payment'));
    expect(keys.indexOf('stripe')).toBeLessThan(keys.indexOf('portfolio'));
  });
});
