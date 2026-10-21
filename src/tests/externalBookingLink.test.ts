import { displayExternalBookingUrl, normalizeExternalBookingUrl } from '../features/providers/externalBookingLink';

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

describe('displayExternalBookingUrl', () => {
  it('drops the scheme, www. and a trailing slash', () => {
    expect(displayExternalBookingUrl('https://www.fresha.com/a/ellies-nails/')).toBe('fresha.com/a/ellies-nails');
    expect(displayExternalBookingUrl('fresha.com/a/studio')).toBe('fresha.com/a/studio');
    expect(displayExternalBookingUrl('https://studio.as.me/')).toBe('studio.as.me');
  });

  it('keeps a query string, which some booking pages need', () => {
    expect(displayExternalBookingUrl('https://app.acuityscheduling.com/schedule.php?owner=123')).toBe('app.acuityscheduling.com/schedule.php?owner=123');
  });

  it('is null when there is no usable link', () => {
    expect(displayExternalBookingUrl(null)).toBeNull();
    expect(displayExternalBookingUrl('  ')).toBeNull();
    expect(displayExternalBookingUrl('mailto:me@studio.com')).toBeNull();
  });
});
