import { normalizeExternalBookingUrl } from '../features/providers/externalBookingLink';

describe('normalizeExternalBookingUrl', () => {
  it('keeps a full https booking link', () => {
    expect(normalizeExternalBookingUrl('https://www.fresha.com/a/studio-x')).toBe('https://www.fresha.com/a/studio-x');
  });

  it('adds https to a link typed without a scheme', () => {
    expect(normalizeExternalBookingUrl('  fresha.com/a/studio-x ')).toBe('https://fresha.com/a/studio-x');
  });

  it('refuses non-web schemes and junk', () => {
    expect(normalizeExternalBookingUrl('mailto:me@example.com')).toBeNull();
    expect(normalizeExternalBookingUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeExternalBookingUrl('not a link')).toBeNull();
    expect(normalizeExternalBookingUrl('')).toBeNull();
    expect(normalizeExternalBookingUrl(null)).toBeNull();
  });
});
