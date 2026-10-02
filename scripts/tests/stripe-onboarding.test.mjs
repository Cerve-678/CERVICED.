import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function moduleAt(path) {
  const exports = {};
  new Function('exports', ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(exports);
  return exports;
}
const { createConnectedAccount } = moduleAt('../../supabase/functions/_shared/createConnectedAccount.ts');
const { getPaymentRequestError } = moduleAt('../../src/utils/paymentRequestError.ts');

test('creates an Express transfer recipient with Accounts v2 and stable idempotency', async () => {
  const result = await createConnectedAccount('test-only-placeholder', 'provider', 'user', 'provider@example.com', async (url, options) => {
    assert.equal(url, 'https://api.stripe.com/v2/core/accounts');
    assert.equal(options.headers['Idempotency-Key'], 'connect_account_v2_email_provider');
    assert.equal(options.headers['Stripe-Version'], '2026-08-26.dahlia');
    const body = JSON.parse(options.body);
    assert.equal(body.contact_email, 'provider@example.com');
    assert.equal(body.dashboard, 'express');
    assert.equal(body.configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested, true);
    assert.equal(body.defaults.responsibilities.losses_collector, 'application');
    return Response.json({ id: 'acct_test' });
  });
  assert.equal(result.id, 'acct_test');
});
test('does not persist an account when Stripe rejects creation', async () => {
  await assert.rejects(createConnectedAccount('placeholder', 'provider', 'user', 'provider@example.com', async () =>
    Response.json({ error: { message: 'Account configuration rejected' } }, { status: 400 })), /configuration rejected/);
});
test('surfaces provider setup errors from Supabase HTTP responses', async () => {
  const error = await getPaymentRequestError({ context: Response.json({ code: 'provider_payments_unavailable' }, { status: 409 }) }, null, 'Fallback');
  assert.match(error.message, /provider has not finished/);
});
test('never exposes unknown backend error text', async () => {
  const error = await getPaymentRequestError({ context: Response.json({ error: 'private backend details' }, { status: 500 }) }, null, 'Please try again.');
  assert.equal(error.message, 'Please try again.');
});
test('expired sessions get a sign-in instruction', async () => {
  const error = await getPaymentRequestError({ context: new Response('', { status: 401 }) }, null, 'Fallback');
  assert.match(error.message, /sign in again/);
});

test('missing contact email is rejected before calling Stripe', async () => {
  let called = false;
  await assert.rejects(createConnectedAccount('placeholder', 'provider', 'user', ' ', async () => {
    called = true;
    return Response.json({ id: 'acct_test' });
  }), /contact email is required/);
  assert.equal(called, false);
});

const { parseStripeConnectReturn } = moduleAt('../../src/utils/stripeConnectReturn.ts');
test('accepts only exact Stripe Connect app return routes', () => {
  assert.equal(parseStripeConnectReturn('cerviced://stripe-connect?result=return'), 'return');
  assert.equal(parseStripeConnectReturn('cerviced://stripe-connect?result=refresh'), 'refresh');
  for (const url of ['https://stripe-connect?result=return', 'cerviced://stripe-connect.evil?result=return',
    'cerviced://stripe-connect/other?result=return', 'cerviced://stripe-connect?result=approved',
    'cerviced://stripe-redirect?result=return', 'bad url']) {
    assert.equal(parseStripeConnectReturn(url), null);
  }
});

const { readProviderFinance } = moduleAt('../../supabase/functions/_shared/providerFinance.ts');
test('finance reads are scoped to the provider account and strip bank/private fields', async () => {
  const stripe = {
    balance: { retrieve: async (params, scope) => {
      assert.deepEqual(scope, { stripeAccount: 'acct_own' });
      return { livemode: false, available: [{ amount: 1200, currency: 'gbp', source_types: { card: 1200 } }], pending: [{ amount: 500, currency: 'eur' }] };
    } },
    payouts: { list: async (params, scope) => {
      assert.deepEqual(scope, { stripeAccount: 'acct_own' });
      assert.deepEqual(params, { limit: 20, starting_after: 'po_previous' });
      return { has_more: true, data: [{ id: 'po_next', amount: 1200, currency: 'gbp', status: 'in_transit', arrival_date: 123, created: 100, automatic: true, destination: 'bank_private', metadata: { private: true } }] };
    } },
  };
  const result = await readProviderFinance(stripe, 'acct_own', 'po_previous');
  assert.deepEqual(result.available, [{ amount: 1200, currency: 'gbp' }]);
  assert.deepEqual(result.pending, [{ amount: 500, currency: 'eur' }]);
  assert.equal(result.payouts[0].status, 'in_transit');
  assert.equal(result.payouts[0].arrivalDate, 123);
  assert.equal(result.hasMore, true);
  assert.equal('destination' in result.payouts[0], false);
  assert.equal('metadata' in result.payouts[0], false);
});
test('unconnected provider never reads the platform balance', async () => {
  const result = await readProviderFinance({}, null);
  assert.equal(result.connected, false);
  assert.deepEqual(result.available, []);
  assert.deepEqual(result.payouts, []);
});
test('Stripe failure is not converted into a zero balance', async () => {
  await assert.rejects(readProviderFinance({
    balance: { retrieve: async () => { throw new Error('unavailable'); } },
    payouts: { list: async () => ({ data: [], has_more: false }) },
  }, 'acct_own'), /unavailable/);
});
