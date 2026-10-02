import { buildSignupProfileRow } from '../utils/signupProfile';

describe('buildSignupProfileRow', () => {
  it('records the sign-in method it was given, not always email', () => {
    const row = buildSignupProfileRow({
      id: 'u1', email: 'x@privaterelay.appleid.com', meta: { name: 'Ada', role: 'user' }, loginMethod: 'apple',
    });
    expect(row['login_method']).toBe('apple');
    expect(row['email']).toBe('x@privaterelay.appleid.com');
  });

  it('keeps the date of birth the signup steps collected', () => {
    const row = buildSignupProfileRow({
      id: 'u1', email: 'a@b.com', meta: { role: 'user', dob: '1995-04-09' }, loginMethod: 'apple',
    });
    expect(row['dob']).toBe('1995-04-09');
  });

  it('stores a missing date of birth as null, never an empty string', () => {
    const row = buildSignupProfileRow({ id: 'u1', email: 'a@b.com', meta: { dob: '' }, loginMethod: 'email' });
    expect(row['dob']).toBeNull();
  });

  it('turns the client hat on for a client signup', () => {
    const row = buildSignupProfileRow({ id: 'u1', email: 'a@b.com', meta: { role: 'user' }, loginMethod: 'apple' });
    expect(row['role']).toBe('user');
    expect(row['has_client_profile']).toBe(true);
  });

  it('leaves has_client_profile out for a provider so an upsert cannot strip an existing hat', () => {
    const row = buildSignupProfileRow({ id: 'u1', email: 'a@b.com', meta: { role: 'provider' }, loginMethod: 'apple' });
    expect(row['role']).toBe('provider');
    expect('has_client_profile' in row).toBe(false);
  });

  it('maps the provider location answer onto location_text', () => {
    const row = buildSignupProfileRow({
      id: 'u1', email: 'a@b.com', meta: { role: 'provider', location: 'Hackney' }, loginMethod: 'email',
    });
    expect(row['location_text']).toBe('Hackney');
  });
});
