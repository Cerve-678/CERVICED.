import { buildConversionSteps, CONVERSION_TAB_TICK_AFTER_STEP, countLeftToGoLive } from '../features/providers/conversionSteps';
import type { GoLiveStatus } from '../features/providers/goLiveStatus';

const status = (overrides: Partial<GoLiveStatus> = {}): GoLiveStatus => ({
  scheduleSet: true,
  servicesSet: false,
  addressSet: false,
  profileCompleteSet: true,
  policiesSet: false,
  paymentSet: true,
  brandingSet: true,
  isLive: false,
  ...overrides,
});

describe('the converting-your-profile checklist', () => {
  it('never says bookings are moved: a link-only provider has none in CERVICED', () => {
    for (const live of [true, false, null]) {
      for (const step of buildConversionSteps(live)) {
        expect(`${step.label} ${step.lead}`).not.toMatch(/mov(e|ing)/i);
      }
    }
  });

  it('only says they came off Search when they really did', () => {
    expect(buildConversionSteps(false).map(s => s.label)).toContain("Taking you off Search until you're live");
    expect(buildConversionSteps(null).map(s => s.label)).toContain("Taking you off Search until you're live");
    const live = buildConversionSteps(true).map(s => s.label);
    expect(live).toContain('Keeping you on Search');
    expect(live.join(' ')).not.toMatch(/off Search/);
  });

  it('ticks the last tab with the last step', () => {
    const steps = buildConversionSteps(false);
    expect(CONVERSION_TAB_TICK_AFTER_STEP).toHaveLength(4);
    expect(CONVERSION_TAB_TICK_AFTER_STEP[CONVERSION_TAB_TICK_AFTER_STEP.length - 1]).toBe(steps.length);
  });

  it('counts only the go-live steps the server actually gates on', () => {
    // services, address and policies are missing; the About text (not blocking) is ignored.
    expect(countLeftToGoLive(status({ profileCompleteSet: false }))).toBe(3);
    expect(countLeftToGoLive(status({ servicesSet: true, addressSet: true, policiesSet: true, isLive: true }))).toBe(0);
  });
});
