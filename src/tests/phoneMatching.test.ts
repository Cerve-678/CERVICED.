import { normalisePhoneForMatching } from '../utils/phoneMatching';

// These outputs were checked against the live social_normalise_phone() on
// 2026-11-08. If one changes, change the SQL too, or contacts stop matching.
describe('normalisePhoneForMatching', () => {
  it.each([
    ['07700 900123', '447700900123'],
    ['+44 7700 900123', '447700900123'],
    ['+44 (0)7700 900123', '447700900123'],
    ['0044 7700 900123', '447700900123'],
    ['+1 (415) 555-0100', '14155550100'],
  ])('%s → %s', (raw, expected) => {
    expect(normalisePhoneForMatching(raw)).toBe(expected);
  });

  it.each([['123'], [''], [null], [undefined], ['1234567890123456']])(
    'rejects %p',
    (raw) => {
      expect(normalisePhoneForMatching(raw)).toBeNull();
    },
  );
});
