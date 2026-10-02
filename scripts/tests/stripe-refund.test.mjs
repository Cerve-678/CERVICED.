import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../../supabase/functions/_shared/reconcileRefund.ts', import.meta.url), 'utf8');
const exports = {};
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exports);

function fixture(status = 'held') {
  const writes = [];
  const payout = { id: 'payout', payout_amount: 2300, status, stripe_transfer_id: status === 'transferred' ? 'tr_test' : null };
  const admin = { from(table) {
    const query = { select() { return this; }, eq() { return this; }, in() { return this; },
      update(value) { writes.push({ table, value }); return this; },
      single: async () => ({ data: { id: 'booking', payment_intent_id: 'pi_test', amount_paid: 25 }, error: null }),
      maybeSingle: async () => ({ data: payout, error: null }),
    }; return query;
  } };
  const stripe = { transfers: { createReversal: async (id, params, options) => {
    assert.equal(id, 'tr_test'); assert.equal(params.amount, 2300);
    assert.equal(options.idempotencyKey, 'reversal_payout'); return { id: 'reversal' };
  } } };
  const refund = { id: 'refund', payment_intent: 'pi_test', amount: 2500, status: 'succeeded', created: 1700000000, metadata: { booking_id: 'booking' } };
  return { admin, stripe, refund, writes };
}
test('refund cancels an unreleased provider payout', async () => {
  const f = fixture(); await exports.reconcileRefund(f.admin, f.stripe, f.refund);
  assert.equal(f.writes[0].value.payment_status, 'refunded');
  assert.equal(f.writes[1].value.status, 'cancelled');
});
test('refund reverses an already transferred provider payout', async () => {
  const f = fixture('transferred'); await exports.reconcileRefund(f.admin, f.stripe, f.refund);
  assert.equal(f.writes[1].value.status, 'reversed');
  assert.equal(f.writes[1].value.stripe_reversal_id, 'reversal');
});
test('pending refund is tracked without claiming it succeeded', async () => {
  const f = fixture(); f.refund.status = 'pending';
  await exports.reconcileRefund(f.admin, f.stripe, f.refund);
  assert.deepEqual(f.writes, [{ table: 'bookings', value: { stripe_refund_id: 'refund' } }]);
});
test('wrong booking amount cannot mark a booking refunded', async () => {
  const f = fixture(); f.refund.amount = 2400;
  await assert.rejects(exports.reconcileRefund(f.admin, f.stripe, f.refund), /does not match/);
  assert.deepEqual(f.writes, []);
});
