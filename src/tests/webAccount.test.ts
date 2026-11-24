import { cleanSignInCode, dobForAccount, webAccountState } from '../web/webAccount';

const complete = { name: 'Amara Lee', phone: '07700 900123', dob: '1994-03-08', role: 'user' as const, has_client_profile: true };

describe('webAccountState', () => {
  it('is ready when the account has a name, mobile and date of birth', () => {
    expect(webAccountState(complete)).toEqual({ kind: 'ready' });
  });

  it('asks for whatever a new email-code account is missing', () => {
    expect(webAccountState({ ...complete, name: '', phone: null, dob: null })).toEqual({
      kind: 'details',
      missing: ['name', 'phone', 'dob'],
    });
    expect(webAccountState({ ...complete, phone: '  ' })).toEqual({ kind: 'details', missing: ['phone'] });
  });

  it("stops a provider account with no client profile, as the app does", () => {
    expect(webAccountState({ ...complete, role: 'provider', has_client_profile: false })).toEqual({ kind: 'providerOnly' });
  });

  it('lets a provider who also has a client profile book', () => {
    expect(webAccountState({ ...complete, role: 'provider', has_client_profile: true })).toEqual({ kind: 'ready' });
  });
});

describe('dobForAccount', () => {
  it('writes the date the way the users row stores it', () => {
    expect(dobForAccount('8', '3', '1994')).toBe('1994-03-08');
    expect(dobForAccount(' 21 ', '11', '2001')).toBe('2001-11-21');
  });
});

describe('cleanSignInCode', () => {
  it('keeps the six digits of a typed or pasted code', () => {
    expect(cleanSignInCode('123 456')).toBe('123456');
    expect(cleanSignInCode('Your code: 98-76-54-3')).toBe('987654');
  });
});
