import { myProfileTourSteps } from '../features/providers/myProfileTour';

describe('myProfileTourSteps', () => {
  it('walks the top of My Profile in screen order', () => {
    const keys = myProfileTourSteps({ isLive: true, hasQrButton: true }).map(s => s.key);
    expect(keys).toEqual(['logo', 'edit', 'shortcuts', 'tabs', 'status']);
  });

  it('says the logo only opens the client view once live', () => {
    const live = myProfileTourSteps({ isLive: true, hasQrButton: true })[0]!;
    const notLive = myProfileTourSteps({ isLive: false, hasQrButton: true })[0]!;
    expect(live.body).toBe('Tap your logo to see your page the way clients see it.');
    expect(notLive.body).toMatch(/^Once you’re live/);
  });

  it('only mentions the QR code when the QR button is there', () => {
    const withQr = myProfileTourSteps({ isLive: true, hasQrButton: true }).find(s => s.key === 'shortcuts')!;
    const withoutQr = myProfileTourSteps({ isLive: true, hasQrButton: false }).find(s => s.key === 'shortcuts')!;
    expect(withQr.body).toContain('QR code');
    expect(withoutQr.body).not.toContain('QR');
  });

  it('keeps step keys unique', () => {
    const keys = myProfileTourSteps({ isLive: false, hasQrButton: false }).map(s => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
