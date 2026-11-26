import { validateOptionalEmail } from '../utils/validation';

// Provider sign-up's BUSINESS EMAIL is optional (like BUSINESS PHONE): leaving
// it blank must never block Continue, but a typed value still has to look like
// an email so a typo doesn't get saved as the business contact.
describe('validateOptionalEmail', () => {
  it('accepts a blank field', () => {
    expect(validateOptionalEmail('')).toBeNull();
  });

  it('treats only spaces as blank', () => {
    expect(validateOptionalEmail('   ')).toBeNull();
  });

  it('accepts a valid email, ignoring surrounding spaces', () => {
    expect(validateOptionalEmail('hello@glowstudio.com')).toBeNull();
    expect(validateOptionalEmail('  hello@glowstudio.com ')).toBeNull();
  });

  it('rejects something typed that is not an email', () => {
    expect(validateOptionalEmail('hello@glowstudio')).toBe('Enter a valid email');
    expect(validateOptionalEmail('glowstudio.com')).toBe('Enter a valid email');
  });
});
