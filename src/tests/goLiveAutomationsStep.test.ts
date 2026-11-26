import {
  buildGoLiveHeadline,
  buildGoLiveSteps,
  deriveAutomationsSet,
  type GoLiveStatus,
} from '../features/providers/goLiveStatus';
import type { DbProvider } from '../types/database';

const base: GoLiveStatus = {
  scheduleSet: true,
  servicesSet: true,
  addressSet: true,
  profileCompleteSet: true,
  policiesSet: true,
  paymentSet: true,
  brandingSet: true,
  isLive: true,
};

const automationsStep = (status: GoLiveStatus) =>
  buildGoLiveSteps(status).find(step => step.key === 'automations');

describe('Profile Health automations step', () => {
  it('is recommended, never blocking', () => {
    expect(automationsStep({ ...base, automationsSet: false })).toMatchObject({
      label: 'Set your automations',
      done: false,
      blocking: false,
    });
  });

  it('keeps a live provider live while it is outstanding', () => {
    expect(buildGoLiveHeadline({ ...base, automationsSet: false }).tone).toBe('liveWithExtras');
    expect(buildGoLiveHeadline({ ...base, automationsSet: true }).tone).toBe('live');
  });

  it('is absent where the caller leaves it out (Home, link-only)', () => {
    expect(automationsStep(base)).toBeUndefined();
    expect(automationsStep({ ...base, automationsSet: undefined })).toBeUndefined();
  });

  it('ticks once Automations has been saved, not when another screen wrote the column', () => {
    const row = (settings: DbProvider['automation_settings']) =>
      ({ automation_settings: settings }) as DbProvider;
    expect(deriveAutomationsSet(row(null))).toBe(false);
    expect(deriveAutomationsSet(row({ scheduleReleaseDay: 1, depositRequiredNew: true }))).toBe(false);
    expect(deriveAutomationsSet(row({ clientReminderTiming: [] }))).toBe(true);
    expect(deriveAutomationsSet(row({ clientReminderTiming: ['24h'] }))).toBe(true);
  });
});
