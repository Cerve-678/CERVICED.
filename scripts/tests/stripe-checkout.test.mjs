import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../supabase/functions/_shared/settleCheckout.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const { settleCheckout } = exports;

function fixture(overrides = {}) {
  const batch = { id: 'batch', user_id: 'user', status: 'prepared', currency: 'gbp',
    amount_due: 25, payment_intent_id: 'pi_test', expires_at: new Date(Date.now() + 60000).toISOString(), ...overrides };
  const intent = { id: 'pi_test', status: 'requires_capture', amount: 2500, amount_received: 0,
    currency: 'gbp', metadata: { checkout_batch_id: 'batch', user_id: 'user' } };
  const calls = [];
  const query = { select() { return this; }, eq() { return this; }, async single() { return { data: { ...batch }, error: null }; } };
  const admin = { from: () => query, rpc: async () => { calls.push('finalize'); batch.status = 'finalised'; return { error: null }; } };
  const stripe = { paymentIntents: {
    retrieve: async () => ({ ...intent }),
    capture: async (_id, _params, options) => {
      assert.equal(options.idempotencyKey, 'checkout_capture_batch');
      calls.push('capture'); intent.status = 'succeeded'; intent.amount_received = 2500; return { ...intent };
    },
    cancel: async () => { calls.push('cancel'); },
  }, refunds: { create: async (_params, options) => { assert.equal(options.idempotencyKey, 'checkout_refund_batch'); calls.push('refund'); } } };
  return { batch, intent, calls, admin, stripe };
}

test('capture succeeds before bookings are confirmed; replay does not capture twice', async () => {
  const f = fixture();
  assert.equal(await settleCheckout(f.admin, f.stripe, 'pi_test'), 'succeeded');
  assert.deepEqual(f.calls, ['capture', 'finalize']);
  assert.equal(await settleCheckout(f.admin, f.stripe, 'pi_test'), 'succeeded');
  assert.deepEqual(f.calls, ['capture', 'finalize']);
});
test('wrong amount cannot capture or confirm bookings', async () => {
  const f = fixture({ amount_due: 1 });
  await assert.rejects(settleCheckout(f.admin, f.stripe, 'pi_test'), /does not match/);
  assert.deepEqual(f.calls, []);
});
test('expired authorization is cancelled without charging', async () => {
  const f = fixture({ expires_at: '2020-01-01T00:00:00Z' });
  assert.equal(await settleCheckout(f.admin, f.stripe, 'pi_test'), 'canceled');
  assert.deepEqual(f.calls, ['cancel']);
});
test('captured payment with an expired reservation is refunded', async () => {
  const f = fixture({ status: 'expired' });
  f.intent.status = 'succeeded'; f.intent.amount_received = 2500;
  assert.equal(await settleCheckout(f.admin, f.stripe, 'pi_test'), 'refunded');
  assert.deepEqual(f.calls, ['refund']);
});
test('transient database failure is retried without cancelling captured money', async () => {
  const f = fixture();
  f.admin.rpc = async () => ({ error: new Error('database unavailable') });
  await assert.rejects(settleCheckout(f.admin, f.stripe, 'pi_test'), /database unavailable/);
  assert.deepEqual(f.calls, ['capture']);
});
test('concurrent webhook finalisation is accepted without refunding', async () => {
  const f = fixture();
  f.admin.rpc = async () => { f.batch.status = 'finalised'; return { error: new Error('already finalised') }; };
  assert.equal(await settleCheckout(f.admin, f.stripe, 'pi_test'), 'succeeded');
  assert.deepEqual(f.calls, ['capture']);
});
test('capture failure never creates bookings', async () => {
  const f = fixture();
  f.stripe.paymentIntents.capture = async () => { throw new Error('capture declined'); };
  await assert.rejects(settleCheckout(f.admin, f.stripe, 'pi_test'), /capture declined/);
  assert.deepEqual(f.calls, []);
});
