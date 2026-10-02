export type StripeConnectReturn = { result: 'return' | 'refresh'; receivedAt: number };

export function parseStripeConnectReturn(value: string): StripeConnectReturn['result'] | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'cerviced:' || url.hostname !== 'stripe-connect' ||
        (url.pathname !== '' && url.pathname !== '/') || url.username || url.password) return null;
    const result = url.searchParams.get('result');
    return result === 'return' || result === 'refresh' ? result : null;
  } catch { return null; }
}
