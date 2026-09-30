import { isServiceRoleToken } from '../../supabase/functions/_shared/serviceRoleToken';

// Unsigned test tokens: the helper reads claims only, the gateway verifies the
// signature (verify_jwt = true on send-booking-confirmation).
const b64url = (o: object) =>
  Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (claims: object) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.sig`;

describe('isServiceRoleToken', () => {
  it('accepts a service_role token', () => {
    expect(isServiceRoleToken(token({ role: 'service_role', iss: 'supabase' }))).toBe(true);
  });

  it('refuses anon and signed-in user tokens', () => {
    expect(isServiceRoleToken(token({ role: 'anon' }))).toBe(false);
    expect(isServiceRoleToken(token({ role: 'authenticated', sub: 'abc' }))).toBe(false);
  });

  it('refuses a token with no role claim', () => {
    expect(isServiceRoleToken(token({ iss: 'supabase' }))).toBe(false);
  });

  it('refuses empty, malformed and non-JSON input without throwing', () => {
    expect(isServiceRoleToken('')).toBe(false);
    expect(isServiceRoleToken('not-a-jwt')).toBe(false);
    expect(isServiceRoleToken('a.b.c')).toBe(false);
    expect(isServiceRoleToken(`x.${Buffer.from('nope').toString('base64')}.y`)).toBe(false);
  });
});
