// Accounts v2 creates the same Express recipient used by the existing transfer
// flow. Stripe supports retrieving these accounts through the v1 API, including
// hosted onboarding, login links and snapshot account.updated events.
export async function createConnectedAccount(
  secret: string,
  providerId: string,
  userId: string,
  contactEmail: string,
  request: typeof fetch = fetch,
): Promise<{ id: string }> {
  if (!contactEmail?.trim()) throw new Error('A contact email is required for Stripe setup');
  const response = await request('https://api.stripe.com/v2/core/accounts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      'Stripe-Version': '2026-08-26.dahlia',
      'Idempotency-Key': `connect_account_v2_email_${providerId}`,
    },
    body: JSON.stringify({
      contact_email: contactEmail.trim(),
      identity: { country: 'gb' },
      dashboard: 'express',
      defaults: {
        currency: 'gbp',
        responsibilities: { fees_collector: 'application', losses_collector: 'application' },
      },
      configuration: {
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
      },
      metadata: { provider_id: providerId, user_id: userId },
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    // Log Stripe's message on the server only; clients receive a stable code.
    throw new Error(`Stripe account creation failed (${response.status}): ${data?.error?.message ?? 'Unknown error'}`);
  }
  if (typeof data?.id !== 'string' || !data.id.startsWith('acct_')) {
    throw new Error('Stripe returned an invalid account');
  }
  return { id: data.id };
}
