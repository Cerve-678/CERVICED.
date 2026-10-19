import {
  formatSavedCardExpiry,
  savedCardBadge,
  savedCardBrandName,
  savedCardExpiryLabel,
  savedCardExpiryState,
} from '../features/payments/savedCards';

// 18 October 2026
const NOW = new Date(2026, 9, 18);

describe('saved card presentation', () => {
  it('pads the expiry to MM/YY', () => {
    expect(formatSavedCardExpiry({ expMonth: 8, expYear: 2028 })).toBe('08/28');
  });

  it('treats a card as valid through the end of its expiry month', () => {
    expect(savedCardExpiryState({ expMonth: 10, expYear: 2026 }, NOW)).toBe('soon');
    expect(savedCardExpiryLabel({ expMonth: 10, expYear: 2026 }, NOW)).toBe('Expires this month');
  });

  it('flags next month as soon, and later months as fine', () => {
    expect(savedCardExpiryLabel({ expMonth: 11, expYear: 2026 }, NOW)).toBe('Expires next month');
    expect(savedCardExpiryState({ expMonth: 12, expYear: 2026 }, NOW)).toBe('ok');
    expect(savedCardExpiryLabel({ expMonth: 12, expYear: 2026 }, NOW)).toBe('Expires 12/26');
  });

  it('handles a December-to-January year boundary', () => {
    const december = new Date(2026, 11, 3);
    expect(savedCardExpiryLabel({ expMonth: 1, expYear: 2027 }, december)).toBe('Expires next month');
  });

  it('marks a past card as expired', () => {
    expect(savedCardExpiryState({ expMonth: 9, expYear: 2026 }, NOW)).toBe('expired');
    expect(savedCardExpiryLabel({ expMonth: 9, expYear: 2026 }, NOW)).toBe('Expired 09/26');
  });

  it('names known brands and falls back for unknown ones', () => {
    expect(savedCardBrandName('mastercard')).toBe('Mastercard');
    expect(savedCardBrandName('unknown')).toBe('Card');
    expect(savedCardBadge('visa')).toBe('VISA');
    expect(savedCardBadge('jcb')).toBe('CARD');
  });
});
