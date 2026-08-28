import { dobToParts } from '../utils/dateUtils';

// The client→provider upgrade enters signup at Step 3, skipping the step where
// a provider normally gives their date of birth. AuthContext reads `dob != null`
// as a provider's client-hat marker, so a provider created without one loses
// their client hat on the next launch — these cover the prefill that stops the
// switch flow re-asking for a DOB the account already has.
describe('dobToParts', () => {
  it('splits a stored DOB into the three fields signup collects', () => {
    expect(dobToParts('1994-07-02')).toEqual({ dobDay: '02', dobMonth: '07', dobYear: '1994' });
  });

  it('returns nothing to spread when the account has no DOB', () => {
    // Apple Sign-In never supplies one, which is the case that exposed the bug.
    expect(dobToParts(null)).toEqual({});
    expect(dobToParts(undefined)).toEqual({});
    expect(dobToParts('')).toEqual({});
  });

  it('does not half-fill from a malformed value', () => {
    // A partial spread would leave the form looking answered while validateDob
    // still rejects it, so an incomplete value must yield nothing at all.
    expect(dobToParts('1994-07')).toEqual({});
    expect(dobToParts('1994')).toEqual({});
  });

  it('round-trips into the YYYY-MM-DD the upgrade writes back', () => {
    const parts = dobToParts('2001-11-30') as { dobDay: string; dobMonth: string; dobYear: string };
    const rebuilt = `${parts.dobYear}-${parts.dobMonth.padStart(2, '0')}-${parts.dobDay.padStart(2, '0')}`;
    expect(rebuilt).toBe('2001-11-30');
  });
});
