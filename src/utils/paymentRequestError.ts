const messages: Record<string, string> = {
  stripe_contact_email_required: 'Add an email address to your account before setting up Stripe.',
  provider_payments_unavailable: 'This provider has not finished setting up online payments. Please try again once their Stripe setup is complete.',
  checkout_expired: 'Your reservation has expired. Please review your booking and try again.',
  stripe_setup_unavailable: 'Stripe account setup is unavailable. Please try again or contact support.',
};

export class PaymentRequestError extends Error {}

/** Only known codes become user-facing messages; never render raw Stripe/DB errors. */
export async function getPaymentRequestError(error: unknown, data: unknown, fallback: string): Promise<PaymentRequestError> {
  const response = (error as { context?: { status?: number; json?: () => Promise<unknown> } } | null)?.context;
  let payload = data as { code?: string } | null;
  if (response?.json) {
    try { payload = await response.json() as { code?: string }; } catch { /* Non-JSON gateway response. */ }
  }
  if (response?.status === 401) return new PaymentRequestError('Your session has expired. Please sign in again.');
  return new PaymentRequestError((payload?.code && messages[payload.code]) || fallback);
}
