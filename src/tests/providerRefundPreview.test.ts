import { previewProviderRefund } from '../features/bookings/paymentPresentation';

describe('previewProviderRefund', () => {
  it('a full refund moves everything the provider holds', () => {
    expect(previewProviderRefund(2000, 'full', '', false)).toEqual({ refundPence: 2000, keepPence: 0, error: null, isFull: true });
  });

  it('a partial refund keeps the rest', () => {
    expect(previewProviderRefund(2000, 'custom', '10', false)).toEqual({ refundPence: 1000, keepPence: 1000, error: null, isFull: false });
  });

  it('typing everything that is left becomes a full refund', () => {
    expect(previewProviderRefund(1000, 'custom', '10.00', false)).toMatchObject({ refundPence: 1000, keepPence: 0, isFull: true });
  });

  it('after a policy settlement, giving back all of the kept amount stays partial', () => {
    expect(previewProviderRefund(2000, 'custom', '20', true)).toMatchObject({ refundPence: 2000, isFull: false });
  });

  it('refuses more than is held, and nothing at all', () => {
    expect(previewProviderRefund(1000, 'custom', '10.01', false).error).toBe('You can refund at most £10.00.');
    expect(previewProviderRefund(1000, 'custom', '0', false).error).toBe('Enter an amount above £0.00.');
    expect(previewProviderRefund(1000, 'custom', '', false)).toMatchObject({ refundPence: 0, keepPence: 1000, error: null });
  });
});
