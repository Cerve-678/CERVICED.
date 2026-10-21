jest.mock('../services/databaseService', () => ({}));

import { buildLinkOnlyGoLiveSteps } from '../features/providers/goLiveStatus';

const none = {
  logoSet: false,
  aboutSet: false,
  hoursSet: false,
  portfolioSet: false,
  portfolioCount: 0,
  hours: [],
  isLive: false,
};

describe('buildLinkOnlyGoLiveSteps', () => {
  it('has exactly the four things the server gates a link-only provider on', () => {
    expect(buildLinkOnlyGoLiveSteps(none).map(step => step.key)).toEqual([
      'logo',
      'about',
      'hours',
      'portfolio',
    ]);
  });

  it('ticks each step from its own field', () => {
    const steps = buildLinkOnlyGoLiveSteps({ ...none, logoSet: true, portfolioSet: true, portfolioCount: 3 });
    expect(steps.filter(step => step.done).map(step => step.key)).toEqual(['logo', 'portfolio']);
  });

  it('never asks a link-only provider for policies, services or an address', () => {
    const keys = buildLinkOnlyGoLiveSteps(none).map(step => step.key as string);
    for (const cervicedOnly of ['policies', 'services', 'address', 'payment', 'schedule']) {
      expect(keys).not.toContain(cervicedOnly);
    }
  });
});
