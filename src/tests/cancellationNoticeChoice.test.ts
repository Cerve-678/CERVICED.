import { noticeChoiceForHours, noticeHoursToSave } from '../utils/policyDisplay';

describe('one cancellation window for Policies and Automations', () => {
  it('shows the window actually applied', () => {
    expect(noticeChoiceForHours(12)).toBe('12h');
    expect(noticeChoiceForHours(24)).toBe('24h');
    expect(noticeChoiceForHours(72)).toBe('72h');
  });

  it('lets an unset column defer to the written choice, unless asked for "none"', () => {
    expect(noticeChoiceForHours(0)).toBeNull();
    expect(noticeChoiceForHours(null)).toBeNull();
    expect(noticeChoiceForHours(0, { zeroIsNone: true })).toBe('none');
  });

  it('has no choice for a window neither screen offers', () => {
    expect(noticeChoiceForHours(36)).toBeNull();
  });

  it('applies a newly picked notice', () => {
    expect(noticeHoursToSave('48h', '24h')).toBe(48);
    expect(noticeHoursToSave('12h', '24h')).toBe(12);
    expect(noticeHoursToSave('none', '24h')).toBe(0);
  });

  it("leaves the window alone when it wasn't changed", () => {
    expect(noticeHoursToSave('24h', '24h')).toBeNull();
    expect(noticeHoursToSave('', '')).toBeNull();
  });
});
