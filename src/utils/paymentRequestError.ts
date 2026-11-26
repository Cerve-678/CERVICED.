import { tr, type TranslationKey } from '../i18n';


// Keys, not text, so each message is built in the current language.
const messages: Record<string, TranslationKey> = {
  stripe_contact_email_required: 'cart.paymentError.emailRequired',
  provider_payments_unavailable: 'cart.paymentError.providerUnavailable',
  checkout_expired: 'cart.paymentError.checkoutExpired',
  stripe_setup_unavailable: 'cart.paymentError.setupUnavailable',
};

export class PaymentRequestError extends Error {}

/** Only known codes become user-facing messages; never render raw Stripe/DB errors. */
export async function getPaymentRequestError(error: unknown, data: unknown, fallback: string): Promise<PaymentRequestError> {
  const response = (error as { context?: { status?: number; json?: () => Promise<unknown> } } | null)?.context;
  let payload = data as { code?: string; until?: string } | null;
  if (response?.json) {
    try { payload = await response.json() as { code?: string; until?: string }; } catch { /* Non-JSON gateway response. */ }
  }
  if (response?.status === 401) return new PaymentRequestError(tr('cart.paymentError.sessionExpired'));
  if (payload?.code === 'card_needed_for_fee') {
    // `until` is the server's own UK-time label, e.g. "3:00pm on Thu 2 Jul".
    const until = typeof payload.until === 'string' && payload.until.length <= 40 ? ` after ${payload.until}` : ' once the fee window closes';
    return new PaymentRequestError(`This card is needed for a late or no-show fee you agreed to. You can remove it${until}.`);
  }
  const key = payload?.code ? messages[payload.code] : undefined;
  return new PaymentRequestError(key ? tr(key) : fallback);
}
