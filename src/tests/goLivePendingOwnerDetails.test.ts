import { buildGoLiveHeadline, buildGoLiveSteps, type GoLiveStatus } from '../features/providers/goLiveStatus';

const ready: GoLiveStatus = {
  scheduleSet: true,
  servicesSet: true,
  addressSet: true,
  profileCompleteSet: true,
  policiesSet: true,
  paymentSet: true,
  brandingSet: true,
  isLive: false,
};

test('a ready blank admin account explains the owner handover instead of a server mismatch', () => {
  const status = { ...ready, detailsPending: true };
  expect(buildGoLiveSteps(status).find(step => step.key === 'ownerDetails')).toMatchObject({
    done: false,
    blocking: true,
  });
  expect(buildGoLiveHeadline(status)).toMatchObject({
    tone: 'blocked',
    title: 'Account details needed before going live',
  });
  expect(buildGoLiveHeadline(status).detail).toContain('account holder');
});

test('the handover step disappears after owner details are saved', () => {
  expect(buildGoLiveSteps({ ...ready, detailsPending: false }).some(step => step.key === 'ownerDetails')).toBe(false);
});
