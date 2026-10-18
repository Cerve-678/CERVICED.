import { instantPayoutButtonLabel, instantPayoutConfirmation, instantPayoutFeeLine, instantPayoutFeePence } from '../utils/instantPayout';

const figures = { label: 'Monzo ••1234', currency: 'gbp', grossPence: 10000, netPence: 9850 };

test('the fee is the difference between what leaves Stripe and what arrives', () => {
  expect(instantPayoutFeePence(figures)).toBe(150);
});

test('the button names the amount that actually arrives', () => {
  expect(instantPayoutButtonLabel(figures)).toBe('Pay out £98.50 now');
});

test('the fee is shown before tapping and again in the confirmation', () => {
  expect(instantPayoutFeeLine(figures)).toContain('Instant fee £1.50');
  const { body } = instantPayoutConfirmation(figures);
  expect(body).toContain('From your Stripe balance: £100.00');
  expect(body).toContain('Instant fee: £1.50');
  expect(body).toContain('To Monzo ••1234: £98.50');
});
